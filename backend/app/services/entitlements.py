"""Feature gating driven by the plan_entitlements table (configurable, no hardcoded tiers)."""
from fastapi import HTTPException

from app.core.db import Rest

ACTIVE = {"active", "trialing"}


async def require_feature(db: Rest, user_id: str, feature: str) -> None:
    subs = await db.select("subscriptions", select="tier,status", user_id=f"eq.{user_id}",
                           order="created_at.desc", limit="1")
    tier = subs[0]["tier"] if subs and subs[0]["status"] in ACTIVE else "free"
    rows = await db.select("plan_entitlements", select="feature", tier=f"eq.{tier}", feature=f"eq.{feature}")
    if not rows:
        raise HTTPException(402, f"'{feature}' is not included in your plan")
