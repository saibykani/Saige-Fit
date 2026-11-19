"""Pure, deterministic fitness calculations (no I/O). Fully unit-tested.

All numbers are estimates for healthy adults, not medical advice.
Formulas: Mifflin-St Jeor BMR, standard activity multipliers.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum


class Gender(str, Enum):
    male = "male"
    female = "female"
    other = "other"
    unspecified = "unspecified"


class Activity(str, Enum):
    sedentary = "sedentary"
    lightly_active = "lightly_active"
    moderately_active = "moderately_active"
    very_active = "very_active"
    extremely_active = "extremely_active"


class Goal(str, Enum):
    weight_loss = "weight_loss"
    fat_loss = "fat_loss"
    muscle_gain = "muscle_gain"
    lean_muscle = "lean_muscle"
    maintenance = "maintenance"
    strength = "strength"
    general_fitness = "general_fitness"
    recomposition = "recomposition"


ACTIVITY_MULTIPLIER = {
    Activity.sedentary: 1.2,
    Activity.lightly_active: 1.375,
    Activity.moderately_active: 1.55,
    Activity.very_active: 1.725,
    Activity.extremely_active: 1.9,
}

# Fraction of TDEE (negative = deficit). Deliberately conservative.
GOAL_ADJUSTMENT = {
    Goal.weight_loss: -0.20,
    Goal.fat_loss: -0.15,
    Goal.muscle_gain: +0.10,
    Goal.lean_muscle: +0.05,
    Goal.maintenance: 0.0,
    Goal.strength: +0.05,
    Goal.general_fitness: 0.0,
    Goal.recomposition: -0.05,
}

# Protein in g per kg bodyweight
PROTEIN_PER_KG = {
    Goal.weight_loss: 1.8,
    Goal.fat_loss: 2.0,
    Goal.muscle_gain: 1.8,
    Goal.lean_muscle: 2.0,
    Goal.maintenance: 1.4,
    Goal.strength: 1.8,
    Goal.general_fitness: 1.4,
    Goal.recomposition: 2.0,
}

# Safety floors: never prescribe below these without clinical supervision.
MIN_KCAL = {Gender.male: 1500, Gender.female: 1200, Gender.other: 1350, Gender.unspecified: 1350}
MAX_DEFICIT_FRACTION = 0.25
FAT_FRACTION = 0.25
FAT_MIN_G_PER_KG = 0.6


def age_from_dob(dob: date, today: date | None = None) -> int:
    today = today or date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def bmi(weight_kg: float, height_cm: float) -> float:
    m = height_cm / 100
    return round(weight_kg / (m * m), 1)


def bmi_category(value: float) -> str:
    if value < 18.5:
        return "underweight"
    if value < 25:
        return "normal"
    if value < 30:
        return "overweight"
    return "obese"


def bmr_mifflin(weight_kg: float, height_cm: float, age: int, gender: Gender) -> float:
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    if gender == Gender.male:
        return base + 5
    if gender == Gender.female:
        return base - 161
    return base - 78  # midpoint for other / unspecified


def tdee(bmr: float, activity: Activity) -> float:
    return bmr * ACTIVITY_MULTIPLIER[activity]


def suggest_activity(training_days: int, daily_activity: Activity) -> Activity:
    """Nudge activity level up if the user trains often but reported a lower level."""
    order = list(Activity)
    idx = order.index(daily_activity)
    floor = {0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 3, 7: 3}[max(0, min(7, training_days))]
    return order[max(idx, floor)]


@dataclass(frozen=True)
class Targets:
    bmi: float
    bmi_category: str
    bmr_kcal: int
    tdee_kcal: int
    target_kcal: int
    protein_g: int
    carbs_g: int
    fat_g: int
    fiber_g: int
    water_ml: int
    suggested_activity: Activity
    notes: list[str]


def compute_targets(
    *,
    weight_kg: float,
    height_cm: float,
    age: int,
    gender: Gender,
    activity: Activity,
    goal: Goal,
    training_days: int = 3,
    target_weight_kg: float | None = None,
) -> Targets:
    if not (25 <= weight_kg <= 400 and 80 <= height_cm <= 250 and 13 <= age <= 100):
        raise ValueError("inputs outside supported range (age 13-100)")

    notes: list[str] = []
    suggested = suggest_activity(training_days, activity)
    b = bmr_mifflin(weight_kg, height_cm, age, gender)
    t = tdee(b, activity)
    bmi_v = bmi(weight_kg, height_cm)
    cat = bmi_category(bmi_v)

    adj = GOAL_ADJUSTMENT[goal]
    if cat == "underweight" and adj < 0:
        adj = 0.0
        notes.append("Your BMI is in the underweight range, so no calorie deficit was applied. Please consult a healthcare professional.")
    adj = max(adj, -MAX_DEFICIT_FRACTION)
    kcal = t * (1 + adj)

    floor = MIN_KCAL[gender]
    if kcal < floor:
        kcal = floor
        notes.append(f"Target raised to the {floor} kcal safety minimum. Very low intakes need medical supervision.")

    if target_weight_kg and goal in (Goal.weight_loss, Goal.fat_loss) and target_weight_kg >= weight_kg:
        notes.append("Your target weight is not below your current weight; consider a maintenance or muscle goal.")
    if age < 18:
        notes.append("For users under 18 these targets are only a rough guide; please involve a guardian or professional.")

    protein = min(PROTEIN_PER_KG[goal] * weight_kg, 0.35 * kcal / 4)
    fat = max(FAT_FRACTION * kcal / 9, FAT_MIN_G_PER_KG * weight_kg)
    carbs = max(0.0, (kcal - protein * 4 - fat * 9) / 4)
    fiber = max(25.0, 14 * kcal / 1000)
    water = 35 * weight_kg + (350 if suggested in (Activity.very_active, Activity.extremely_active) else 0)

    return Targets(
        bmi=bmi_v,
        bmi_category=cat,
        bmr_kcal=round(b),
        tdee_kcal=round(t),
        target_kcal=round(kcal),
        protein_g=round(protein),
        carbs_g=round(carbs),
        fat_g=round(fat),
        fiber_g=round(fiber),
        water_ml=round(water / 50) * 50,
        suggested_activity=suggested,
        notes=notes,
    )
