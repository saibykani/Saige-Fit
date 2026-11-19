"""Account-level helpers: targets recompute, effective subscription tier, and the two
privileged/outbound HTTP clients (service-role admin, user-token storage).

All outbound HTTP goes through `get_transport` so tests can swap in httpx.MockTransport.
The service-role key is used ONLY for: deleting an account, caching shared catalog foods,
and the dev tier switch. Never for reading a user's private data."""
from __future__ import annotations

import re
from datetime import date, datetime, timezone

import httpx
from fastapi import Depends, HTTPException

from app.core.auth import CurrentUser, current_user
from app.core.config import Settings, get_settings
from app.core.db import Rest
from app.services import fitness_engine as fe

SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
BUCKETS = ("food-photos", "progress-photos", "avatars")
ACTIVE_STATUSES = {"active", "trialing"}


def safe_id(value: str) -> str:
    """Ids end up inside PostgREST filters; accept only plain id characters."""
    if not SAFE_ID.match(value or ""):
        raise HTTPException(422, "Invalid id")
    return value


def get_transport() -> httpx.AsyncBaseTransport | None:
    return None  # overridden in tests


# ---------------------------------------------------------------- targets
def targets_for(profile: dict, goal: str | None) -> fe.Targets:
    """Compute targets from a stored user_profiles row. Raises ValueError on out-of-range data."""
    dob = profile["date_of_birth"]
    dob = dob if isinstance(dob, date) else date.fromisoformat(str(dob)[:10])
    tw = profile.get("target_weight_kg")
    return fe.compute_targets(
        weight_kg=float(profile["weight_kg"]),
        height_cm=float(profile["height_cm"]),
        age=fe.age_from_dob(dob),
        gender=fe.Gender(profile.get("gender") or "unspecified"),
        activity=fe.Activity(profile["activity_level"]),
        goal=fe.Goal(goal or "general_fitness"),
        training_days=int(profile.get("training_days") or 3),
        target_weight_kg=None if tw is None else float(tw),
    )


def target_columns(t: fe.Targets, *, keep_water_ml: int | None = None) -> dict:
    return {
        "bmi": t.bmi, "bmr_kcal": t.bmr_kcal, "tdee_kcal": t.tdee_kcal, "target_kcal": t.target_kcal,
        "target_protein_g": t.protein_g, "target_carbs_g": t.carbs_g, "target_fat_g": t.fat_g,
        "target_fiber_g": t.fiber_g,
        "target_water_ml": keep_water_ml if keep_water_ml is not None else t.water_ml,
    }


async def primary_goal_row(db: Rest, user_id: str) -> dict | None:
    rows = await db.select("fitness_goals", select="id,goal,is_primary", user_id=f"eq.{user_id}")
    return next((r for r in rows if r.get("is_primary")), None)


async def primary_goal(db: Rest, user_id: str) -> str | None:
    row = await primary_goal_row(db, user_id)
    return row["goal"] if row else None


async def set_primary_goal(db: Rest, user_id: str, goal: str) -> None:
    row = await primary_goal_row(db, user_id)
    if row:
        await db.update("fitness_goals", {"goal": goal}, id=f"eq.{row['id']}")
    else:
        await db.insert("fitness_goals", {"user_id": user_id, "goal": goal, "is_primary": True})


async def recompute_targets(db: Rest, user_id: str) -> fe.Targets | None:
    """Recalculate and store targets for the user's current profile. None if no profile / invalid data."""
    prof = await db.select("user_profiles", select="*", user_id=f"eq.{user_id}")
    if not prof:
        return None
    p = prof[0]
    try:
        t = targets_for(p, await primary_goal(db, user_id))
    except (ValueError, KeyError):
        return None
    keep = p.get("target_water_ml") if p.get("water_target_custom") else None
    await db.update("user_profiles", target_columns(t, keep_water_ml=keep), user_id=f"eq.{user_id}")
    return t


# ---------------------------------------------------------------- subscription
def _parse_ts(v) -> datetime | None:
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


