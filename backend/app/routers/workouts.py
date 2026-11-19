from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field, StringConstraints

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.routers.exercises import full as full_exercise
from app.services import workout_engine as we
from app.services.ai_data import (exercise_catalog, has_feature, load_goal, load_profile, parse_ts, require_profile, utc_today)

router = APIRouter(prefix="/v1/workouts", tags=["workouts"])
SafeId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
IdPath = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
MAX_SESSION_MIN = 240


# ---------- helpers ----------
def expand_day(day: dict, by_id: dict[str, dict]) -> dict:
    stored = [i for i in (day.get("exercises") or []) if i.get("exercise_id") in by_id]
    items = [{"exercise": full_exercise(by_id[i["exercise_id"]]), "sets": i["sets"], "reps": i["reps"], "rest_s": i["rest_s"]} for i in stored]
    if not stored:
        mins = 0
    elif day.get("is_rest"):
        mins = round(sum(we.estimate_minutes(i, by_id[i["exercise_id"]]) for i in stored))
    else:
        mins = we.day_minutes(stored, by_id)
    return {"id": day["id"], "weekday": day["weekday"], "focus": day["focus"], "is_rest": bool(day["is_rest"]),
            "estimated_minutes": mins, "exercises": items}


async def active_plan(db: Rest, uid: str) -> dict | None:
    plans = await db.select("workout_plans", select="*", user_id=f"eq.{uid}", order="created_at.desc")
    return next((p for p in plans if p.get("is_active")), None)


async def plan_out(db: Rest, plan: dict, by_id: dict[str, dict]) -> dict:
    days = await db.select("workout_days", select="*", plan_id=f"eq.{plan['id']}", order="weekday.asc")
    return {"id": plan["id"], "name": plan["name"], "created_at": plan.get("created_at"),
            "days": [expand_day(d, by_id) for d in sorted(days, key=lambda d: d["weekday"])]}


async def owned_session(db: Rest, uid: str, session_id: str) -> dict:
    rows = await db.select("workout_sessions", select="*", id=f"eq.{session_id}", user_id=f"eq.{uid}")
    if not rows:
        raise HTTPException(404, "Session not found")
    return rows[0]


async def owned_day(db: Rest, uid: str, day_id: str) -> tuple[dict, dict]:
    days = await db.select("workout_days", select="*", id=f"eq.{day_id}")
    if not days:
        raise HTTPException(404, "Workout day not found")
    plans = await db.select("workout_plans", select="*", id=f"eq.{days[0]['plan_id']}", user_id=f"eq.{uid}")
    if not plans:
        raise HTTPException(404, "Workout day not found")
    return days[0], plans[0]


async def sets_for(db: Rest, ids: list[str]) -> list[dict]:
    """Sets belonging to the given sessions. Avoids very long URLs: large id lists are filtered client-side (RLS already scopes rows)."""
    if not ids:
        return []
    if len(ids) <= 50:
        return await db.select("workout_sets", select="*", session_id=f"in.({','.join(ids)})", limit="20000")
    wanted = set(ids)
    return [x for x in await db.select("workout_sets", select="*", limit="20000") if x["session_id"] in wanted]


def session_out(s: dict) -> dict:
    return {k: s.get(k) for k in ("id", "day_id", "log_date", "started_at", "finished_at", "kcal_burned")}


# ---------- plan ----------
class GenerateIn(BaseModel):
    pass


