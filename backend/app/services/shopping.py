"""Shopping list aggregation. Weights are the foods AS EATEN (cooked/prepared), because that is how the
nutrition database records them; raw ingredient weights differ."""
from __future__ import annotations

from app.services.diet_engine import Food

ORDER = ["Grains & staples", "Protein", "Lentils & legumes", "Dairy", "Vegetables & curries", "Fruits",
         "Nuts & snacks", "Prepared dishes", "Other"]
NOTE = "Weights are cooked/as-eaten amounts, so buy raw ingredients accordingly (e.g. rice and dal roughly triple in weight when cooked)."


def category(f: Food) -> str:
    r = f.roles
    if "combo" in r:
        return "Prepared dishes"
    if r & {"bmain", "carb"}:
        return "Grains & staples"
    if "protein" in r or "shake" in r:
        return "Protein"
    if r & {"gravy", "legume"}:
        return "Lentils & legumes"
    if "dairy" in r:
        return "Dairy"
    if "veg" in r:
        return "Vegetables & curries"
    if "fruit" in r:
        return "Fruits"
    if "nut" in r:
        return "Nuts & snacks"
    return "Other"


def aggregate(items: list[dict], foods: dict[str, Food]) -> list[dict]:
    """items: [{food_id, name, quantity_g}] -> grouped, summed shopping list."""
    totals: dict[str, dict] = {}
    for it in items:
        fid = str(it["food_id"]) if it.get("food_id") else it["name"]
        row = totals.setdefault(fid, {"food_id": it.get("food_id"), "name": it["name"], "total_g": 0.0, "uses": 0})
        row["total_g"] += float(it["quantity_g"])
        row["uses"] += 1
    groups: dict[str, list[dict]] = {}
    for fid, row in totals.items():
        f = foods.get(fid)
        cat = category(f) if f else "Other"
        row["total_g"] = round(row["total_g"], 1)
        row["approx"] = (f"about {round(row['total_g'] / f.default_g)} x {f.label}" if f and f.label and f.default_g else None)
        groups.setdefault(cat, []).append(row)
    out = []
    for cat in ORDER:
        if cat in groups:
            out.append({"category": cat, "items": sorted(groups[cat], key=lambda r: r["name"])})
    return out
