from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.core.limits import limiter
from app.services.account import AdminClient, get_admin

router = APIRouter(prefix="/v1/account", tags=["account"])

# (table, select) pairs. Rows are read with the user's own token, so RLS limits them to the owner.
EXPORT = [
    ("user_profiles", "*"), ("fitness_goals", "*"), ("dietary_preferences", "*"), ("food_scans", "*"),
    ("meal_logs", "*,meal_items(*)"), ("diet_plans", "*,diet_plan_meals(*)"),
    ("workout_plans", "*,workout_days(*)"), ("workout_sessions", "*,workout_sets(*)"),
    ("hydration_logs", "*"), ("weight_logs", "*"), ("body_measurements", "*"), ("progress_photos", "*"),
    ("notifications", "*"), ("user_favorites", "*"), ("ai_conversations", "*,ai_messages(*)"),
    ("subscriptions", "*"), ("daily_activity", "*"),
]
PAGE = 1000


async def fetch_all(db: Rest, table: str, select: str, **filters) -> list[dict]:
    rows: list[dict] = []
    for page in range(200):
        chunk = await db.select(table, select=select, limit=str(PAGE), offset=str(page * PAGE), **filters)
        rows += chunk
        if len(chunk) < PAGE:
            break
    return rows


@router.get("/export")
@limiter.limit("10/minute")
async def export_data(request: Request, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    uid = user.id
    out: dict = {"exported_at": datetime.now(timezone.utc).isoformat(), "user_id": uid, "email": user.email}
    users = await db.select("users", select="*", id=f"eq.{uid}")
    out["user"] = users[0] if users else None
    for table, select in EXPORT:
        out[table] = await fetch_all(db, table, select, user_id=f"eq.{uid}")
    out["custom_foods"] = await fetch_all(db, "food_items", "*,food_nutrition(*)", owner_id=f"eq.{uid}")
    return out


class DeleteIn(BaseModel):
    confirm: str


@router.delete("")
@limiter.limit("10/minute")
async def delete_account(request: Request, body: DeleteIn, user: CurrentUser = Depends(current_user),
                         admin: AdminClient | None = Depends(get_admin)):
    if body.confirm != "DELETE":
        raise HTTPException(422, 'Type "DELETE" to confirm')
    if admin is None:
        raise HTTPException(503, "Account deletion is not configured on this server")
    # Files first (abort and let the user retry if this fails), then the auth user.
    # Every table cascades from users -> auth.users, so deleting the auth user removes all rows.
    await admin.purge_storage(user.id)
    await admin.delete_auth_user(user.id)
    return {"deleted": True}
