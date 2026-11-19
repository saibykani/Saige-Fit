import asyncio
import re
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.services import account as acct
from app.services import fitness_engine as fe
from app.services import progress_calc as pc
from app.services.account import StorageClient, get_storage, safe_id

router = APIRouter(prefix="/v1", tags=["progress"])
PATH_RE = re.compile(r"^[A-Za-z0-9_\-./]+$")


# ---------------------------------------------------------------- weight
class WeightIn(BaseModel):
    weight_kg: float = Field(ge=25, le=400)
    log_date: date


@router.post("/weight", status_code=201)
async def log_weight(body: WeightIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    uid, d = user.id, body.log_date.isoformat()
    newer = await db.select("weight_logs", select="id", user_id=f"eq.{uid}", log_date=f"gt.{d}", limit="1")
    row = (await db.upsert("weight_logs", {"user_id": uid, "weight_kg": body.weight_kg, "log_date": d},
                           on_conflict="user_id,log_date"))[0]
    targets_updated = False
    if not newer:  # this is the most recent weigh-in -> it becomes the current weight
        if await db.update("user_profiles", {"weight_kg": body.weight_kg}, user_id=f"eq.{uid}"):
            targets_updated = await acct.recompute_targets(db, uid) is not None
    return {"id": row.get("id"), "log_date": d, "weight_kg": body.weight_kg, "targets_updated": targets_updated}


@router.get("/weight")
async def get_weights(days: int = Query(90, ge=1, le=3650), end: date | None = None,
                      user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    end = end or date.today()
    start = end - timedelta(days=days - 1)
    rows = await db.select("weight_logs", select="id,log_date,weight_kg", user_id=f"eq.{user.id}",
                           log_date=[f"gte.{start.isoformat()}", f"lte.{end.isoformat()}"], order="log_date.asc")
    pts = [{"id": r.get("id"), "log_date": str(r["log_date"])[:10], "weight_kg": float(r["weight_kg"])} for r in rows]
    return {"points": pts, "trend_7d_avg": pc.trend_7d_avg(pts)}


@router.delete("/weight/{weight_id}")
async def delete_weight(weight_id: str, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    rows = await db.delete("weight_logs", id=f"eq.{safe_id(weight_id)}", user_id=f"eq.{user.id}")
    if not rows:
        raise HTTPException(404, "Entry not found")
    return {"deleted": True}


# ---------------------------------------------------------------- measurements
def _cm(lo=20, hi=300):
    return Field(default=None, ge=lo, le=hi)


class MeasurementIn(BaseModel):
    log_date: date
    waist_cm: float | None = _cm()
    chest_cm: float | None = _cm()
    arm_cm: float | None = _cm(10, 100)
    hip_cm: float | None = _cm()
    thigh_cm: float | None = _cm(20, 150)
    body_fat_pct: float | None = Field(default=None, ge=2, le=70)

    @model_validator(mode="after")
    def _any(self):
        if all(getattr(self, f) is None for f in pc.MEASURE_FIELDS):
            raise ValueError("Provide at least one measurement")
        return self


@router.post("/measurements", status_code=201)
async def log_measurements(body: MeasurementIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    vals = {f: getattr(body, f) for f in pc.MEASURE_FIELDS if getattr(body, f) is not None}  # only provided fields merge
    row = (await db.upsert("body_measurements", {"user_id": user.id, "log_date": body.log_date.isoformat(), **vals},
                           on_conflict="user_id,log_date"))[0]
    return {"measurement": row}


@router.get("/measurements")
async def get_measurements(days: int = Query(365, ge=1, le=3650), end: date | None = None,
                           user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    end = end or date.today()
    start = end - timedelta(days=days - 1)
    rows = await db.select("body_measurements", select="*", user_id=f"eq.{user.id}",
                           log_date=[f"gte.{start.isoformat()}", f"lte.{end.isoformat()}"], order="log_date.desc")
    return {"items": rows}


# ---------------------------------------------------------------- summary
@router.get("/progress/summary")
async def summary(range_: int = Query(30, alias="range"), end: date | None = None,
                  user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    if range_ not in (30, 90, 365):
        raise HTTPException(422, "range must be 30, 90 or 365")
    uid = user.id
    end = end or date.today()
    start = end - timedelta(days=range_ - 1)
    prof = await db.select("user_profiles", select="weight_kg,height_cm,target_weight_kg", user_id=f"eq.{uid}")
    p = prof[0] if prof else {}
    weights = await db.select("weight_logs", select="log_date,weight_kg", user_id=f"eq.{uid}", order="log_date.asc", limit="5000")
    upto = [w for w in weights if pc.to_date(w["log_date"]) <= end]
    in_range = [w for w in upto if pc.to_date(w["log_date"]) >= start]

    profile_w = float(p["weight_kg"]) if p.get("weight_kg") is not None else None
    journey_start = float(upto[0]["weight_kg"]) if upto else profile_w   # first ever weigh-in
    current = float(upto[-1]["weight_kg"]) if upto else profile_w
    range_start = float(in_range[0]["weight_kg"]) if in_range else None
    target = float(p["target_weight_kg"]) if p.get("target_weight_kg") is not None else None

    meas = await db.select("body_measurements", select="*", user_id=f"eq.{uid}", order="log_date.asc", limit="5000")
    meas_in = [m for m in meas if start <= pc.to_date(m["log_date"]) <= end]
    photos = await db.select("progress_photos", select="id", user_id=f"eq.{uid}")
    bmi = fe.bmi(current, float(p["height_cm"])) if current and p.get("height_cm") else None
    return {
        "range": range_, "start": start.isoformat(), "end": end.isoformat(),
        "start_weight": range_start, "journey_start_weight": journey_start, "current_weight": current,
        "target_weight": target, "goal_pct": pc.goal_pct(journey_start, current, target),
        "change_kg": round(current - range_start, 1) if current is not None and range_start is not None else None,
        "weekly_change_kg": pc.weekly_change(in_range), "bmi": bmi,
        "measurements_delta": pc.measurement_deltas(meas_in), "photos_count": len(photos),
    }


# ---------------------------------------------------------------- photos
class PhotoIn(BaseModel):
    image_path: str = Field(min_length=3, max_length=300)
    angle: Literal["front", "side", "back"] | None = None
    taken_on: date


@router.post("/progress/photos", status_code=201)
async def add_photo(body: PhotoIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db),
                    storage: StorageClient = Depends(get_storage)):
    path = body.image_path
    if not path.startswith(f"{user.id}/") or ".." in path or not PATH_RE.match(path):
        raise HTTPException(422, "image_path must be inside your own storage folder")
    row = (await db.insert("progress_photos", {"user_id": user.id, "image_path": path, "angle": body.angle,
                                               "taken_on": body.taken_on.isoformat()}))[0]
    return {"photo": {**row, "signed_url": await storage.sign("progress-photos", path)}}


@router.get("/progress/photos")
async def list_photos(user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db),
                      storage: StorageClient = Depends(get_storage)):
    rows = await db.select("progress_photos", select="id,image_path,angle,taken_on,created_at", user_id=f"eq.{user.id}",
                           order="taken_on.desc", limit="200")
    urls = await asyncio.gather(*(storage.sign("progress-photos", r["image_path"]) for r in rows))
    return {"photos": [{**r, "signed_url": u} for r, u in zip(rows, urls)]}


@router.delete("/progress/photos/{photo_id}")
async def delete_photo(photo_id: str, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db),
                       storage: StorageClient = Depends(get_storage)):
    rows = await db.delete("progress_photos", id=f"eq.{safe_id(photo_id)}", user_id=f"eq.{user.id}")
    if not rows:
        raise HTTPException(404, "Photo not found")
    await storage.remove("progress-photos", [rows[0]["image_path"]])  # best effort; row is already gone
    return {"deleted": True}
