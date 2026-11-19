from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.services.account import safe_id

router = APIRouter(prefix="/v1/hydration", tags=["hydration"])
DEFAULT_TARGET_ML = 2000


async def _target(db: Rest, uid: str) -> int:
    rows = await db.select("user_profiles", select="target_water_ml", user_id=f"eq.{uid}")
    return int(rows[0]["target_water_ml"]) if rows and rows[0].get("target_water_ml") else DEFAULT_TARGET_ML


def _totals(logs: list[dict]) -> dict:
    return {
        "total_ml": sum(int(x["amount_ml"]) for x in logs if x.get("counts_toward_goal", True)),  # progress toward goal
        "water_ml": sum(int(x["amount_ml"]) for x in logs if x.get("beverage") == "water"),       # plain water only
        "all_ml": sum(int(x["amount_ml"]) for x in logs),                                         # every beverage
    }


@router.get("")
async def get_day(day: date = Query(alias="date"), user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    logs = await db.select("hydration_logs", select="id,amount_ml,beverage,counts_toward_goal,logged_at",
                           user_id=f"eq.{user.id}", log_date=f"eq.{day.isoformat()}", order="logged_at.asc")
    return {"date": day.isoformat(), "target_ml": await _target(db, user.id), **_totals(logs), "logs": logs}


class HydrationIn(BaseModel):
    amount_ml: int = Field(ge=1, le=5000)
    beverage: str = Field(default="water", min_length=1, max_length=40)
    counts_toward_goal: bool | None = None
    log_date: date

    @field_validator("beverage")
    @classmethod
    def _norm(cls, v: str):
        v = " ".join(v.split()).lower()
        if not v:
            raise ValueError("beverage required")
        return v


@router.post("", status_code=201)
async def add(body: HydrationIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    counts = body.counts_toward_goal if body.counts_toward_goal is not None else body.beverage == "water"
    row = (await db.insert("hydration_logs", {"user_id": user.id, "amount_ml": body.amount_ml, "beverage": body.beverage,
                                              "counts_toward_goal": counts, "log_date": body.log_date.isoformat()}))[0]
    logs = await db.select("hydration_logs", select="amount_ml,beverage,counts_toward_goal", user_id=f"eq.{user.id}",
                           log_date=f"eq.{body.log_date.isoformat()}")
    return {"log": row, "target_ml": await _target(db, user.id), **_totals(logs)}


@router.get("/history")
async def history(days: int = Query(14, ge=1, le=90), end: date | None = None,
                  user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    end = end or date.today()
    start = end - timedelta(days=days - 1)
    logs = await db.select("hydration_logs", select="amount_ml,beverage,counts_toward_goal,log_date", user_id=f"eq.{user.id}",
                           log_date=[f"gte.{start.isoformat()}", f"lte.{end.isoformat()}"])
    by_day: dict[str, list[dict]] = {}
    for x in logs:
        by_day.setdefault(str(x["log_date"])[:10], []).append(x)
    target = await _target(db, user.id)
    out = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        out.append({"date": d, "target_ml": target, **_totals(by_day.get(d, []))})
    met = sum(1 for d in out if d["total_ml"] >= target)
    return {"days": out, "target_ml": target, "days_goal_met": met}


class TargetIn(BaseModel):
    target_ml: int = Field(ge=500, le=8000)


@router.put("/target")
async def set_target(body: TargetIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    rows = await db.update("user_profiles", {"target_water_ml": body.target_ml, "water_target_custom": True},
                           user_id=f"eq.{user.id}")
    if not rows:
        raise HTTPException(409, "Complete onboarding first")
    return {"target_ml": body.target_ml}


@router.delete("/{log_id}")
async def remove(log_id: str, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    rows = await db.delete("hydration_logs", id=f"eq.{safe_id(log_id)}", user_id=f"eq.{user.id}")
    if not rows:
        raise HTTPException(404, "Entry not found")
    return {"deleted": True}
