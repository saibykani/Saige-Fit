"""USDA FoodData Central client + parser (values per 100 g). The API key lives server-side only."""
from __future__ import annotations

import httpx

from app.services.nutrition_engine import Nutrients
from app.services.openfoodfacts import import_problems, num

BASE = "https://api.nal.usda.gov/fdc/v1"
# nutrient number -> field. 957/958 are Atwater energy, used only when 208 is absent.
NUMBERS = {"208": "kcal", "203": "protein_g", "205": "carbs_g", "204": "fat_g", "606": "sat_fat_g",
           "291": "fiber_g", "269": "sugar_g", "307": "sodium_mg"}
ATWATER_ENERGY = ("957", "958")


class UsdaUnavailable(Exception):
    pass


def _nutrient_map(food: dict) -> dict[str, float]:
    out: dict[str, float] = {}
    for fn in food.get("foodNutrients") or []:
        # search results: {nutrientNumber, value}; detail results: {nutrient:{number}, amount}
        number = str(fn.get("nutrientNumber") or (fn.get("nutrient") or {}).get("number") or "")
        value = num(fn.get("value") if fn.get("value") is not None else fn.get("amount"))
        if number and value is not None:
            out.setdefault(number, value)
    return out


def parse_food(food: dict) -> dict | None:
    """Normalised food dict, or None when the record is unusable/implausible."""
    nm = _nutrient_map(food)
    kcal = nm.get("208")
    if kcal is None:
        kcal = next((nm[k] for k in ATWATER_ENERGY if k in nm), None)
    name = (food.get("description") or "").strip()
    if kcal is None or not name or food.get("fdcId") is None:
        return None
    if name.isupper():
        name = name.title()
    nut = Nutrients(kcal=round(kcal, 1), protein_g=nm.get("203", 0.0), carbs_g=nm.get("205", 0.0), fat_g=nm.get("204", 0.0),
                    sat_fat_g=nm.get("606"), fiber_g=nm.get("291"), sugar_g=nm.get("269"), sodium_mg=nm.get("307"))
    if import_problems(nut):
        return None
    brand = food.get("brandOwner") or food.get("brandName")
    return {"fdc_id": int(food["fdcId"]), "name": name[:120], "brand": brand[:80] if brand else None,
            "data_type": food.get("dataType"), "nutrition": nut.__dict__}


async def _get(path: str, params: dict, transport) -> dict:
    try:
        async with httpx.AsyncClient(transport=transport, timeout=10) as c:
            r = await c.get(f"{BASE}{path}", params=params)
    except httpx.HTTPError:
        raise UsdaUnavailable()
    if r.status_code == 404:
        raise LookupError("not found")
    if r.status_code >= 400:
        raise UsdaUnavailable()
    try:
        return r.json()
    except ValueError:
        raise UsdaUnavailable()


async def search(query: str, api_key: str, page_size: int = 15, transport=None) -> list[dict]:
    data = await _get("/foods/search", {"api_key": api_key, "query": query, "pageSize": page_size,
                                         "dataType": "Foundation,SR Legacy"}, transport)
    return [f for f in (parse_food(x) for x in data.get("foods") or []) if f]


async def detail(fdc_id: int, api_key: str, transport=None) -> dict | None:
    return parse_food(await _get(f"/food/{int(fdc_id)}", {"api_key": api_key}, transport))