async def effective_subscription(db: Rest, user_id: str) -> dict:
    """{tier,status,current_period_end,entitlements}. Falls back to free for inactive/expired plans."""
    subs = await db.select("subscriptions", select="tier,status,current_period_end", user_id=f"eq.{user_id}",
                           order="created_at.desc", limit="1")
    tier, status, end = "free", "active", None
    if subs:
        s = subs[0]
        expired = _parse_ts(s.get("current_period_end")) and _parse_ts(s["current_period_end"]) < datetime.now(timezone.utc)
        if s.get("status") in ACTIVE_STATUSES and not expired:
            tier, status, end = s["tier"], s["status"], s.get("current_period_end")
        else:
            status, end = s.get("status") or "expired", s.get("current_period_end")
    rows = await db.select("plan_entitlements", select="feature", tier=f"eq.{tier}")
    return {"tier": tier, "status": status, "current_period_end": end,
            "entitlements": sorted(r["feature"] for r in rows)}


# ---------------------------------------------------------------- outbound clients
class StorageClient:
    """Supabase Storage using the *user's* token, so storage RLS applies."""

    def __init__(self, base_url: str, anon_key: str, token: str, transport=None):
        self._base = base_url.rstrip("/") + "/storage/v1"
        self._h = {"apikey": anon_key, "Authorization": f"Bearer {token}"}
        self._t = transport

    async def sign(self, bucket: str, path: str, seconds: int = 3600) -> str | None:
        try:
            async with httpx.AsyncClient(transport=self._t, timeout=10) as c:
                r = await c.post(f"{self._base}/object/sign/{bucket}/{path}", json={"expiresIn": seconds}, headers=self._h)
            if r.status_code != 200:
                return None
            rel = r.json().get("signedURL") or r.json().get("signedUrl")
        except (httpx.HTTPError, ValueError):
            return None
        if not rel:
            return None
        return rel if rel.startswith("http") else f"{self._base}{rel}"

    async def remove(self, bucket: str, paths: list[str]) -> bool:
        try:
            async with httpx.AsyncClient(transport=self._t, timeout=10) as c:
                r = await c.request("DELETE", f"{self._base}/object/{bucket}", json={"prefixes": paths}, headers=self._h)
            return r.status_code < 300
        except httpx.HTTPError:
            return False


class AdminClient:
    """Service-role operations. Keep the surface tiny and never use it to read user data."""

    def __init__(self, base_url: str, service_key: str, transport=None):
        self._url = base_url.rstrip("/")
        self._h = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
        self._key = service_key
        self._t = transport

    def rest(self) -> Rest:
        return Rest(self._url, self._key, self._key, self._t)

    async def _call(self, method: str, path: str, json=None) -> httpx.Response:
        try:
            async with httpx.AsyncClient(transport=self._t, timeout=20) as c:
                return await c.request(method, f"{self._url}{path}", json=json, headers=self._h)
        except httpx.HTTPError:
            raise HTTPException(502, "Upstream service unavailable")

    async def purge_storage(self, user_id: str) -> None:
        for bucket in BUCKETS:
            for _ in range(50):  # bounded loop; 1000 files per page
                r = await self._call("POST", f"/storage/v1/object/list/{bucket}",
                                     {"prefix": user_id, "limit": 1000, "offset": 0})
                if r.status_code >= 300:
                    raise HTTPException(502, "Could not remove stored files; nothing was deleted, please retry")
                names = [o["name"] for o in r.json() if o.get("name")]
                if not names:
                    break
                d = await self._call("DELETE", f"/storage/v1/object/{bucket}",
                                     {"prefixes": [f"{user_id}/{n}" for n in names]})
                if d.status_code >= 300:
                    raise HTTPException(502, "Could not remove stored files; nothing was deleted, please retry")

    async def delete_auth_user(self, user_id: str) -> None:
        r = await self._call("DELETE", f"/auth/v1/admin/users/{user_id}")
        if r.status_code not in (200, 204, 404):
            raise HTTPException(502, "Could not delete the account; please retry")


def get_admin(s: Settings = Depends(get_settings), transport=Depends(get_transport)) -> AdminClient | None:
    if not s.supabase_url or not s.supabase_service_role_key:
        return None
    return AdminClient(s.supabase_url, s.supabase_service_role_key, transport)


def get_storage(user: CurrentUser = Depends(current_user), s: Settings = Depends(get_settings),
                transport=Depends(get_transport)) -> StorageClient:
    return StorageClient(s.supabase_url, s.supabase_anon_key, user.token, transport)
