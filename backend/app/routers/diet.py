import random
import re
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.services import diet_engine as de
from app.services import nutrition_engine as ne
from app.services import shopping
from app.services.ai_data import FOOD_SELECT, food_rows, load_prefs, require_profile, targets_from_profile, utc_today
from app.services.entitlements import require_feature
from app.services.scanner import nutrients_from_row
from app.services import workout_engine as we

router = APIRouter(prefix="/v1/diet", tags=["diet"])
IdPath = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
PERIOD_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}
DISCLAIMER = "Meal plans are estimates for healthy adults, not medical advice. Check with a professional if you have a health condition."


def prefs_from(row: dict) -> de.Prefs:
    return de.Prefs(diet_type=row["diet_type"], allergies=row.get("allergies") or [], intolerances=row.get("intolerances") or [],
                    restrictions=row.get("restrictions") or [], liked=row.get("liked_foods") or [], disliked=row.get("disliked_foods") or [],
                    cuisines=row.get("cuisines") or [], meals_per_day=int(row.get("meals_per_day") or 4),
                    budget=float(row["monthly_budget"]) if row.get("monthly_budget") is not None else None)


def training_weekdays(profile: dict) -> set[int]:
    chosen = [int(d) for d in (profile.get("workout_days") or [])]
    if not chosen and profile.get("training_days"):
        chosen = we.pick_weekdays(None, int(profile["training_days"]))
    return set(chosen)


async def owned_plan(db: Rest, uid: str, plan_id: str) -> dict:
    rows = await db.select("diet_plans", select="*", id=f"eq.{plan_id}", user_id=f"eq.{uid}")
    if not rows:
        raise HTTPException(404, "Plan not found")
    return rows[0]


async def owned_item(db: Rest, uid: str, item_id: str) -> tuple[dict, dict]:
    rows = await db.select("diet_plan_meals", select="*", id=f"eq.{item_id}")
    if not rows:
        raise HTTPException(404, "Meal not found")
    return rows[0], await owned_plan(db, uid, rows[0]["plan_id"])


def num(v) -> float:
    return round(float(v), 1)


def item_out(r: dict, food: de.Food | None) -> dict:
    return {"id": r["id"], "food_id": r.get("food_id"), "name": r["name"], "quantity_g": num(r["quantity_g"]),
            "quantity_label": de.quantity_label(food, float(r["quantity_g"])) if food else f"{round(float(r['quantity_g']))} g",
            "kcal": num(r["kcal"]), "protein_g": num(r["protein_g"]), "carbs_g": num(r["carbs_g"]), "fat_g": num(r["fat_g"]),
            "instructions": r.get("instructions"), "alternatives": r.get("alternatives") or []}


def totals_of(rows: list[dict]) -> dict:
    return {k: round(sum(float(r[k]) for r in rows), 1) for k in ("kcal", "protein_g", "carbs_g", "fat_g")}


def hhmm(v) -> str | None:
    return str(v)[:5] if v else None


# ---------- generate ----------
class GenerateIn(BaseModel):
    period: Literal["daily", "weekly", "monthly"]
    start_date: date


