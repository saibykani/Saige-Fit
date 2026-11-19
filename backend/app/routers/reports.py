from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.routers.coach import get_optional_llm
from app.services import coach as cs
from app.services import report as rp
from app.services.ai_data import has_feature, load_goal, require_profile, utc_today

router = APIRouter(prefix="/v1/reports", tags=["reports"])


@router.get("/weekly")
async def weekly_report(end: date | None = Query(default=None), user: CurrentUser = Depends(current_user),
                        db: Rest = Depends(get_db), llm: cs.LLM | None = Depends(get_optional_llm)):
    if not await has_feature(db, user.id, "weekly_ai_report"):
        raise HTTPException(402, "'weekly_ai_report' is not included in your plan")
    end = end or utc_today()
    if end < date(2020, 1, 1) or end > utc_today() + timedelta(days=1):
        raise HTTPException(422, "end must be a past or current date")
    prof = await require_profile(db, user.id, need_targets=True)
    start = (end - timedelta(days=6)).isoformat()
    e = end.isoformat()
    uid = f"eq.{user.id}"

    meals = await db.select("meal_logs", select="id,log_date,meal_items(*)", user_id=uid, log_date=f"gte.{start}")
    hydration = await db.select("hydration_logs", select="log_date,amount_ml,counts_toward_goal", user_id=uid, log_date=f"gte.{start}")
    weights = await db.select("weight_logs", select="log_date,weight_kg", user_id=uid, log_date=f"gte.{start}")
    sessions = await db.select("workout_sessions", select="log_date,finished_at", user_id=uid, log_date=f"gte.{start}")
    meals, hydration, weights, sessions = ([r for r in rows if r["log_date"] <= e] for rows in (meals, hydration, weights, sessions))

    planned = int(prof.get("training_days") or 0)
    plans = await db.select("workout_plans", select="id,is_active", user_id=uid, order="created_at.desc")
    active = next((p for p in plans if p.get("is_active")), None)
    if active:
        days = await db.select("workout_days", select="is_rest", plan_id=f"eq.{active['id']}")
        planned = sum(1 for d in days if not d.get("is_rest")) or planned

    targets = {"kcal": prof["target_kcal"], "protein_g": prof["target_protein_g"], "water_ml": prof.get("target_water_ml")}
    stats = rp.compute_week_stats(end=end, targets=targets, meals=meals, hydration=hydration, weights=weights,
                                  sessions=sessions, planned_workouts=planned, goal=await load_goal(db, user.id))

    # The LLM only rephrases the already-computed numbers, and only if the user consented to AI processing.
    me = await db.select("users", select="ai_consent_at", id=uid)
    consented = bool(me and me[0].get("ai_consent_at"))
    summary, used_llm = await rp.phrase_summary(llm if consented else None, stats)
    return {"stats": stats, "summary": summary, "recommendations": rp.recommendations(stats), "used_llm": used_llm,
            "disclaimer": "Based on the data you logged. Not medical advice."}
