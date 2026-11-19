import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db

router = APIRouter(prefix="/v1", tags=["notifications"])

Kind = Literal["breakfast", "lunch", "dinner", "hydration", "workout", "daily_summary", "weekly_report", "weigh_in"]
# kind -> (enabled, "HH:MM", weekdays 1=Mon..7=Sun)
DEFAULTS: dict[str, tuple[bool, str, list[int]]] = {
    "breakfast": (True, "08:00", [1, 2, 3, 4, 5, 6, 7]),
    "lunch": (True, "13:00", [1, 2, 3, 4, 5, 6, 7]),
    "dinner": (True, "20:00", [1, 2, 3, 4, 5, 6, 7]),
    "hydration": (True, "11:00", [1, 2, 3, 4, 5, 6, 7]),
    "workout": (True, "18:00", [1, 2, 3, 4, 5, 6, 7]),
    "daily_summary": (False, "21:30", [1, 2, 3, 4, 5, 6, 7]),
    "weekly_report": (True, "19:00", [7]),
    "weigh_in": (False, "07:30", [1]),
}
TZ_RE = re.compile(r"^(UTC|[A-Za-z_]+(/[A-Za-z_+\-0-9]+){1,2})$")
PUSH_RE = re.compile(r"^Expo(nent)?PushToken\[[A-Za-z0-9_\-]{10,60}\]$")


def _out(r: dict) -> dict:
    t = str(r["time_local"])[:5] if r.get("time_local") else None
    return {"kind": r["kind"], "enabled": bool(r["enabled"]), "time_local": t,
            "weekdays": sorted(r.get("weekdays") or []), "timezone": r.get("timezone") or "UTC"}


async def _load(db: Rest, uid: str) -> list[dict]:
    rows = await db.select("notifications", select="kind,enabled,time_local,weekdays,timezone", user_id=f"eq.{uid}")
    have = {r["kind"] for r in rows}
    missing = [{"user_id": uid, "kind": k, "enabled": d[0], "time_local": d[1] + ":00", "weekdays": d[2], "timezone": "UTC"}
               for k, d in DEFAULTS.items() if k not in have]
    if missing:
        rows += await db.upsert("notifications", missing, on_conflict="user_id,kind")
    order = list(DEFAULTS)
    return sorted((_out(r) for r in rows), key=lambda r: order.index(r["kind"]) if r["kind"] in order else 99)


@router.get("/notifications/settings")
async def get_settings(user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    return {"items": await _load(db, user.id)}


class NotifItem(BaseModel):
    kind: Kind
    enabled: bool
    time_local: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    weekdays: list[Annotated[int, Field(ge=1, le=7)]] = Field(default_factory=lambda: [1, 2, 3, 4, 5, 6, 7], max_length=7)
    timezone: str = Field(default="UTC", max_length=64)

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str):
        if not TZ_RE.match(v):
            raise ValueError("Unknown timezone")
        return v

    @field_validator("weekdays")
    @classmethod
    def _wd(cls, v: list[int]):
        return sorted(set(v))


class NotifIn(BaseModel):
    items: list[NotifItem] = Field(min_length=1, max_length=8)


@router.put("/notifications/settings")
async def put_settings(body: NotifIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    kinds = [i.kind for i in body.items]
    if len(set(kinds)) != len(kinds):
        raise HTTPException(422, "Duplicate kind")
    for i in body.items:
        if i.enabled and not i.time_local:
            raise HTTPException(422, f"time_local is required for enabled reminder '{i.kind}'")
        if i.enabled and not i.weekdays:
            raise HTTPException(422, f"Pick at least one weekday for '{i.kind}'")
    await _load(db, user.id)  # make sure defaults exist so unspecified kinds keep sane values
    rows = [{"user_id": user.id, "kind": i.kind, "enabled": i.enabled,
             "time_local": (i.time_local + ":00") if i.time_local else None,
             "weekdays": i.weekdays, "timezone": i.timezone} for i in body.items]
    await db.upsert("notifications", rows, on_conflict="user_id,kind")
    return {"items": await _load(db, user.id)}


class PushTokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=100)


@router.post("/devices/push-token")
async def register_push_token(body: PushTokenIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    if not PUSH_RE.match(body.token):
        raise HTTPException(422, "Not a valid Expo push token")
    rows = await db.update("users", {"expo_push_token": body.token}, id=f"eq.{user.id}")
    if not rows:
        raise HTTPException(409, "Account is not ready yet; please try again in a moment")
    return {"registered": True}
