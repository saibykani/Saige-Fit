from collections import Counter
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.routers.meals import MEAL_TYPES, MealIn, MealItemIn, log_meal
from app.services import diet_engine as de
from app.services import nutrition_engine as ne
from app.services.account import safe_id
from app.services.ai_data import food_rows

router = APIRouter(prefix="/v1/meals", tags=["meals"])
SNAP = ("food_id", "name", "quantity_g", "kcal", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "fiber_g", "sugar_g", "sodium_mg")


def _f(v) -> float:
    return float(v or 0)


@router.get("/frequent")
async def frequent(limit: int = Query(8, ge=1, le=20), days: int = Query(90, ge=7, le=365), today: date | None = None,
                   user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    end = today or date.today()
    start = end - timedelta(days=days)
    meals = await db.select("meal_logs", select="id,meal_type,log_date,meal_items(*)", user_id=f"eq.{user.id}",
                            log_date=[f"gte.{start.isoformat()}", f"lte.{end.isoformat()}"])
    foods: dict[str, dict] = {}
    combos: dict[tuple, dict] = {}
    for m in sorted(meals, key=lambda x: str(x["log_date"])):  # oldest first so "last" is the most recent
        items = [i for i in (m.get("meal_items") or []) if i.get("food_id") and _f(i.get("quantity_g")) > 0]
        day = str(m["log_date"])[:10]
        for i in items:
            e = foods.setdefault(str(i["food_id"]), {"qty": Counter(), "n": 0})
            e["n"] += 1
            e["qty"][round(_f(i["quantity_g"]))] += 1
            e["row"], e["last"] = i, day
        if len(items) >= 2:  # a repeated multi-item meal is worth a one-tap re-log
            c = combos.setdefault((m["meal_type"], tuple(sorted(str(i["food_id"]) for i in items))), {"n": 0})
            c["n"] += 1
            c["meal_type"], c["items"], c["last"] = m["meal_type"], items, day
    out_foods = []
    for fid, e in sorted(foods.items(), key=lambda kv: (-kv[1]["n"], kv[0]))[:limit]:
        qty = e["qty"].most_common(1)[0][0]  # most used portion
        row = e["row"]
        k = qty / _f(row["quantity_g"])
        out_foods.append({"food_id": fid, "name": row["name"], "times": e["n"], "default_quantity_g": qty, "last_logged": e["last"],
                          **{n: round(_f(row[n]) * k, 1) for n in ("kcal", "protein_g", "carbs_g", "fat_g")}})
    out_meals = []
    for c in sorted((c for c in combos.values() if c["n"] >= 2), key=lambda c: -c["n"])[:limit]:
        its = [{"food_id": str(i["food_id"]), "name": i["name"], "quantity_g": _f(i["quantity_g"])} for i in c["items"]]
        out_meals.append({"meal_type": c["meal_type"], "name": " + ".join(i["name"] for i in its[:3]), "times": c["n"], "items": its,
                          "kcal": round(sum(_f(i["kcal"]) for i in c["items"]), 1),
                          "protein_g": round(sum(_f(i["protein_g"]) for i in c["items"]), 1)})
    return {"foods": out_foods, "meals": out_meals}


class CopyIn(BaseModel):
    from_date: date
    to_date: date
    meal_types: list[str] | None = Field(default=None, max_length=7)


@router.post("/copy")
async def copy_meals(body: CopyIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    if body.from_date == body.to_date:
        raise HTTPException(422, "Choose a different target day")
    if body.meal_types and any(t not in MEAL_TYPES for t in body.meal_types):
        raise HTTPException(422, "Unknown meal_type")
    src = await db.select("meal_logs", select="id,meal_type,meal_items(*)", user_id=f"eq.{user.id}",
                          log_date=f"eq.{body.from_date.isoformat()}", order="eaten_at.asc")
    if body.meal_types:
        src = [m for m in src if m["meal_type"] in body.meal_types]
    src = [m for m in src if m.get("meal_items")]
    have = {m["meal_type"] for m in await db.select("meal_logs", select="id,meal_type", user_id=f"eq.{user.id}",
                                                    log_date=f"eq.{body.to_date.isoformat()}")}
    ids, skipped, kcal = [], set(), 0.0
    for m in src:
        if m["meal_type"] in have:  # never double-count a slot that already has food
            skipped.add(m["meal_type"])
            continue
        new = (await db.insert("meal_logs", {"user_id": user.id, "meal_type": m["meal_type"],
                                             "log_date": body.to_date.isoformat()}))[0]
        await db.insert("meal_items", [{"meal_id": new["id"], **{k: i.get(k) for k in SNAP},
                                        "is_estimate": bool(i.get("is_estimate")), "user_edited": False} for i in m["meal_items"]])
        ids.append(new["id"])
        kcal += sum(_f(i["kcal"]) for i in m["meal_items"])
    return {"copied": len(ids), "meal_ids": ids, "skipped_meal_types": sorted(skipped), "kcal": round(kcal, 1)}


class SuggestionLogIn(BaseModel):
    kind: str = Field(pattern="^(food|recipe)$")
    id: str = Field(min_length=1, max_length=64)
    meal_type: str
    log_date: date
    servings: float = Field(default=1.0, gt=0, le=10)


@router.post("/log-suggestion", status_code=201)
async def log_suggestion(body: SuggestionLogIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    """One-tap log of a next-meal suggestion: resolves the portion server-side and reuses POST /v1/meals."""
    sid = safe_id(body.id)
    if body.kind == "food":
        food = next((f for f in de.build_foods(await food_rows(db)) if f.id == sid), None)
        if not food:
            raise HTTPException(404, "Food not found")
        items = [MealItemIn(food_id=sid, quantity_g=round(min(food.default_g * body.servings, ne.MAX_PORTION_G), 1))]
    else:
        rec = await db.select("recipes", select="id,servings", id=f"eq.{sid}")
        if not rec:
            raise HTTPException(404, "Recipe not found")
        ings = await db.select("recipe_ingredients", select="food_id,grams", recipe_id=f"eq.{sid}", order="position.asc")
        sv = max(1, int(rec[0].get("servings") or 1))
        items = [MealItemIn(food_id=str(i["food_id"]), quantity_g=round(min(float(i["grams"]) / sv * body.servings, ne.MAX_PORTION_G), 1))
                 for i in ings if i.get("food_id") and float(i["grams"]) > 0][:30]
        if not items:
            raise HTTPException(409, "This recipe has no loggable ingredients")
    return await log_meal(MealIn(meal_type=body.meal_type, log_date=body.log_date, items=items), user, db)
