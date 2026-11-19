"""Shared data loaders for the training / diet / coach routers. All reads go through the Rest client, which
forwards the user's JWT so Postgres RLS enforces ownership. Boolean filters are avoided (filtered in Python)."""
from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import HTTPException

from app.core.db import Rest
from app.services.entitlements import require_feature

FOOD_SELECT = "id,name,cuisine,diet_tags,allergens,default_serving_g,serving_label,grams_per_unit,food_nutrition(*)"


def parse_ts(v: str | None) -> datetime | None:
    if not v:
        return None
    dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


async def load_profile(db: Rest, uid: str) -> dict | None:
    rows = await db.select("user_profiles", select="*", user_id=f"eq.{uid}")
    return rows[0] if rows else None


async def require_profile(db: Rest, uid: str, need_targets: bool = False) -> dict:
    p = await load_profile(db, uid)
    if not p or (need_targets and p.get("target_kcal") is None):
        raise HTTPException(409, "Complete onboarding to continue")
    return p


async def load_goal(db: Rest, uid: str) -> str:
    rows = await db.select("fitness_goals", select="goal,is_primary", user_id=f"eq.{uid}")
    prim = [r for r in rows if r.get("is_primary", True)]
    return (prim or rows or [{"goal": "general_fitness"}])[0]["goal"]


async def load_prefs(db: Rest, uid: str) -> dict:
    rows = await db.select("dietary_preferences", select="*", user_id=f"eq.{uid}")
    base = {"diet_type": "non_vegetarian", "allergies": [], "intolerances": [], "restrictions": [], "liked_foods": [],
            "disliked_foods": [], "cuisines": ["indian"], "meals_per_day": 4, "monthly_budget": None}
    return {**base, **(rows[0] if rows else {})}


async def has_feature(db: Rest, uid: str, feature: str) -> bool:
    try:
        await require_feature(db, uid, feature)
        return True
    except HTTPException as e:
        if e.status_code == 402:
            return False
        raise


async def exercise_catalog(db: Rest) -> list[dict]:
    return await db.select("exercises", select="*", order="name", limit="500")


async def food_rows(db: Rest) -> list[dict]:
    return await db.select("food_items", select=FOOD_SELECT, limit="3000")


def targets_from_profile(p: dict):
    from app.services.diet_engine import DietTargets
    return DietTargets(kcal=float(p["target_kcal"]), protein_g=float(p["target_protein_g"]), carbs_g=float(p["target_carbs_g"]),
                       fat_g=float(p["target_fat_g"]), fiber_g=float(p.get("target_fiber_g") or 25))
