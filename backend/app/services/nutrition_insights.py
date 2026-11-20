"""Deterministic daily nutrition score, sub-scores and plain-language gaps (no AI call)."""
from __future__ import annotations

WEIGHTS = {"calories": 30, "protein": 25, "fibre": 15, "balance": 15, "hydration": 15}
LABELS = {"calories": "Calorie fit", "protein": "Protein", "fibre": "Fibre", "balance": "Macro balance", "hydration": "Hydration"}
PROTEIN_FOODS = {"vegan": "tofu, soya chunks or lentils", "vegetarian": "paneer, dal or curd", "eggetarian": "eggs, paneer or dal"}
FIBRE_FOODS = "a fruit, a salad, oats or whole pulses"


def _clip(v: float) -> float:
    return max(0.0, min(100.0, v))


def _ratio(v: float, target: float) -> float:
    return v / target if target and target > 0 else 0.0


def calorie_fit(kcal: float, target: float) -> float:
    off = abs(_ratio(kcal, target) - 1.0)
    return _clip(100.0 - max(0.0, off - 0.05) / 0.45 * 100.0)  # full marks within +-5%, zero at +-50%


def balance_fit(c: dict, t: dict) -> float:
    """How close the protein/carb/fat share of calories is to the share the targets imply."""
    def shares(d):
        e = {"p": d["protein_g"] * 4, "c": d["carbs_g"] * 4, "f": d["fat_g"] * 9}
        tot = sum(e.values())
        return {k: v / tot for k, v in e.items()} if tot > 0 else None
    a, b = shares(c), shares(t)
    if not a or not b:
        return 0.0
    gap = sum(abs(a[k] - b[k]) for k in a)  # 0 = identical split, up to 2
    return _clip(100.0 - gap / 0.5 * 100.0)


def score_day(consumed: dict, targets: dict, water_ml: float, water_target: float, logged: bool) -> dict:
    """consumed/targets: kcal, protein_g, carbs_g, fat_g, fiber_g. Total is None when nothing is logged."""
    if not logged:
        subs = [{"key": k, "label": LABELS[k], "score": None, "weight": w, "detail": "Nothing logged yet"}
                for k, w in WEIGHTS.items()]
        return {"score": None, "subscores": subs}
    raw = {
        "calories": (calorie_fit(consumed["kcal"], targets["kcal"]), f"{round(consumed['kcal'])} of {round(targets['kcal'])} kcal"),
        "protein": (_clip(_ratio(consumed["protein_g"], targets["protein_g"]) * 100),
                    f"{round(consumed['protein_g'])} of {round(targets['protein_g'])} g"),
        "fibre": (_clip(_ratio(consumed["fiber_g"], targets["fiber_g"]) * 100),
                  f"{round(consumed['fiber_g'])} of {round(targets['fiber_g'])} g"),
        "balance": (balance_fit(consumed, targets), "Share of calories from protein, carbs and fat vs your targets"),
        "hydration": (_clip(_ratio(water_ml, water_target) * 100), f"{round(water_ml)} of {round(water_target)} ml"),
    }
    subs = [{"key": k, "label": LABELS[k], "score": round(raw[k][0]), "weight": WEIGHTS[k], "detail": raw[k][1]} for k in WEIGHTS]
    total = sum(raw[k][0] * WEIGHTS[k] for k in WEIGHTS) / sum(WEIGHTS.values())
    return {"score": round(total), "subscores": subs}


def grade(score: int | None) -> str:
    if score is None:
        return "No data"
    return "Excellent" if score >= 85 else "Good" if score >= 70 else "Fair" if score >= 50 else "Needs work"


def insights(consumed: dict, targets: dict, water_ml: float, water_target: float, diet_type: str = "non_vegetarian",
             hour: int | None = None, limit: int = 4) -> list[dict]:
    """Up to `limit` plain-language gaps, biggest first. `hour` (local) avoids nagging about calories mid-day."""
    out: list[tuple[float, dict]] = []
    p_gap = targets["protein_g"] - consumed["protein_g"]
    if targets["protein_g"] and p_gap >= max(10.0, 0.1 * targets["protein_g"]):
        ideas = PROTEIN_FOODS.get(diet_type, "eggs, chicken, fish, paneer or dal")
        out.append((p_gap / targets["protein_g"], {"key": "protein", "severity": "warn",
                    "title": f"Protein is {round(p_gap)} g short", "body": f"Try {ideas} at your next meal."}))
    f_gap = targets["fiber_g"] - consumed["fiber_g"]
    if targets["fiber_g"] and f_gap >= max(5.0, 0.2 * targets["fiber_g"]):
        out.append((0.9 * f_gap / targets["fiber_g"], {"key": "fibre", "severity": "warn",
                    "title": f"Fibre is {round(f_gap)} g short", "body": f"Add {FIBRE_FOODS}."}))
    k_off = consumed["kcal"] - targets["kcal"]
    if targets["kcal"] and k_off > 0.1 * targets["kcal"]:
        out.append((k_off / targets["kcal"], {"key": "calories", "severity": "warn", "title": f"{round(k_off)} kcal over target",
                    "body": "Keep the rest of the day light: vegetables, dal or fruit rather than fried snacks."}))
    elif targets["kcal"] and -k_off > 0.25 * targets["kcal"] and (hour is None or hour >= 18):
        out.append((-k_off / targets["kcal"] * 0.8, {"key": "calories", "severity": "info",
                    "title": f"{round(-k_off)} kcal under target",
                    "body": "Eating too little makes recovery harder; add a balanced meal or snack."}))
    w_gap = water_target - water_ml
    if water_target and w_gap >= 0.3 * water_target:
        out.append((0.7 * w_gap / water_target, {"key": "hydration", "severity": "info",
                    "title": f"Water is {round(w_gap)} ml short", "body": "Keep a bottle nearby and sip between meals."}))
    if targets["fat_g"] and consumed["fat_g"] > 1.3 * targets["fat_g"]:
        out.append((0.6, {"key": "balance", "severity": "info", "title": "Fat is running high",
                          "body": f"{round(consumed['fat_g'])} g vs {round(targets['fat_g'])} g target; go easy on oil, ghee and fried food."}))
    if targets["carbs_g"] and consumed["carbs_g"] > 1.3 * targets["carbs_g"]:
        out.append((0.5, {"key": "balance", "severity": "info", "title": "Carbs are running high",
                          "body": f"{round(consumed['carbs_g'])} g vs {round(targets['carbs_g'])} g target; swap a refined carb for protein or veg."}))
    out.sort(key=lambda x: -x[0])
    res = [i for _, i in out[:limit]]
    if not res:
        res = [{"key": "ok", "severity": "good", "title": "You are on track", "body": "Protein, fibre and calories all look good for today."}]
    return res
