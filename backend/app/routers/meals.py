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
    act = await db.select("daily_activity", select="steps,sleep_hours", user_id=f"eq.{user.id}", log_date=f"eq.{d}")
    sessions = await db.select("workout_sessions", select="started_at,finished_at,kcal_burned", user_id=f"eq.{user.id}",
                               log_date=f"eq.{d}")
    planned = await db.select("diet_plan_meals", select="meal_type,name,kcal", plan_date=f"eq.{d}")  # RLS: own plans only
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
        "activity": _activity(act, sessions),
        "meal_slots": _meal_slots(meals, planned),
        "insights": ne.insights(summary, water_ml=water_ml, water_target_ml=p["target_water_ml"], hour=h,
                                protein_target_g=p["target_protein_g"]),
    }


SLOTS = ["early_morning", "breakfast", "mid_morning", "lunch", "evening_snack", "dinner"]


def _activity(act: list[dict], sessions: list[dict]) -> dict:
    """steps/sleep come from the user's daily_activity row; workout figures from finished sessions."""
    a = act[0] if act else {}
    minutes = 0.0
    kcal = 0.0
    for x in sessions:
        if not x.get("finished_at"):
            continue
        try:
            st = datetime.fromisoformat(str(x["started_at"]).replace("Z", "+00:00"))
            en = datetime.fromisoformat(str(x["finished_at"]).replace("Z", "+00:00"))
            minutes += max(0.0, (en - st).total_seconds() / 60)
        except (KeyError, ValueError):
            pass
        kcal += float(x.get("kcal_burned") or 0)
    return {"steps": a.get("steps"), "sleep_hours": None if a.get("sleep_hours") is None else float(a["sleep_hours"]),
            "workout_minutes": round(minutes), "active_kcal": round(kcal)}  # active_kcal = estimated, from workouts


def _meal_slots(meals: list[dict], planned: list[dict]) -> list[dict]:
    """Planned (from today's diet plan) vs logged calories for each meal slot."""
    logged: dict[str, float] = {}
    for m in meals:
        logged[m["meal_type"]] = logged.get(m["meal_type"], 0.0) + sum(float(i["kcal"]) for i in m["meal_items"])
    plan: dict[str, list[dict]] = {}
    for p in planned:
        plan.setdefault(p["meal_type"], []).append(p)
    slots = SLOTS + [k for k in list(logged) + list(plan) if k not in SLOTS]
    seen, out = set(), []
    for k in slots:
        if k in seen or (k not in SLOTS and k not in logged and k not in plan):
            continue
        seen.add(k)
        out.append({"meal_type": k, "planned_kcal": round(sum(float(p["kcal"]) for p in plan[k]), 1) if k in plan else None,
                    "planned_meals": [p["name"] for p in plan.get(k, [])], "logged_kcal": round(logged.get(k, 0.0), 1)})
    return out


class ActivityIn(BaseModel):
    date: date
    steps: int | None = Field(default=None, ge=0, le=200_000)
    sleep_hours: float | None = Field(default=None, ge=0, le=24)


@router.post("/activity")
async def log_activity(body: ActivityIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    vals = {k: v for k, v in (("steps", body.steps), ("sleep_hours", body.sleep_hours)) if v is not None}
    if not vals:
        raise HTTPException(422, "Provide steps and/or sleep_hours")
    # only provided fields are written, so logging steps never wipes a previously logged sleep value
    row = (await db.upsert("daily_activity", {"user_id": user.id, "log_date": body.date.isoformat(), **vals},
                           on_conflict="user_id,log_date"))[0]
    return {"date": body.date.isoformat(), "steps": row.get("steps"), "sleep_hours": row.get("sleep_hours")}
