from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, current_user
from app.core.config import Settings, get_settings
from app.core.db import Rest, get_db
from app.core.limits import limiter
from app.data.curated_foods import DIET_TAGS
from app.services import openfoodfacts as off
from app.services import usda
from app.services.account import AdminClient, get_admin, get_transport, safe_id
from app.services.nutrition_engine import Nutrients, validate_per_100g

router = APIRouter(prefix="/v1", tags=["foods"])

FOOD_SELECT = ("id,name,brand,barcode,source,source_ref,cuisine,serving_label,grams_per_unit,default_serving_g,"
               "allergens,diet_tags,owner_id,food_nutrition(kcal,protein_g,carbs_g,fat_g,sat_fat_g,fiber_g,sugar_g,sodium_mg)")
DietType = Literal["vegan", "vegetarian", "eggetarian", "pescatarian", "non_vegetarian"]
# strictest diet a food is compatible with -> tag set
DIET_CODE = {"vegan": "V", "vegetarian": "VG", "eggetarian": "E", "pescatarian": "F", "non_vegetarian": "N"}
NUTRITION_KEYS = ("kcal", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "fiber_g", "sugar_g", "sodium_mg")


def shape_food(row: dict) -> dict:
    nut = row.get("food_nutrition")
    if isinstance(nut, list):
        nut = nut[0] if nut else None
    out = {k: row.get(k) for k in ("id", "name", "brand", "barcode", "source", "cuisine", "serving_label",
                                   "grams_per_unit", "default_serving_g", "allergens", "diet_tags")}
    out["is_custom"] = row.get("owner_id") is not None
    out["nutrition"] = {k: nut.get(k) for k in NUTRITION_KEYS} if nut else None
    return out


async def create_food(rest: Rest, food: dict, nutrition: dict) -> dict:
    """Insert food_items + food_nutrition; remove the food row if the nutrition insert fails."""
    row = (await rest.insert("food_items", food))[0]
    try:
        await rest.insert("food_nutrition", {"food_id": row["id"], **nutrition})
    except HTTPException:
        await rest.delete("food_items", id=f"eq.{row['id']}")
        raise
    return shape_food({**row, "food_nutrition": [nutrition]})


# ---------------------------------------------------------------- barcode
@router.get("/foods/barcode/{code}")
async def barcode_lookup(code: str, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db),
                         admin: AdminClient | None = Depends(get_admin), transport=Depends(get_transport)):
    if not off.BARCODE_RE.match(code):
        raise HTTPException(422, "Barcode must be 8-14 digits")
    found = await db.select("food_items", select=FOOD_SELECT, barcode=f"eq.{code}", limit="1")
    if found:
        return {"food": shape_food(found[0]), "source": "catalog"}
    try:
        product = await off.fetch_product(code, transport)
    except off.ProductUnreliable as e:
        raise HTTPException(422, f"This product's nutrition data looks unreliable ({e}). Add it as a custom food.")
    except off.UpstreamUnavailable:
        raise HTTPException(502, "Product database is unavailable right now")
    if product is None:
        raise HTTPException(404, "Product not found")

    food = {"name": product["name"], "brand": product["brand"], "barcode": code, "source": "open_food_facts",
            "source_ref": code, "diet_tags": product["diet_tags"], "allergens": product["allergens"],
            "default_serving_g": product["default_serving_g"], "serving_label": product["serving_label"]}
    # Cache as a shared catalog item with the service role; without it, keep a private copy for this user.
    target = admin.rest() if admin else db
    if not admin:
        food["owner_id"] = user.id
    try:
        created = await create_food(target, food, product["nutrition"])
    except HTTPException:
        again = await db.select("food_items", select=FOOD_SELECT, barcode=f"eq.{code}", limit="1")  # lost a race
        if not again:
            raise
        created = shape_food(again[0])
    return {"food": created, "source": "open_food_facts"}


# ---------------------------------------------------------------- custom foods
class CustomFoodIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kcal: float = Field(ge=0, le=900)
    protein_g: float = Field(ge=0, le=100)
    carbs_g: float = Field(ge=0, le=100)
    fat_g: float = Field(ge=0, le=100)
    sat_fat_g: float | None = Field(default=None, ge=0, le=100)
    fiber_g: float | None = Field(default=None, ge=0, le=100)
    sugar_g: float | None = Field(default=None, ge=0, le=100)
    sodium_mg: float | None = Field(default=None, ge=0, le=40000)
    default_serving_g: float = Field(default=100, gt=0, le=2000)
    serving_label: str | None = Field(default=None, max_length=40)
    diet_type: DietType = "non_vegetarian"  # strictest diet this food suits (drives meal-plan filtering)


