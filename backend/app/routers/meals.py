from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.services import nutrition_engine as ne
from app.services.scanner import nutrients_from_row

router = APIRouter(prefix="/v1", tags=["meals"])

MealType = str  # validated by the database enum; kept loose here to avoid drift
MEAL_TYPES = {"early_morning", "breakfast", "mid_morning", "lunch", "evening_snack", "dinner", "snack"}


class MealItemIn(BaseModel):
    food_id: str
    quantity_g: float = Field(gt=0, le=ne.MAX_PORTION_G)
    user_edited: bool = False


class MealIn(BaseModel):
    meal_type: str
    log_date: date
    items: list[MealItemIn] = Field(min_length=1, max_length=30)
    scan_id: str | None = None
    photo_path: str | None = Field(default=None, max_length=300)
    is_estimate: bool = False


@router.post("/meals", status_code=201)
async def log_meal(body: MealIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    if body.meal_type not in MEAL_TYPES:
        raise HTTPException(422, "Unknown meal_type")
    if body.photo_path and not body.photo_path.startswith(f"{user.id}/"):
        raise HTTPException(422, "photo_path must be inside your own storage folder")
    ids = sorted({i.food_id for i in body.items})
    foods = await db.select("food_items", select="id,name,food_nutrition(*)", id=f"in.({','.join(ids)})")
    by_id = {f["id"]: f for f in foods}  # RLS hides other users' custom foods -> treated as unknown
    missing = [i for i in ids if i not in by_id]
    if missing:
        raise HTTPException(422, f"Unknown food_id: {missing[0]}")

    meal = (await db.insert("meal_logs", {
        "user_id": user.id, "meal_type": body.meal_type, "log_date": body.log_date.isoformat(),
        "scan_id": body.scan_id, "photo_path": body.photo_path}))[0]

    rows, computed = [], []
    for it in body.items:
        f = by_id[it.food_id]
        nut = f["food_nutrition"]
        nut = nut[0] if isinstance(nut, list) else nut
        n = nutrients_from_row(nut).scaled(it.quantity_g)
        computed.append(n)
        rows.append({"meal_id": meal["id"], "food_id": f["id"], "name": f["name"], "quantity_g": it.quantity_g,
                     "kcal": n.kcal, "protein_g": n.protein_g, "carbs_g": n.carbs_g, "fat_g": n.fat_g,
                     "sat_fat_g": n.sat_fat_g, "fiber_g": n.fiber_g, "sugar_g": n.sugar_g,
                     "sodium_mg": n.sodium_mg, "is_estimate": body.is_estimate, "user_edited": it.user_edited})
    await db.insert("meal_items", rows)
    return {"meal_id": meal["id"], "total": ne.sum_nutrients(computed).__dict__, "items": rows}


@router.get("/dashboard")
async def dashboard(day: date = Query(alias="date"), hour: int = Query(default=None, ge=0, le=23),
                    user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    prof = await db.select("user_profiles", select="target_kcal,target_protein_g,target_carbs_g,"
                           "target_fat_g,target_fiber_g,target_water_ml", user_id=f"eq.{user.id}")
    if not prof or prof[0]["target_kcal"] is None:
        raise HTTPException(409, "Complete onboarding to get daily targets")
    p = prof[0]
    d = day.isoformat()
    meals = await db.select("meal_logs", select="id,meal_type,meal_items(*)", user_id=f"eq.{user.id}", log_date=f"eq.{d}")
    water = await db.select("hydration_logs", select="amount_ml", user_id=f"eq.{user.id}", log_date=f"eq.{d}",
                            counts_toward_goal="eq.true")
    items = [nutrients_from_row(i) for m in meals for i in m["meal_items"]]
    targets = {"kcal": p["target_kcal"], "protein_g": p["target_protein_g"], "carbs_g": p["target_carbs_g"],
               "fat_g": p["target_fat_g"], "fiber_g": p["target_fiber_g"]}
    summary = ne.day_summary(items, targets)
    water_ml = sum(w["amount_ml"] for w in water)
    h = hour if hour is not None else datetime.now().hour
    return {
        "date": d, "targets": targets, "consumed": summary.consumed.__dict__,
        "remaining_kcal": summary.remaining_kcal, "remaining": summary.remaining,
        "water_ml": water_ml, "water_target_ml": p["target_water_ml"],
        "meals": [{"id": m["id"], "meal_type": m["meal_type"],
                   "kcal": round(sum(float(i["kcal"]) for i in m["meal_items"]), 1)} for m in meals],
        "insights": ne.insights(summary, water_ml=water_ml, water_target_ml=p["target_water_ml"], hour=h,
                                protein_target_g=p["target_protein_g"]),
    }
