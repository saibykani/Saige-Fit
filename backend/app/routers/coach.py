from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, current_user
from app.core.config import Settings, get_settings
from app.core.db import Rest, get_db
from app.core.limits import AI_LIMIT, limiter
from app.services import coach as cs
from app.services import coach_safety
from app.services.ai_data import has_feature, utc_today

router = APIRouter(prefix="/v1/coach", tags=["coach"])
IdPath = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,64}$")]


def get_llm(s: Settings = Depends(get_settings)) -> cs.LLM:
    if not s.anthropic_api_key:
        raise HTTPException(503, "The AI coach is not configured")
    return cs.ClaudeCoach(s.anthropic_api_key, s.chat_model)


def get_optional_llm(s: Settings = Depends(get_settings)) -> cs.LLM | None:
    return cs.ClaudeCoach(s.anthropic_api_key, s.chat_model) if s.anthropic_api_key else None


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=cs.MAX_MESSAGE_CHARS)
    conversation_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,64}$")


@router.post("/chat")
@limiter.limit(AI_LIMIT)
async def chat(request: Request, body: ChatIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db),
               llm: cs.LLM = Depends(get_llm)):
    message = body.message.strip()
    if not message:
        raise HTTPException(422, "Message is empty")

    # Safety first: red-flag messages get a fixed, careful reply. No LLM call, no plan gating, nothing stored.
    flagged = coach_safety.check(message)
    if flagged:
        return {"conversation_id": body.conversation_id, "reply": flagged.reply, "suggestions": [],
                "safety": flagged.category}

    if not await has_feature(db, user.id, "ai_assistant"):
        raise HTTPException(402, "'ai_assistant' is not included in your plan")
    me = await db.select("users", select="ai_consent_at", id=f"eq.{user.id}")
    if not me or not me[0].get("ai_consent_at"):
        raise HTTPException(403, "Please accept AI data processing before using the coach")

    if body.conversation_id:
        convo = await db.select("ai_conversations", select="id", id=f"eq.{body.conversation_id}", user_id=f"eq.{user.id}")
        if not convo:
            raise HTTPException(404, "Conversation not found")
        cid = body.conversation_id
    else:
        cid = (await db.insert("ai_conversations", {"user_id": user.id, "title": cs.title_from(message)}))[0]["id"]

    history = await db.select("ai_messages", select="role,content", conversation_id=f"eq.{cid}", order="created_at.asc")
    turns = cs.trim_history([{"role": m["role"], "content": m["content"]} for m in history] +
                            [{"role": "user", "content": message}])

    ctx = await cs.build_context(db, user.id, utc_today())
    try:
        reply = await llm.complete(cs.build_system_prompt(ctx), turns)
    except Exception:
        raise HTTPException(502, "The coach is temporarily unavailable. Please try again.")
    if not reply:
        raise HTTPException(502, "The coach returned an empty answer. Please try again.")

    await db.insert("ai_messages", [{"conversation_id": cid, "role": "user", "content": message},
                                    {"conversation_id": cid, "role": "assistant", "content": reply}])
    return {"conversation_id": cid, "reply": reply, "suggestions": cs.suggest_followups(ctx), "safety": None}


@router.get("/conversations")
async def list_conversations(user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    rows = await db.select("ai_conversations", select="id,title,created_at", user_id=f"eq.{user.id}",
                           order="created_at.desc", limit="50")
    return {"conversations": rows}


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: IdPath, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    convo = await db.select("ai_conversations", select="id,title,created_at", id=f"eq.{conversation_id}", user_id=f"eq.{user.id}")
    if not convo:
        raise HTTPException(404, "Conversation not found")
    msgs = await db.select("ai_messages", select="id,role,content,created_at", conversation_id=f"eq.{conversation_id}",
                           order="created_at.asc")
    return {**convo[0], "messages": msgs}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: IdPath, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    convo = await db.select("ai_conversations", select="id", id=f"eq.{conversation_id}", user_id=f"eq.{user.id}")
    if not convo:
        raise HTTPException(404, "Conversation not found")
    await db.delete("ai_messages", conversation_id=f"eq.{conversation_id}")
    await db.delete("ai_conversations", id=f"eq.{conversation_id}", user_id=f"eq.{user.id}")
    return {"deleted": True}
