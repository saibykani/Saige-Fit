"""Deterministic "what should I eat next?" scoring over recipes and foods (no AI call)."""
from __future__ import annotations

from app.services import diet_engine as de
from app.services.nutrition_engine import sum_nutrients

# meals still to come (including the next one) per slot, used to size the ideal portion
MEALS_LEFT = {"early_morning": 5, "breakfast": 5, "mid_morning": 4, "lunch": 3, "evening_snack": 2, "dinner": 1}
SLOT_TAGS = {"early_morning": {"snack", "breakfast"}, "breakfast": {"breakfast"}, "mid_morning": {"snack", "breakfast", "light"},
             "lunch": {"lunch"}, "evening_snack": {"snack", "light"}, "dinner": {"dinner"}}
MEAL_TAGS = {"breakfast", "lunch", "dinner", "snack"}


def food_candidate(f: de.Food, slot: str) -> dict | None:
    if not (f.roles & set(de.SLOT_ROLES[slot])):
        return None
    n = f.nutrients(f.default_g)
    return {"kind": "food", "id": f.id, "name": f.name, "serving": de.quantity_label(f, f.default_g), "kcal": n.kcal,
            "protein_g": n.protein_g, "carbs_g": n.carbs_g, "fat_g": n.fat_g, "fiber_g": n.fiber_g or 0.0, "tags": []}


def recipe_summary(r: dict, ings: list[dict], foods: dict[str, de.Food]) -> dict | None:
    """Per-serving nutrition, diet tags (intersection of ingredients) and allergens (union) for one recipe."""
    mine = [(foods[str(i["food_id"])], float(i["grams"])) for i in ings if i["recipe_id"] == r["id"] and str(i["food_id"]) in foods]
    if not mine:
        return None
    tot = sum_nutrients([f.nutrients(g) for f, g in mine])
    sv = max(1, int(r.get("servings") or 1))
    diets = set(mine[0][0].diet_tags)
    allergens: set[str] = set()
    for f, _ in mine:
        diets &= set(f.diet_tags)
        allergens |= f.allergens
    per = {k: float(getattr(tot, k) or 0) / sv for k in ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")}
    return {"id": r["id"], "name": r["name"], "tags": r.get("tags") or [], "diet_tags": sorted(diets), "allergens": sorted(allergens),
            "nutrition_per_serving": per}


def recipe_candidate(s: dict) -> dict:
    n = s["nutrition_per_serving"]
    return {"kind": "recipe", "id": s["id"], "name": s["name"], "serving": "1 serving", "kcal": n["kcal"], "protein_g": n["protein_g"],
            "carbs_g": n["carbs_g"], "fat_g": n["fat_g"], "fiber_g": n.get("fiber_g") or 0.0, "tags": list(s.get("tags") or [])}


def _closeness(v: float, ideal: float, scale: float) -> float:
    return max(0.0, 1.0 - abs(v - ideal) / max(scale, 1.0))


def score(c: dict, remaining: dict, slot: str) -> float:
    rem_k = remaining["kcal"]
    ideal_k = max(120.0, rem_k / MEALS_LEFT[slot])
    share = min(1.0, ideal_k / max(rem_k, 1.0))
    ideal_p, ideal_c, ideal_f = (max(0.0, remaining[k]) * share for k in ("protein_g", "carbs_g", "fat_g"))
    s = 2.0 * _closeness(c["kcal"], ideal_k, ideal_k)
    s += 2.0 * min(c["protein_g"], ideal_p * 1.3) / max(ideal_p, 1.0) * (1.0 if ideal_p >= 5 else 0.3)
    s += 0.8 * _closeness(c["carbs_g"], ideal_c, max(ideal_c, 20.0))
    s += 0.8 * _closeness(c["fat_g"], ideal_f, max(ideal_f, 8.0))
    s += 0.03 * min(c["fiber_g"], 10.0)
    over = sum(max(0.0, c[k] - max(0.0, remaining[k]) - 5) / max(remaining[k], 10.0) for k in ("protein_g", "carbs_g", "fat_g"))
    s -= 1.0 * over
    meal_tags = set(c["tags"]) & MEAL_TAGS
    if meal_tags:
        s += 0.4 if meal_tags & SLOT_TAGS[slot] else -0.6
    if c["kind"] == "recipe":
        s += 0.1  # a composed meal beats a single ingredient on ties
    return s


def reason(c: dict, remaining: dict) -> str:
    rem_k, rem_p = remaining["kcal"], max(0.0, remaining["protein_g"])
    k, p = round(c["kcal"]), round(c["protein_g"])
    if rem_p > 5 and c["protein_g"] >= 10:
        return f"{p} g protein toward the {round(rem_p)} g you still need, for {k} kcal."
    if c["fiber_g"] >= 5:
        return f"{round(c['fiber_g'])} g fibre and {k} kcal, which fits the {round(rem_k)} kcal you have left."
    return f"A {k} kcal option that fits the {round(rem_k)} kcal you have left."


def suggest(recipes: list[dict], foods: list[de.Food], remaining: dict, hour: int, n: int = 5) -> dict:
    """recipes: recipes.summarize() dicts already filtered by preferences; foods: already-allowed foods."""
    slot = de.next_slot(hour)
    out = {"slot": slot, "suggestions": [], "message": None}
    if remaining["kcal"] <= 60:
        out["message"] = "You've reached today's calorie target. If you're still hungry, choose vegetables, fruit or plain water."
        return out
    cands = [recipe_candidate(r) for r in recipes] + [c for c in (food_candidate(f, slot) for f in foods) if c]
    cands = [c for c in cands if 0 < c["kcal"] <= remaining["kcal"] * 1.05]
    ranked = sorted(((score(c, remaining, slot), c) for c in cands), key=lambda x: (-x[0], x[1]["name"]))
    picked, kinds = [], {"recipe": 0, "food": 0}
    for sc, c in ranked:
        if kinds[c["kind"]] >= (3 if c["kind"] == "recipe" else 2):  # keep a mix of recipes and foods
            continue
        kinds[c["kind"]] += 1
        picked.append({**{k: c[k] for k in ("kind", "id", "name", "serving")}, "kcal": round(c["kcal"]), "protein_g": round(c["protein_g"], 1),
                       "carbs_g": round(c["carbs_g"], 1), "fat_g": round(c["fat_g"], 1), "reason": reason(c, remaining), "score": round(sc, 3)})
        if len(picked) >= n:
            break
    out["suggestions"] = picked
    if not picked:
        out["message"] = "Nothing in your preferences fits what is left today; try the food search."
    return out
