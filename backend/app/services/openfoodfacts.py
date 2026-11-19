"""Open Food Facts barcode lookup. Parsing is pure and strict: implausible products are rejected
rather than stored, because user-visible calories must be trustworthy."""
from __future__ import annotations

import math
import re

import httpx

from app.services.nutrition_engine import Nutrients, validate_per_100g

OFF_URL = "https://world.openfoodfacts.org/api/v2/product/{code}.json"
FIELDS = "code,product_name,generic_name,brands,nutriments,serving_quantity,serving_size,allergens_tags,ingredients_analysis_tags"
BARCODE_RE = re.compile(r"^\d{8,14}$")

ALL_DIETS = ["vegan", "vegetarian", "eggetarian", "non_vegetarian", "pescatarian"]
VEGETARIAN_DIETS = ["vegetarian", "eggetarian", "non_vegetarian", "pescatarian"]


class ProductUnreliable(ValueError):
    """The upstream product exists but its nutrition data fails validation."""


class UpstreamUnavailable(Exception):
    pass


def num(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) and f >= 0 else None


def diet_tags_from(analysis: list[str] | None) -> list[str]:
    tags = set(analysis or [])
    if "en:vegan" in tags:
        return ALL_DIETS
    if "en:vegetarian" in tags:
        return VEGETARIAN_DIETS
    return ["non_vegetarian"]  # unknown => only claim compatibility for people with no restriction


def import_problems(n: Nutrients) -> list[str]:
    """validate_per_100g plus: stated energy with no macros at all can't be verified, so reject it."""
    problems = validate_per_100g(n)
    if n.kcal >= 20 and n.protein_g + n.carbs_g + n.fat_g == 0:
        problems.append("energy is stated but no macronutrients are recorded")
    return problems


def nutrition_from_nutriments(n: dict) -> Nutrients:
    kcal = num(n.get("energy-kcal_100g"))
    if kcal is None:
        kj = num(n.get("energy_100g"))
        kcal = None if kj is None else kj / 4.184
    if kcal is None:
        raise ProductUnreliable("Energy value missing")
    sodium_g = num(n.get("sodium_100g"))
    salt_g = num(n.get("salt_100g"))
    sodium_mg = sodium_g * 1000 if sodium_g is not None else (salt_g * 400 if salt_g is not None else None)

    def r(v, d=2):
        return None if v is None else round(v, d)

    nut = Nutrients(kcal=round(kcal, 1), protein_g=r(num(n.get("proteins_100g")) or 0.0),
                    carbs_g=r(num(n.get("carbohydrates_100g")) or 0.0), fat_g=r(num(n.get("fat_100g")) or 0.0),
                    sat_fat_g=r(num(n.get("saturated-fat_100g"))), fiber_g=r(num(n.get("fiber_100g"))),
                    sugar_g=r(num(n.get("sugars_100g"))), sodium_mg=r(sodium_mg, 1))
    problems = import_problems(nut)
    if problems:
        raise ProductUnreliable("; ".join(problems))
    return nut


def parse_product(payload: dict) -> dict | None:
    """Return a normalised product dict, None if not found, raise ProductUnreliable if the data is bad."""
    if not isinstance(payload, dict) or payload.get("status") != 1 or not isinstance(payload.get("product"), dict):
        return None
    p = payload["product"]
    name = (p.get("product_name") or p.get("generic_name") or "").strip()
    if not name:
        raise ProductUnreliable("Product has no name")
    nut = nutrition_from_nutriments(p.get("nutriments") or {})
    serving = num(p.get("serving_quantity"))
    brand = (p.get("brands") or "").split(",")[0].strip() or None
    allergens = sorted({a.split(":", 1)[-1].replace("-", "_") for a in (p.get("allergens_tags") or []) if a})
    return {
        "name": name[:120], "brand": brand[:80] if brand else None, "barcode": str(p.get("code") or payload.get("code") or ""),
        "nutrition": nut.__dict__,
        "default_serving_g": serving if serving and 0 < serving <= 2000 else 100.0,
        "serving_label": (p.get("serving_size") or None) and str(p["serving_size"])[:40],
        "allergens": allergens,
        "diet_tags": diet_tags_from(p.get("ingredients_analysis_tags")),
    }


async def fetch_product(code: str, transport: httpx.AsyncBaseTransport | None = None) -> dict | None:
    if not BARCODE_RE.match(code):
        raise ValueError("Barcode must be 8-14 digits")
    try:
        async with httpx.AsyncClient(transport=transport, timeout=8, headers={"User-Agent": "SaigeFit/0.1"}) as c:
            r = await c.get(OFF_URL.format(code=code), params={"fields": FIELDS})
    except httpx.HTTPError:
        raise UpstreamUnavailable()
    if r.status_code == 404:
        return None
    if r.status_code >= 400:
        raise UpstreamUnavailable()
    try:
        data = r.json()
    except ValueError:
        raise UpstreamUnavailable()
    data.setdefault("code", code)
    return parse_product(data)
