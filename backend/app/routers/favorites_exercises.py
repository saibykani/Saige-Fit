from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.services.account import safe_id

router = APIRouter(prefix="/v1/favorites/exercises", tags=["favorites"])


@router.get("")
async def list_favorite_exercises(user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    favs = await db.select("user_favorites", select="exercise_id", user_id=f"eq.{user.id}",
                           order="created_at.desc")
    return {"ids": [f["exercise_id"] for f in favs if f.get("exercise_id")]}


@router.post("/{exercise_id}", status_code=201)
async def add_favorite_exercise(exercise_id: str, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    eid = safe_id(exercise_id)
    if not await db.select("exercises", select="id", id=f"eq.{eid}"):
        raise HTTPException(404, "Exercise not found")
    if not await db.select("user_favorites", select="id", user_id=f"eq.{user.id}", exercise_id=f"eq.{eid}"):
        await db.insert("user_favorites", {"user_id": user.id, "exercise_id": eid})
    return {"exercise_id": eid, "favorite": True}


@router.delete("/{exercise_id}")
async def remove_favorite_exercise(exercise_id: str, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    eid = safe_id(exercise_id)
    await db.delete("user_favorites", user_id=f"eq.{user.id}", exercise_id=f"eq.{eid}")
    return {"exercise_id": eid, "favorite": False}