@router.post("/plan/generate", status_code=201)
async def generate_plan(_: GenerateIn | None = None, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    prof = await require_profile(db, user.id)
    personalized = await has_feature(db, user.id, "personalized_workouts")
    if not personalized and not await has_feature(db, user.id, "basic_workout_plan"):
        raise HTTPException(402, "'basic_workout_plan' is not included in your plan")
    goal = await load_goal(db, user.id)
    catalog = await exercise_catalog(db)
    try:
        gen = we.generate_plan(catalog=catalog, goal=goal, experience=prof.get("experience") or "beginner",
                               env=prof.get("workout_env") or "gym", equipment=prof.get("equipment") or [],
                               injuries=prof.get("injuries") or [], training_days=int(prof.get("training_days") or 3),
                               workout_days=[int(d) for d in (prof.get("workout_days") or [])],
                               minutes=int(prof.get("workout_minutes") or 45), basic=not personalized)
    except ValueError as e:
        raise HTTPException(422, str(e))

    for old in await db.select("workout_plans", select="id,is_active", user_id=f"eq.{user.id}"):
        if old.get("is_active"):
            await db.update("workout_plans", {"is_active": False}, id=f"eq.{old['id']}")
    plan = (await db.insert("workout_plans", {"user_id": user.id, "name": gen.name, "is_active": True,
                                              "generated_by": "engine" if personalized else "template"}))[0]
    await db.insert("workout_days", [{"plan_id": plan["id"], "weekday": d.weekday, "focus": d.focus, "is_rest": d.is_rest,
                                      "exercises": d.exercises} for d in gen.days])
    by_id = {e["id"]: e for e in catalog}
    return {"plan": await plan_out(db, plan, by_id), "notes": gen.notes, "personalized": personalized,
            "disclaimer": "General guidance, not medical advice. Choose loads you can control with good form and stop if something hurts."}


@router.get("/plan")
async def get_plan(user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    plan = await active_plan(db, user.id)
    if not plan:
        return {"plan": None}
    by_id = {e["id"]: e for e in await exercise_catalog(db)}
    return {"plan": await plan_out(db, plan, by_id)}


@router.get("/today")
async def today(date_: date | None = Query(None, alias="date"), user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    day_ = date_ or utc_today()
    plan = await active_plan(db, user.id)
    out = {"date": day_.isoformat(), "plan_id": plan["id"] if plan else None, "day": None, "session": None, "completed_today": False}
    if plan:
        by_id = {e["id"]: e for e in await exercise_catalog(db)}
        days = await db.select("workout_days", select="*", plan_id=f"eq.{plan['id']}", weekday=f"eq.{day_.isoweekday()}")
        if days:
            out["day"] = expand_day(days[0], by_id)
    sessions = await db.select("workout_sessions", select="*", user_id=f"eq.{user.id}", log_date=f"eq.{day_.isoformat()}", order="started_at.desc")
    open_ = next((s for s in sessions if not s.get("finished_at")), None)
    out["session"] = session_out(open_) if open_ else None
    out["completed_today"] = any(s.get("finished_at") for s in sessions)
    return out


class ReplaceIn(BaseModel):
    exercise_id: SafeId
    replacement_id: SafeId


@router.post("/days/{day_id}/replace-exercise")
async def replace_exercise(day_id: IdPath, body: ReplaceIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    day, _plan = await owned_day(db, user.id, day_id)
    items = list(day.get("exercises") or [])
    idx = next((i for i, it in enumerate(items) if it["exercise_id"] == body.exercise_id), None)
    if idx is None:
        raise HTTPException(422, "That exercise is not in this workout day")
    by_id = {e["id"]: e for e in await exercise_catalog(db)}
    new = by_id.get(body.replacement_id)
    if not new or body.replacement_id == body.exercise_id:
        raise HTTPException(422, "Invalid replacement exercise")
    prof = await load_profile(db, user.id) or {}
    tags, _ = we.injury_tags(prof.get("injuries"))
    if not we.is_safe(new, tags):
        raise HTTPException(422, "That exercise conflicts with your reported limitations")
    if not set(new.get("equipment") or []) <= we.available_equipment(prof.get("workout_env") or "gym", prof.get("equipment") or []):
        raise HTTPException(422, "You don't have the equipment for that exercise")
    old = by_id.get(body.exercise_id)
    rx = we.prescribe(new, await load_goal(db, user.id), prof.get("experience") or "beginner")
    if old and old["muscle_group"] == new["muscle_group"] and old.get("is_compound") == new.get("is_compound"):
        rx = {"sets": items[idx]["sets"], "reps": items[idx]["reps"], "rest_s": items[idx]["rest_s"]}  # like-for-like swap keeps the prescription
    items[idx] = {"exercise_id": new["id"], **rx}
    await db.update("workout_days", {"exercises": items}, id=f"eq.{day_id}")
    return {"day": expand_day({**day, "exercises": items}, by_id)}


# ---------- sessions ----------
class SessionStart(BaseModel):
    day_id: SafeId | None = None
    log_date: date


@router.post("/sessions", status_code=201)
async def start_session(body: SessionStart, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    if body.day_id:
        await owned_day(db, user.id, body.day_id)
    existing = await db.select("workout_sessions", select="*", user_id=f"eq.{user.id}", log_date=f"eq.{body.log_date.isoformat()}")
    for s in existing:  # resume instead of creating duplicates
        if not s.get("finished_at") and s.get("day_id") == body.day_id:
            return {"session": session_out(s), "resumed": True}
    s = (await db.insert("workout_sessions", {"user_id": user.id, "day_id": body.day_id, "log_date": body.log_date.isoformat(),
                                              "started_at": datetime.now(timezone.utc).isoformat()}))[0]
    return {"session": session_out(s), "resumed": False}


class SetIn(BaseModel):
    exercise_id: SafeId
    set_number: int = Field(ge=1, le=30)
    reps: int | None = Field(default=None, ge=0, le=500)
    weight_kg: float | None = Field(default=None, ge=0, le=1000)
    completed: bool = True
    skipped: bool = False


@router.post("/sessions/{session_id}/sets")
async def log_set(session_id: IdPath, body: SetIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    sess = await owned_session(db, user.id, session_id)
    if sess.get("finished_at"):
        raise HTTPException(409, "This session is already finished")
    ex = await db.select("exercises", select="id,name", id=f"eq.{body.exercise_id}")
    if not ex:
        raise HTTPException(422, "Unknown exercise")
    completed = body.completed and not body.skipped
    if completed and not body.reps:
        raise HTTPException(422, "reps is required for a completed set")

    history = await db.select("workout_sets", select="id,session_id,set_number,reps,weight_kg,completed,skipped",
                              exercise_id=f"eq.{body.exercise_id}")
    mine = next((h for h in history if h["session_id"] == session_id and h["set_number"] == body.set_number), None)
    prior = [we.pr_score(h.get("weight_kg"), h.get("reps")) for h in history
             if h.get("completed") and not h.get("skipped") and (not mine or h["id"] != mine["id"])]
    is_pr = completed and we.is_new_pr(prior, body.weight_kg, body.reps)
    row = {"session_id": session_id, "exercise_id": body.exercise_id, "set_number": body.set_number, "reps": body.reps,
           "weight_kg": body.weight_kg, "completed": completed, "skipped": body.skipped, "is_pr": bool(is_pr)}
    saved = (await db.update("workout_sets", row, id=f"eq.{mine['id']}"))[0] if mine else (await db.insert("workout_sets", row))[0]
    return {"set": saved, "is_pr": bool(is_pr),
            "e1rm": round(we.epley_1rm(body.weight_kg, body.reps), 1) if completed and body.weight_kg and body.reps else None}


@router.post("/sessions/{session_id}/finish")
async def finish_session(session_id: IdPath, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    sess = await owned_session(db, user.id, session_id)
    if sess.get("finished_at"):
        raise HTTPException(409, "This session is already finished")
    sets = await db.select("workout_sets", select="*", session_id=f"eq.{session_id}")
    done = [s for s in sets if s.get("completed") and not s.get("skipped")]
    planned = 0
    if sess.get("day_id"):
        days = await db.select("workout_days", select="exercises", id=f"eq.{sess['day_id']}")
        planned = sum(int(i.get("sets", 0)) for i in (days[0].get("exercises") or [])) if days else 0
    pct = we.completion_pct(len(done), planned or len(sets))
    now = datetime.now(timezone.utc)
    start = parse_ts(sess.get("started_at")) or now
    minutes = min(MAX_SESSION_MIN, max(0.0, (now - start).total_seconds() / 60))
    prof = await load_profile(db, user.id) or {}
    kcal = we.kcal_estimate(float(prof.get("weight_kg") or 70), minutes)
    await db.update("workout_sessions", {"finished_at": now.isoformat(), "kcal_burned": kcal}, id=f"eq.{session_id}")

    names = {e["id"]: e["name"] for e in await exercise_catalog(db)}
    best: dict[str, dict] = {}
    for s in done:
        if s.get("is_pr"):
            sc = we.pr_score(s.get("weight_kg"), s.get("reps"))
            if s["exercise_id"] not in best or sc > best[s["exercise_id"]]["score"]:
                best[s["exercise_id"]] = {"exercise_id": s["exercise_id"], "name": names.get(s["exercise_id"]), "weight_kg": s.get("weight_kg"),
                                          "reps": s.get("reps"), "e1rm": round(sc, 1), "score": sc}
    volume = round(sum(float(s.get("weight_kg") or 0) * int(s.get("reps") or 0) for s in done), 1)
    return {"duration_min": round(minutes), "kcal_burned": kcal, "kcal_is_estimate": True, "completion_pct": pct,
            "sets_completed": len(done), "total_volume_kg": volume,
            "new_prs": [{k: v for k, v in b.items() if k != "score"} for b in best.values()]}


# ---------- history, stats, PRs ----------
@router.get("/history")
async def history(limit: int = 20, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    limit = max(1, min(limit, 100))
    sessions = await db.select("workout_sessions", select="*", user_id=f"eq.{user.id}", order="started_at.desc", limit=str(limit))
    if not sessions:
        return {"items": []}
    sets = await sets_for(db, [s["id"] for s in sessions])
    day_ids = sorted({s["day_id"] for s in sessions if s.get("day_id")})
    days = {d["id"]: d for d in await db.select("workout_days", select="id,focus,exercises", id=f"in.({','.join(day_ids)})")} if day_ids else {}
    out = []
    for s in sessions:
        ss = [x for x in sets if x["session_id"] == s["id"]]
        done = [x for x in ss if x.get("completed") and not x.get("skipped")]
        d = days.get(s.get("day_id"))
        planned = sum(int(i.get("sets", 0)) for i in (d.get("exercises") or [])) if d else 0
        st, fin = parse_ts(s.get("started_at")), parse_ts(s.get("finished_at"))
        out.append({**session_out(s), "focus": d["focus"] if d else None, "sets_completed": len(done),
                    "exercises": len({x["exercise_id"] for x in done}), "prs": sum(1 for x in done if x.get("is_pr")),
                    "volume_kg": round(sum(float(x.get("weight_kg") or 0) * int(x.get("reps") or 0) for x in done), 1),
                    "duration_min": round((fin - st).total_seconds() / 60) if st and fin else None,
                    "completion_pct": we.completion_pct(len(done), planned or len(ss))})
    return {"items": out}


@router.get("/stats")
async def stats(weeks: int = 8, today_: date | None = Query(None, alias="today"), user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    weeks = max(1, min(weeks, 26))
    today = today_ or utc_today()
    this_monday = today - timedelta(days=today.isoweekday() - 1)
    first = this_monday - timedelta(weeks=weeks - 1)
    sessions = [s for s in await db.select("workout_sessions", select="*", user_id=f"eq.{user.id}", log_date=f"gte.{first.isoformat()}")
                if s.get("finished_at") and s["log_date"] <= today.isoformat()]
    sets = await sets_for(db, [s["id"] for s in sessions])
    buckets = {(first + timedelta(weeks=i)).isoformat(): {"week_start": (first + timedelta(weeks=i)).isoformat(), "sessions": 0, "volume_kg": 0.0,
                                                          "sets_completed": 0, "minutes": 0} for i in range(weeks)}
    for s in sessions:
        d = date.fromisoformat(s["log_date"][:10])
        b = buckets.get((d - timedelta(days=d.isoweekday() - 1)).isoformat())
        if not b:
            continue
        done = [x for x in sets if x["session_id"] == s["id"] and x.get("completed") and not x.get("skipped")]
        st, fin = parse_ts(s.get("started_at")), parse_ts(s.get("finished_at"))
        b["sessions"] += 1
        b["sets_completed"] += len(done)
        b["volume_kg"] = round(b["volume_kg"] + sum(float(x.get("weight_kg") or 0) * int(x.get("reps") or 0) for x in done), 1)
        b["minutes"] += round((fin - st).total_seconds() / 60) if st and fin else 0
    plan = await active_plan(db, user.id)
    planned = 0
    if plan:
        planned = sum(1 for d in await db.select("workout_days", select="is_rest", plan_id=f"eq.{plan['id']}") if not d["is_rest"])
    wk = list(buckets.values())
    total = sum(b["sessions"] for b in wk)
    return {"weeks": wk, "totals": {"sessions": total, "sets_completed": sum(b["sets_completed"] for b in wk),
                                    "volume_kg": round(sum(b["volume_kg"] for b in wk), 1), "minutes": sum(b["minutes"] for b in wk)},
            "frequency_per_week": round(total / weeks, 1), "planned_sessions_per_week": planned,
            "adherence_pct": min(100, round(100 * total / (planned * weeks))) if planned else None}


@router.get("/prs")
async def prs(user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    sessions = await db.select("workout_sessions", select="id,log_date", user_id=f"eq.{user.id}", limit="2000")
    if not sessions:
        return {"items": []}
    date_of = {s["id"]: s["log_date"] for s in sessions}
    sets = [s for s in await sets_for(db, list(date_of))
            if s.get("completed") and not s.get("skipped") and s["session_id"] in date_of]
    best: dict[str, dict] = {}
    for s in sets:
        sc = we.pr_score(s.get("weight_kg"), s.get("reps"))
        if sc > 0 and (s["exercise_id"] not in best or sc > best[s["exercise_id"]]["score"]):
            best[s["exercise_id"]] = {"score": sc, "set": s}
    ex = {e["id"]: e for e in await exercise_catalog(db)}
    items = [{"exercise_id": k, "name": ex.get(k, {}).get("name"), "muscle_group": ex.get(k, {}).get("muscle_group"),
              "best_weight_kg": v["set"].get("weight_kg"), "reps": v["set"].get("reps"), "e1rm": round(v["score"], 1),
              "achieved_on": date_of[v["set"]["session_id"]]} for k, v in best.items()]
    return {"items": sorted(items, key=lambda i: -i["e1rm"])}
