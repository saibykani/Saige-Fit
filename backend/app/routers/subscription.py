from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, current_user
from app.core.config import Settings, get_settings
from app.core.db import Rest, get_db
from app.services import account as acct
from app.services.account import AdminClient, get_admin

router = APIRouter(prefix="/v1/subscription", tags=["subscription"])
TIERS = ["free", "pro", "premium"]


async def _payload(db: Rest, uid: str) -> dict:
    sub = await acct.effective_subscription(db, uid)
    rows = await db.select("plan_entitlements", select="tier,feature")
    plans = [{"tier": t, "features": sorted(r["feature"] for r in rows if r["tier"] == t)} for t in TIERS]
    return {**sub, "plans": plans}  # no prices here: they come from the store (Google Play / App Store)


@router.get("")
async def get_subscription(user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    return await _payload(db, user.id)


class VerifyIn(BaseModel):
    provider: Literal["google", "apple"]
    receipt: str = Field(min_length=1, max_length=20000)


@router.post("/verify")
async def verify(_: VerifyIn, __: CurrentUser = Depends(current_user)):
    # Architecture hook: validate with Google Play Developer API / App Store Server API, then write
    # `subscriptions` with the service role. Not enabled until billing credentials exist.
    raise HTTPException(501, "In-app billing is not configured on this server")


class DevTierIn(BaseModel):
    tier: Literal["free", "pro", "premium"]


@router.post("/dev-tier")
async def dev_tier(body: DevTierIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db),
                   s: Settings = Depends(get_settings), admin: AdminClient | None = Depends(get_admin)):
    if s.is_prod or not s.allow_dev_tier_switch:
        raise HTTPException(404, "Not found")  # hard-disabled in production
    if admin is None:
        raise HTTPException(503, "Service role key is not configured")
    rest = admin.rest()
    values = {"tier": body.tier, "status": "active", "provider": "manual", "current_period_end": None}
    if await rest.select("subscriptions", select="id", user_id=f"eq.{user.id}", limit="1"):
        await rest.update("subscriptions", values, user_id=f"eq.{user.id}")
    else:
        await rest.insert("subscriptions", {"user_id": user.id, **values})
    return await _payload(db, user.id)
