"""Nutrition calculation engine. DB values are per 100 g; this scales to a portion and
sums meals. AI never supplies calorie numbers that bypass this module."""
from __future__ import annotations

from dataclasses import dataclass, field, fields

MAX_PORTION_G = 5000.0
ATWATER_TOLERANCE = 0.30


@dataclass
class Nutrients:
    kcal: float = 0.0
    protein_g: float = 0.0
    carbs_g: float = 0.0
    fat_g: float = 0.0
    sat_fat_g: float | None = None
    fiber_g: float | None = None
    sugar_g: float | None = None
    sodium_mg: float | None = None

    def scaled(self, grams: float) -> "Nutrients":
        if not (0 < grams <= MAX_PORTION_G):
            raise ValueError(f"portion must be >0 and <= {MAX_PORTION_G} g")
        k = grams / 100.0
        out = {}
        for f in fields(self):
            v = getattr(self, f.name)
            out[f.name] = None if v is None else round(v * k, 1)
        return Nutrients(**out)


_OPTIONAL = ("sat_fat_g", "fiber_g", "sugar_g", "sodium_mg")


def sum_nutrients(items: list[Nutrients]) -> Nutrients:
    total = Nutrients()
    for it in items:
        total.kcal += it.kcal
        total.protein_g += it.protein_g
        total.carbs_g += it.carbs_g
        total.fat_g += it.fat_g
        for name in _OPTIONAL:
            v = getattr(it, name)
            if v is not None:
                setattr(total, name, (getattr(total, name) or 0.0) + v)
    for f in fields(total):
        v = getattr(total, f.name)
        if v is not None:
            setattr(total, f.name, round(v, 1))
    return total


def atwater_kcal(n: Nutrients) -> float:
    return n.protein_g * 4 + n.carbs_g * 4 + n.fat_g * 9


def validate_per_100g(n: Nutrients) -> list[str]:
    """Problems with a per-100g record (empty list = plausible)."""
    problems = []
    if n.protein_g + n.carbs_g + n.fat_g > 100.5:
        problems.append("macros exceed 100 g per 100 g")
    if n.kcal > 900:
        problems.append("kcal per 100 g exceeds physical maximum (~900)")
    est = atwater_kcal(n)
    if n.kcal >= 20 and est > 0 and abs(est - n.kcal) / n.kcal > ATWATER_TOLERANCE:
        problems.append(f"kcal ({n.kcal}) disagrees with macros ({est:.0f}) by more than 30%")
    if n.sugar_g is not None and n.sugar_g > n.carbs_g + 0.5:
        problems.append("sugar exceeds carbohydrates")
    return problems


@dataclass
class DaySummary:
    consumed: Nutrients
    target_kcal: int
    remaining_kcal: float
    remaining: dict = field(default_factory=dict)


def day_summary(items: list[Nutrients], targets: dict) -> DaySummary:
    total = sum_nutrients(items)
    remaining = {
        "protein_g": round(targets["protein_g"] - total.protein_g, 1),
        "carbs_g": round(targets["carbs_g"] - total.carbs_g, 1),
        "fat_g": round(targets["fat_g"] - total.fat_g, 1),
        "fiber_g": round(targets["fiber_g"] - (total.fiber_g or 0), 1),
    }
    return DaySummary(total, targets["kcal"], round(targets["kcal"] - total.kcal, 1), remaining)


def insights(summary: DaySummary, *, water_ml: int, water_target_ml: int, hour: int,
             protein_target_g: float) -> list[str]:
    """Rule-based recommendations derived only from the user's actual logged data."""
    out: list[str] = []
    t = summary.consumed
    if hour >= 12 and t.protein_g < 0.4 * protein_target_g:
        need = round(protein_target_g - t.protein_g)
        out.append(f"You still need about {need} g of protein today. Consider a protein-rich snack.")
    if summary.remaining_kcal < 0:
        out.append(f"You're {abs(round(summary.remaining_kcal))} kcal over today's target.")
    if hour >= 15 and water_ml < 0.5 * water_target_ml:
        out.append("You're behind on hydration; try a glass of water now.")
    if t.kcal > 0 and t.carbs_g * 4 / t.kcal > 0.6:
        out.append("Today's intake is carbohydrate-heavy; balance the next meal with protein and vegetables.")
    return out
