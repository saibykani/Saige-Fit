from datetime import date

from fastapi import APIRouter, Depends

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.services import streaks as sk

router = APIRouter(prefix="/v1/streaks", tags=["streaks"])


@router.get("")
async def get_streaks(today: date | None = None, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    uid = user.id
    prof = await db.select("user_profiles", select="target_water_ml", user_id=f"eq.{uid}")
    meals = await db.select("meal_logs", select="log_date", user_id=f"eq.{uid}")
    water = await db.select("hydration_logs", select="log_date,amount_ml,counts_toward_goal", user_id=f"eq.{uid}")
    sessions = await db.select("workout_sessions", select="log_date,finished_at", user_id=f"eq.{uid}")
    scans = await db.select("food_scans", select="id,status", user_id=f"eq.{uid}")
    target = prof[0].get("target_water_ml") if prof else None
    return sk.build([m["log_date"] for m in meals], sessions, water, target, scans, today or date.today())