@router.post("/foods", status_code=201)
async def create_custom_food(body: CustomFoodIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    nutrition = {k: getattr(body, k) for k in NUTRITION_KEYS}
    problems = validate_per_100g(Nutrients(**nutrition))
    if problems:
        raise HTTPException(422, "Nutrition values (per 100 g) look inconsistent: " + "; ".join(problems))
    food = {"name": body.name.strip(), "source": "user", "owner_id": user.id, "diet_tags": DIET_TAGS[DIET_CODE[body.diet_type]],
            "default_serving_g": body.default_serving_g, "serving_label": body.serving_label}
    return {"food": await create_food(db, food, nutrition)}


# ---------------------------------------------------------------- recent + favourites
async def _foods_by_ids(db: Rest, ids: list[str]) -> dict[str, dict]:
    if not ids:
        return {}
    rows = await db.select("food_items", select=FOOD_SELECT, id=f"in.({','.join(safe_id(i) for i in ids)})")
    return {r["id"]: r for r in rows}


@router.get("/foods/recent")
async def recent_foods(user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    meals = await db.select("meal_logs", select="eaten_at,meal_items(food_id,quantity_g)", user_id=f"eq.{user.id}",
                            order="eaten_at.desc", limit="60")
    order: list[str] = []
    last: dict[str, dict] = {}
    for m in meals:
        for it in m.get("meal_items") or []:
            fid = it.get("food_id")
            if fid and fid not in last:
                last[fid] = {"last_quantity_g": it.get("quantity_g"), "last_eaten_at": m.get("eaten_at")}
                order.append(fid)
    order = order[:20]
    foods = await _foods_by_ids(db, order)
    return {"items": [{**shape_food(foods[i]), **last[i]} for i in order if i in foods]}


class FavoriteIn(BaseModel):
    food_id: str


@router.get("/favorites/foods")
async def list_favorite_foods(user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    favs = await db.select("user_favorites", select="food_id,created_at", user_id=f"eq.{user.id}",
                           order="created_at.desc")
    ids = [f["food_id"] for f in favs if f.get("food_id")]
    foods = await _foods_by_ids(db, ids)
    return {"items": [shape_food(foods[i]) for i in ids if i in foods]}


@router.post("/favorites/foods", status_code=201)
async def add_favorite_food(body: FavoriteIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    fid = safe_id(body.food_id)
    if not await db.select("food_items", select="id", id=f"eq.{fid}"):  # RLS hides other users' custom foods
        raise HTTPException(404, "Food not found")
    if not await db.select("user_favorites", select="id", user_id=f"eq.{user.id}", food_id=f"eq.{fid}"):
        await db.insert("user_favorites", {"user_id": user.id, "food_id": fid})
    return {"food_id": fid, "favorite": True}


@router.delete("/favorites/foods/{food_id}")
async def remove_favorite_food(food_id: str, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    await db.delete("user_favorites", user_id=f"eq.{user.id}", food_id=f"eq.{safe_id(food_id)}")
    return {"food_id": food_id, "favorite": False}


# ---------------------------------------------------------------- USDA
def _usda_key(s: Settings) -> str:
    if not s.usda_api_key:
        raise HTTPException(503, "USDA search is not configured")
    return s.usda_api_key


@router.get("/foods/usda")
@limiter.limit("30/minute")
async def usda_search(request: Request, q: str = Query(min_length=2, max_length=60), limit: int = Query(15, ge=1, le=30),
                      _: CurrentUser = Depends(current_user), s: Settings = Depends(get_settings),
                      transport=Depends(get_transport)):
    key = _usda_key(s)
    try:
        items = await usda.search(q.strip(), key, limit, transport)
    except usda.UsdaUnavailable:
        raise HTTPException(502, "USDA FoodData Central is unavailable right now")
    except LookupError:
        items = []
    return {"items": items}


class UsdaImportIn(BaseModel):
    fdc_id: int = Field(gt=0, lt=10**10)
    diet_type: DietType = "non_vegetarian"


@router.post("/foods/usda/import", status_code=201)
@limiter.limit("30/minute")
async def usda_import(request: Request, body: UsdaImportIn, user: CurrentUser = Depends(current_user),
                      db: Rest = Depends(get_db), s: Settings = Depends(get_settings),
                      admin: AdminClient | None = Depends(get_admin), transport=Depends(get_transport)):
    key = _usda_key(s)
    ref = str(body.fdc_id)
    existing = await db.select("food_items", select=FOOD_SELECT, source="eq.usda", source_ref=f"eq.{ref}", limit="1")
    if existing:
        return {"food": shape_food(existing[0])}
    try:
        item = await usda.detail(body.fdc_id, key, transport)
    except usda.UsdaUnavailable:
        raise HTTPException(502, "USDA FoodData Central is unavailable right now")
    except LookupError:
        raise HTTPException(404, "Food not found in USDA FoodData Central")
    if item is None:
        raise HTTPException(422, "This USDA record has missing or implausible nutrition data")
    food = {"name": item["name"], "brand": item["brand"], "source": "usda", "source_ref": ref,
            "diet_tags": DIET_TAGS[DIET_CODE[body.diet_type]]}
    target = admin.rest() if admin else db
    if not admin:
        food["owner_id"] = user.id
    return {"food": await create_food(target, food, item["nutrition"])}
