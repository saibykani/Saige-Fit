from datetime import date, datetime, timezone
import re

from fastapi import APIRouter, Depends, Query

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.routers.diet import prefs_from
from app.services import diet_engine as de
from app.services import next_meal as nm
from app.services import nutrition_engine as ne
from app.services.ai_data import food_rows, load_prefs, require_profile
from app.services.scanner import nutrients_from_row

router = APIRouter(prefix="/v1/suggestions", tags=["suggestions"])


def recipe_allowed(s: dict, p: de.Prefs) -> bool:
    banned = de.normalise_allergens(p.allergies) | de.normalise_allergens(p.intolerances)
    words = de.excluded_words(p.restrictions, p.disliked)
    tokens = set(re.findall(r"[a-z]+", s["name"].lower()))
    return p.diet_type in s["diet_tags"] and not (set(s["allergens"]) & banned) and not (tokens & words)


@router.get("/next-meal")
async def next_meal(day: date | None = Query(None, alias="date"), hour: int | None = Query(None, ge=0, le=23),
                    user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    prof = await require_profile(db, user.id, need_targets=True)
    prefs = prefs_from(await load_prefs(db, user.id))
    d = (day or datetime.now(timezone.utc).date()).isoformat()
    meals = await db.select("meal_logs", select="id,meal_type,meal_items(*)", user_id=f"eq.{user.id}", log_date=f"eq.{d}")
    eaten = ne.sum_nutrients([nutrients_from_row(i) for m in meals for i in m.get("meal_items", [])])
    remaining = {"kcal": round(float(prof["target_kcal"]) - eaten.kcal, 1), "protein_g": round(float(prof["target_protein_g"]) - eaten.protein_g, 1),
                 "carbs_g": round(float(prof["target_carbs_g"]) - eaten.carbs_g, 1), "fat_g": round(float(prof["target_fat_g"]) - eaten.fat_g, 1)}
    foods = {f.id: f for f in de.build_foods(await food_rows(db))}
    recipes = await db.select("recipes", select="*", order="name", limit="500")
    ings = await db.select("recipe_ingredients", select="*", order="position.asc", limit="5000")
    allowed_recipes = [s for s in (nm.recipe_summary(r, ings, foods) for r in recipes) if s and recipe_allowed(s, prefs)]
    h = hour if hour is not None else datetime.now(timezone.utc).hour
    out = nm.suggest(allowed_recipes, de.allowed_foods(list(foods.values()), prefs), remaining, h)
    return {"date": d, "remaining": remaining, **out}
