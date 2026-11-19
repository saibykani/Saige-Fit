from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.services import nutrition_engine as ne
from app.services.account import safe_id
from app.services.scanner import nutrients_from_row

router = APIRouter(prefix="/v1", tags=["meals"])


@router.get("/meals")
async def list_meals(day: date = Query(alias="date"), user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    meals = await db.select("meal_logs", select="id,meal_type,eaten_at,photo_path,notes,meal_items(*)",
                            user_id=f"eq.{user.id}", log_date=f"eq.{day.isoformat()}", order="eaten_at.asc")
    out = []
    for m in meals:
        items = m.get("meal_items") or []
        out.append({**{k: m.get(k) for k in ("id", "meal_type", "eaten_at", "photo_path", "notes")}, "items": items,
                    "total": ne.sum_nutrients([nutrients_from_row(i) for i in items]).__dict__})
    return {"date": day.isoformat(), "meals": out}


@router.delete("/meals/{meal_id}")
async def delete_meal(meal_id: str, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    rows = await db.delete("meal_logs", id=f"eq.{safe_id(meal_id)}", user_id=f"eq.{user.id}")  # items cascade
    if not rows:
        raise HTTPException(404, "Meal not found")
    return {"deleted": True}


class ItemPatch(BaseModel):
    quantity_g: float = Field(gt=0, le=ne.MAX_PORTION_G)


@router.patch("/meals/{meal_id}/items/{item_id}")
async def update_item(meal_id: str, item_id: str, body: ItemPatch, user: CurrentUser = Depends(current_user),
                      db: Rest = Depends(get_db)):
    mid, iid = safe_id(meal_id), safe_id(item_id)
    if not await db.select("meal_logs", select="id", id=f"eq.{mid}", user_id=f"eq.{user.id}"):
        raise HTTPException(404, "Meal not found")
    items = await db.select("meal_items", select="*", id=f"eq.{iid}", meal_id=f"eq.{mid}")
    if not items:
        raise HTTPException(404, "Item not found")
    item = items[0]
    if not item.get("food_id"):
        raise HTTPException(409, "This food was removed from the catalog; delete the item and add it again")
    foods = await db.select("food_items", select="id,name,food_nutrition(*)", id=f"eq.{safe_id(item['food_id'])}")
    if not foods:
        raise HTTPException(409, "This food is no longer available; delete the item and add it again")
    nut = foods[0]["food_nutrition"]
    nut = nut[0] if isinstance(nut, list) else nut
    n = nutrients_from_row(nut).scaled(body.quantity_g)  # recomputed from the food record, never trusted from the client
    values = {"quantity_g": body.quantity_g, "kcal": n.kcal, "protein_g": n.protein_g, "carbs_g": n.carbs_g,
              "fat_g": n.fat_g, "sat_fat_g": n.sat_fat_g, "fiber_g": n.fiber_g, "sugar_g": n.sugar_g,
              "sodium_mg": n.sodium_mg, "user_edited": True}
    updated = await db.update("meal_items", values, id=f"eq.{iid}", meal_id=f"eq.{mid}")
    return {"item": updated[0] if updated else {**item, **values}}