@router.post("/generate", status_code=201)
async def generate(body: GenerateIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    await require_feature(db, user.id, "ai_meal_suggestions")
    prof = await require_profile(db, user.id, need_targets=True)
    prefs = prefs_from(await load_prefs(db, user.id))
    foods = de.build_foods(await food_rows(db))
    n = PERIOD_DAYS[body.period]
    tdays = training_weekdays(prof)
    flags = [(body.start_date + timedelta(days=i)).isoweekday() in tdays for i in range(n)]
    targets = targets_from_profile(prof)
    try:
        # the engine rotates by day index; flags are per calendar day so pass the full-length list
        allowed = de.allowed_foods(foods, prefs)
        if len(allowed) < 3:
            raise ValueError("Not enough foods match your dietary preferences to build a plan")
        days = [de.build_day(allowed, prefs, targets, i, flags[i]) for i in range(n)]
    except ValueError as e:
        raise HTTPException(422, str(e))

    plan = (await db.insert("diet_plans", {"user_id": user.id, "period": body.period, "start_date": body.start_date.isoformat(),
                                           "target_kcal": round(targets.kcal), "generated_by": "engine"}))[0]
    rows, warnings = [], []
    for i, day in enumerate(days):
        warnings += [f"{(body.start_date + timedelta(days=i)).isoformat()}: {w}" for w in day.warnings]
        for r in de.to_plan_rows(day, allowed):
            rows.append({"plan_id": plan["id"], "plan_date": (body.start_date + timedelta(days=i)).isoformat(), "meal_type": r["meal_type"],
                         "food_id": r["food_id"], "name": r["name"], "quantity_g": r["quantity_g"], "kcal": r["kcal"], "protein_g": r["protein_g"],
                         "carbs_g": r["carbs_g"], "fat_g": r["fat_g"], "instructions": r["instructions"], "alternatives": r["alternatives"],
                         "scheduled_time": r["scheduled_time"]})
    await db.insert("diet_plan_meals", rows)
    return {"plan_id": plan["id"], "period": body.period, "start_date": body.start_date.isoformat(), "days": n,
            "warnings": warnings[:10], "disclaimer": DISCLAIMER}


# ---------- read ----------
@router.get("/plan")
async def get_plan(date_: date = Query(alias="date"), user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    d = date_.isoformat()
    plans = [p for p in await db.select("diet_plans", select="*", user_id=f"eq.{user.id}", order="created_at.desc") if p["start_date"] <= d]
    rows: list[dict] = []
    plan = None
    for p in plans:  # newest plan that actually covers this date wins
        rows = await db.select("diet_plan_meals", select="*", plan_id=f"eq.{p['id']}", plan_date=f"eq.{d}")
        if rows:
            plan = p
            break
    if not plan:
        return {"plan_id": None, "date": d, "meals": [], "totals": None, "targets": None}
    foods = {f.id: f for f in de.build_foods(await db.select("food_items", select=FOOD_SELECT,
                                                             id=f"in.({','.join(sorted({str(r['food_id']) for r in rows if r.get('food_id')}))})"))} \
        if any(r.get("food_id") for r in rows) else {}
    prof = await require_profile(db, user.id)
    meals = []
    for slot in de.SLOTS:
        its = [r for r in rows if r["meal_type"] == slot]
        if its:
            meals.append({"meal_type": slot, "scheduled_time": hhmm(its[0].get("scheduled_time")), "totals": totals_of(its),
                          "items": [item_out(r, foods.get(str(r.get("food_id")))) for r in its]})
    targets = ({"kcal": prof["target_kcal"], "protein_g": prof["target_protein_g"], "carbs_g": prof["target_carbs_g"], "fat_g": prof["target_fat_g"]}
               if prof.get("target_kcal") is not None else None)
    return {"plan_id": plan["id"], "date": d, "period": plan["period"], "meals": meals, "totals": totals_of(rows), "targets": targets,
            "disclaimer": DISCLAIMER}


# ---------- edit ----------
class ReplaceIn(BaseModel):
    alternative_index: int | None = Field(default=None, ge=0, le=5)
    food_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,64}$")
    quantity_g: float | None = Field(default=None, gt=0, le=ne.MAX_PORTION_G)


@router.post("/meals/{item_id}/replace")
async def replace(item_id: IdPath, body: ReplaceIn | None = None, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    """Swap a food. With alternative_index use one of the stored alternatives; with food_id pick any allowed food;
    with no body, regenerate (a different comparable food is chosen)."""
    body = body or ReplaceIn()
    row, _plan = await owned_item(db, user.id, item_id)
    prefs = prefs_from(await load_prefs(db, user.id))
    allowed = de.allowed_foods(de.build_foods(await food_rows(db)), prefs)
    by_id = {f.id: f for f in allowed}
    cur_id = str(row["food_id"]) if row.get("food_id") else None
    grams = float(row["quantity_g"])
    day_rows = await db.select("diet_plan_meals", select="food_id", plan_id=f"eq.{row['plan_id']}", plan_date=f"eq.{row['plan_date']}")
    day_ids = {str(r["food_id"]) for r in day_rows if r.get("food_id")}

    if body.alternative_index is not None:
        alts = row.get("alternatives") or []
        if body.alternative_index >= len(alts):
            raise HTTPException(422, "No such alternative")
        new_id, new_g = str(alts[body.alternative_index]["food_id"]), float(alts[body.alternative_index]["quantity_g"])
    elif body.food_id:
        if body.food_id not in by_id:
            raise HTTPException(422, "That food doesn't match your dietary preferences")
        new_id = body.food_id
        f = by_id[new_id]
        cur = by_id.get(cur_id) or next((x for x in de.build_foods(await food_rows(db)) if x.id == cur_id), None)
        target_kcal = float(row["kcal"])
        new_g = body.quantity_g or min(3 * f.default_g, max(f.step, round((target_kcal / (f.n100.kcal / 100.0)) / f.step) * f.step))
    else:
        cur = by_id.get(cur_id) or next((x for x in de.build_foods(await food_rows(db)) if x.id == cur_id), None)
        if not cur:
            raise HTTPException(409, "The original food is no longer available")
        cands = de.swap_candidates(cur, grams, None, allowed, day_ids, 6)
        pick = de.pick_random(cands, random.Random())
        if not pick:
            raise HTTPException(422, "No other suitable foods found")
        new_id, new_g = pick["food_id"], float(pick["quantity_g"])

    if new_id not in by_id:
        raise HTTPException(422, "That food doesn't match your dietary preferences")
    f = by_id[new_id]
    if body.quantity_g and body.alternative_index is not None:
        new_g = body.quantity_g
    n = f.nutrients(new_g)
    alts = de.alternatives_for(f, new_g, allowed, day_ids | {new_id}, 2)
    upd = {"food_id": new_id, "name": f.name, "quantity_g": new_g, "kcal": n.kcal, "protein_g": n.protein_g, "carbs_g": n.carbs_g,
           "fat_g": n.fat_g, "instructions": de.prep_text(f), "alternatives": alts}
    saved = (await db.update("diet_plan_meals", upd, id=f"eq.{item_id}"))[0]
    return {"item": item_out({**row, **saved}, f)}


class LogIn(BaseModel):
    log_date: date | None = None


@router.post("/meals/{item_id}/log", status_code=201)
async def log_meal(item_id: IdPath, body: LogIn | None = None, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    """Adds the whole meal (all foods sharing this item's slot and day) to the food journal. Nutrition is
    recomputed from the food records, not copied from the plan."""
    row, _plan = await owned_item(db, user.id, item_id)
    group = [r for r in await db.select("diet_plan_meals", select="*", plan_id=f"eq.{row['plan_id']}", plan_date=f"eq.{row['plan_date']}")
             if r["meal_type"] == row["meal_type"]]
    ids = sorted({str(r["food_id"]) for r in group if r.get("food_id")})
    if not ids:
        raise HTTPException(409, "These foods are no longer available")
    foods = {str(f["id"]): f for f in await db.select("food_items", select="id,name,food_nutrition(*)", id=f"in.({','.join(ids)})")}
    log_date = (body.log_date if body and body.log_date else date.fromisoformat(str(row["plan_date"])[:10])).isoformat()
    meal = (await db.insert("meal_logs", {"user_id": user.id, "meal_type": row["meal_type"], "log_date": log_date}))[0]
    items, computed = [], []
    for r in group:
        f = foods.get(str(r.get("food_id")))
        if not f:
            continue
        nut = f["food_nutrition"]
        n = nutrients_from_row(nut[0] if isinstance(nut, list) else nut).scaled(float(r["quantity_g"]))
        computed.append(n)
        items.append({"meal_id": meal["id"], "food_id": f["id"], "name": f["name"], "quantity_g": float(r["quantity_g"]), "kcal": n.kcal,
                      "protein_g": n.protein_g, "carbs_g": n.carbs_g, "fat_g": n.fat_g, "sat_fat_g": n.sat_fat_g, "fiber_g": n.fiber_g,
                      "sugar_g": n.sugar_g, "sodium_mg": n.sodium_mg, "is_estimate": False, "user_edited": False})
    await db.insert("meal_items", items)
    return {"meal_id": meal["id"], "total": ne.sum_nutrients(computed).__dict__, "items": len(items)}


class TimeIn(BaseModel):
    scheduled_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


@router.patch("/meals/{item_id}")
async def set_time(item_id: IdPath, body: TimeIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    row, _plan = await owned_item(db, user.id, item_id)
    group = [r for r in await db.select("diet_plan_meals", select="id,meal_type", plan_id=f"eq.{row['plan_id']}", plan_date=f"eq.{row['plan_date']}")
             if r["meal_type"] == row["meal_type"]]
    for r in group:
        await db.update("diet_plan_meals", {"scheduled_time": body.scheduled_time}, id=f"eq.{r['id']}")
    return {"updated": len(group), "meal_type": row["meal_type"], "scheduled_time": body.scheduled_time}


# ---------- shopping list ----------
@router.get("/shopping-list")
async def shopping_list(plan_id: str | None = Query(None, pattern=r"^[A-Za-z0-9_-]{1,64}$"), days: int = Query(7, ge=1, le=30),
                        start: date | None = None, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    if plan_id:
        plan = await owned_plan(db, user.id, plan_id)
    else:
        plans = await db.select("diet_plans", select="*", user_id=f"eq.{user.id}", order="created_at.desc", limit="1")
        if not plans:
            raise HTTPException(404, "Generate a diet plan first")
        plan = plans[0]
    first = start or date.fromisoformat(str(plan["start_date"])[:10])
    last = first + timedelta(days=days - 1)
    rows = [r for r in await db.select("diet_plan_meals", select="*", plan_id=f"eq.{plan['id']}")
            if first.isoformat() <= str(r["plan_date"])[:10] <= last.isoformat()]
    ids = sorted({str(r["food_id"]) for r in rows if r.get("food_id")})
    foods = {f.id: f for f in de.build_foods(await db.select("food_items", select=FOOD_SELECT, id=f"in.({','.join(ids)})"))} if ids else {}
    groups = shopping.aggregate([{"food_id": r.get("food_id"), "name": r["name"], "quantity_g": r["quantity_g"]} for r in rows], foods)
    return {"plan_id": plan["id"], "from": first.isoformat(), "to": last.isoformat(), "days": days, "groups": groups, "note": shopping.NOTE}


# ---------- what to eat next ----------
@router.get("/recommendations")
async def recommendations(date_: date = Query(alias="date"), hour: int | None = Query(None, ge=0, le=23),
                          user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    prof = await require_profile(db, user.id, need_targets=True)
    prefs = prefs_from(await load_prefs(db, user.id))
    allowed = de.allowed_foods(de.build_foods(await food_rows(db)), prefs)
    d = date_.isoformat()
    meals = await db.select("meal_logs", select="id,meal_type,meal_items(*)", user_id=f"eq.{user.id}", log_date=f"eq.{d}")
    eaten = ne.sum_nutrients([nutrients_from_row(i) for m in meals for i in m.get("meal_items", [])])
    remaining = {"kcal": round(float(prof["target_kcal"]) - eaten.kcal, 1), "protein_g": round(float(prof["target_protein_g"]) - eaten.protein_g, 1),
                 "carbs_g": round(float(prof["target_carbs_g"]) - eaten.carbs_g, 1), "fat_g": round(float(prof["target_fat_g"]) - eaten.fat_g, 1),
                 "fiber_g": round(float(prof.get("target_fiber_g") or 25) - (eaten.fiber_g or 0), 1), "protein_target": float(prof["target_protein_g"])}
    h = hour if hour is not None else datetime.now(timezone.utc).hour
    out = de.recommendations(allowed, remaining, h)
    return {"date": d, "consumed": eaten.__dict__, "remaining": {k: v for k, v in remaining.items() if k != "protein_target"}, **out,
            "disclaimer": DISCLAIMER}
