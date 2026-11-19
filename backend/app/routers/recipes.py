from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.services import diet_engine as de
from app.services.ai_data import food_rows
from app.services.nutrition_engine import sum_nutrients

router = APIRouter(tags=["recipes"])
IdPath = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
DIETS = {"vegan", "vegetarian", "eggetarian", "non_vegetarian", "pescatarian"}


async def _load(db: Rest):
    recipes = await db.select("recipes", select="*", order="name", limit="500")
    ings = await db.select("recipe_ingredients", select="*", order="position.asc", limit="5000")
    foods = {f.id: f for f in de.build_foods(await food_rows(db))}
    return recipes, ings, foods


def summarize(r: dict, ings: list[dict], foods: dict[str, de.Food]) -> dict:
    mine = [i for i in ings if i["recipe_id"] == r["id"]]
    fs = [foods[str(i["food_id"])] for i in mine if str(i["food_id"]) in foods]
    tot = sum_nutrients([foods[str(i["food_id"])].nutrients(float(i["grams"])) for i in mine if str(i["food_id"]) in foods])
    sv = max(1, int(r.get("servings") or 1))
    diets = set(de.DIET_TAGS_ALL)
    allergens: set[str] = set()
    for f in fs:
        diets &= set(f.diet_tags)
        allergens |= f.allergens
    per = {k: round(float(getattr(tot, k) or 0) / sv, 1) for k in ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")}
    return {"id": r["id"], "name": r["name"], "cuisine": r.get("cuisine"), "description": r.get("description"), "servings": sv,
            "prep_minutes": r.get("prep_minutes"), "cook_minutes": r.get("cook_minutes"), "tags": r.get("tags") or [],
            "diet_tags": sorted(diets), "allergens": sorted(allergens), "nutrition_per_serving": per, "is_estimate": True}


async def _favorites(db: Rest, uid: str) -> set[str]:
    rows = await db.select("user_favorites", select="recipe_id", user_id=f"eq.{uid}")
    return {str(r["recipe_id"]) for r in rows if r.get("recipe_id")}


@router.get("/v1/recipes")
async def list_recipes(q: str | None = Query(None, max_length=60), diet: str | None = Query(None, max_length=20),
                       user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    if diet and diet not in DIETS:
        raise HTTPException(422, "Unknown diet")
    recipes, ings, foods = await _load(db)
    favs = await _favorites(db, user.id)
    out = []
    for r in recipes:
        s = summarize(r, ings, foods)
        hay = f"{s['name']} {s['description'] or ''} {' '.join(s['tags'])}".lower()
        if q and q.lower() not in hay:
            continue
        if diet and diet not in s["diet_tags"]:
            continue
        out.append({**s, "is_favorite": r["id"] in favs})
    return {"items": out}


@router.get("/v1/recipes/{recipe_id}")
async def recipe_detail(recipe_id: IdPath, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    recipes, ings, foods = await _load(db)
    r = next((x for x in recipes if x["id"] == recipe_id), None)
    if not r:
        raise HTTPException(404, "Recipe not found")
    mine = sorted([i for i in ings if i["recipe_id"] == recipe_id], key=lambda i: i.get("position") or 0)
    return {**summarize(r, ings, foods), "steps": r.get("steps") or [], "is_favorite": recipe_id in await _favorites(db, user.id),
            "ingredients": [{"food_id": str(i["food_id"]), "name": foods[str(i["food_id"])].name if str(i["food_id"]) in foods else None,
                             "grams": float(i["grams"]), "note": i.get("note")} for i in mine],
            "note": "Ingredient weights are as eaten (cooked/prepared)."}


@router.post("/v1/favorites/recipes/{recipe_id}", status_code=201)
async def add_favorite(recipe_id: IdPath, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    if not await db.select("recipes", select="id", id=f"eq.{recipe_id}"):
        raise HTTPException(404, "Recipe not found")
    if recipe_id not in await _favorites(db, user.id):
        await db.insert("user_favorites", {"user_id": user.id, "recipe_id": recipe_id})
    return {"recipe_id": recipe_id, "is_favorite": True}


@router.delete("/v1/favorites/recipes/{recipe_id}")
async def remove_favorite(recipe_id: IdPath, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    await db.delete("user_favorites", user_id=f"eq.{user.id}", recipe_id=f"eq.{recipe_id}")
    return {"recipe_id": recipe_id, "is_favorite": False}
