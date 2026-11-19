import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.services import analytics_calc as ac

router = APIRouter(prefix="/v1/analytics", tags=["analytics"])


async def _report(db: Rest, uid: str, start: date, end: date, as_of: date) -> dict:
    prof = await db.select("user_profiles", select="target_kcal,target_protein_g,target_carbs_g,target_fat_g,"
                           "target_fiber_g,target_water_ml", user_id=f"eq.{uid}")
    if not prof or prof[0].get("target_kcal") is None:
        raise HTTPException(409, "Complete onboarding to see analytics")
    p = prof[0]
    rng = [f"gte.{start.isoformat()}", f"lte.{end.isoformat()}"]
    meals = await db.select("meal_logs", select="log_date,meal_type,meal_items(kcal,protein_g,carbs_g,fat_g,fiber_g)",
                            user_id=f"eq.{uid}", log_date=rng)
    water = await db.select("hydration_logs", select="log_date,amount_ml,counts_toward_goal", user_id=f"eq.{uid}", log_date=rng)
    sessions = await db.select("workout_sessions", select="log_date,started_at,finished_at", user_id=f"eq.{uid}", log_date=rng)
    weights = await db.select("weight_logs", select="log_date,weight_kg", user_id=f"eq.{uid}", log_date=rng)
    targets = {"kcal": p["target_kcal"], "protein_g": p["target_protein_g"], "carbs_g": p["target_carbs_g"],
               "fat_g": p["target_fat_g"], "fiber_g": p["target_fiber_g"], "water_ml": p["target_water_ml"]}
    return ac.build(ac.daterange(start, end), meals, water, sessions, weights, targets, as_of)


@router.get("/daily")
async def daily(day: date = Query(alias="date"), user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    r = await _report(db, user.id, day, day, day)
    r["workout_completed"] = r["series"]["workouts"][0] > 0
    return r


@router.get("/weekly")
async def weekly(end: date, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    return await _report(db, user.id, end - timedelta(days=6), end, end)


@router.get("/monthly")
async def monthly(month: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"), today: date | None = None,
                  user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    y, m = int(month[:4]), int(month[5:])
    first, last = date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])
    as_of = min(last, today or date.today())  # days after "today" don't count against adherence
    return await _report(db, user.id, first, last, as_of)
