from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import StringConstraints

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.services import workout_engine as we
from app.services.ai_data import exercise_catalog, load_profile

router = APIRouter(prefix="/v1/exercises", tags=["exercises"])

SafeId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
LIGHT = ("id", "name", "muscle_group", "equipment", "difficulty", "is_compound", "media_url")


def light(e: dict) -> dict:
    return {k: e.get(k) for k in LIGHT}


def full(e: dict) -> dict:
    return {**light(e), "secondary_muscles": e.get("secondary_muscles") or [], "instructions": e.get("instructions") or [],
            "common_mistakes": e.get("common_mistakes") or [], "contraindications": e.get("contraindications") or [],
            "alternative_ids": e.get("alternative_ids") or []}


async def _injury_tags(db: Rest, uid: str) -> set[str]:
    p = await load_profile(db, uid)
    return we.injury_tags((p or {}).get("injuries"))[0]


@router.get("")
async def list_exercises(q: str | None = Query(None, max_length=60), muscle: str | None = Query(None, max_length=30),
                         equipment: str | None = Query(None, max_length=30), difficulty: str | None = Query(None, max_length=20),
                         safe_for_me: bool = False, limit: int = Query(100, ge=1, le=200),
                         user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    """Exercise library. `safe_for_me=true` hides anything that conflicts with the injuries on the user's profile."""
    rows = await exercise_catalog(db)
    tags = await _injury_tags(db, user.id) if safe_for_me else set()
    out = []
    for e in rows:
        if q and q.lower() not in e["name"].lower():
            continue
        if muscle and e["muscle_group"] != muscle.lower():
            continue
        if equipment and equipment.lower() not in (e.get("equipment") or []):
            continue
        if difficulty and e["difficulty"] != difficulty.lower():
            continue
        if safe_for_me and not we.is_safe(e, tags):
            continue
        out.append(light(e))
    return {"items": out[:limit], "total": len(out)}


@router.get("/{exercise_id}")
async def exercise_detail(exercise_id: Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,64}$")],
                          user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    rows = await exercise_catalog(db)
    by_id = {e["id"]: e for e in rows}
    e = by_id.get(exercise_id)
    if not e:
        raise HTTPException(404, "Exercise not found")
    tags = await _injury_tags(db, user.id)
    alts = [light(by_id[a]) | {"safe_for_me": we.is_safe(by_id[a], tags)} for a in (e.get("alternative_ids") or []) if a in by_id]
    return {**full(e), "safe_for_me": we.is_safe(e, tags), "alternatives": alts}
