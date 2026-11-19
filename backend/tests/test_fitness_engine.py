from datetime import date

import pytest

from app.services import fitness_engine as fe


def test_bmi_and_category():
    assert fe.bmi(70, 175) == 22.9
    assert fe.bmi_category(22.9) == "normal"
    assert fe.bmi_category(17) == "underweight"
    assert fe.bmi_category(27) == "overweight"
    assert fe.bmi_category(32) == "obese"


def test_bmr_mifflin_known_values():
    # 80kg, 180cm, 30y male: 800 + 1125 - 150 + 5 = 1780
    assert fe.bmr_mifflin(80, 180, 30, fe.Gender.male) == pytest.approx(1780)
    # 60kg, 165cm, 25y female: 600 + 1031.25 - 125 - 161 = 1345.25
    assert fe.bmr_mifflin(60, 165, 25, fe.Gender.female) == pytest.approx(1345.25)


def test_age_from_dob_handles_birthday_not_yet_reached():
    assert fe.age_from_dob(date(2000, 6, 15), today=date(2025, 6, 14)) == 24
    assert fe.age_from_dob(date(2000, 6, 15), today=date(2025, 6, 15)) == 25


def test_tdee_multiplier():
    assert fe.tdee(1780, fe.Activity.moderately_active) == pytest.approx(1780 * 1.55)


def _t(**kw):
    base = dict(weight_kg=80, height_cm=180, age=30, gender=fe.Gender.male,
                activity=fe.Activity.moderately_active, goal=fe.Goal.maintenance)
    base.update(kw)
    return fe.compute_targets(**base)


def test_maintenance_equals_tdee():
    t = _t()
    assert t.target_kcal == t.tdee_kcal


def test_weight_loss_creates_deficit_but_capped():
    t = _t(goal=fe.Goal.weight_loss)
    assert t.target_kcal < t.tdee_kcal
    assert t.target_kcal >= t.tdee_kcal * 0.75 - 1


def test_muscle_gain_creates_surplus():
    assert _t(goal=fe.Goal.muscle_gain).target_kcal > _t().tdee_kcal


def test_macros_sum_close_to_target_kcal():
    t = _t(goal=fe.Goal.muscle_gain)
    total = t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9
    assert abs(total - t.target_kcal) <= 15


def test_safety_floor_applied_for_small_female():
    t = _t(weight_kg=45, height_cm=150, age=50, gender=fe.Gender.female,
           activity=fe.Activity.sedentary, goal=fe.Goal.weight_loss)
    assert t.target_kcal >= 1200
    assert any("safety minimum" in n for n in t.notes)


def test_underweight_never_gets_deficit():
    t = _t(weight_kg=48, height_cm=175, goal=fe.Goal.weight_loss)
    assert t.bmi_category == "underweight"
    assert t.target_kcal == t.tdee_kcal
    assert any("underweight" in n for n in t.notes)


def test_target_weight_not_below_current_warns():
    t = _t(goal=fe.Goal.weight_loss, target_weight_kg=85)
    assert any("target weight" in n for n in t.notes)


def test_minor_gets_guardian_note():
    assert any("under 18" in n for n in _t(age=16).notes)


def test_rejects_out_of_range_inputs():
    with pytest.raises(ValueError):
        _t(age=9)
    with pytest.raises(ValueError):
        _t(weight_kg=10)


def test_suggested_activity_raises_for_frequent_training():
    assert fe.suggest_activity(6, fe.Activity.sedentary) == fe.Activity.very_active
    assert fe.suggest_activity(2, fe.Activity.very_active) == fe.Activity.very_active


def test_water_target_rounded_and_scaled():
    assert _t(weight_kg=70).water_ml % 50 == 0
    assert _t(weight_kg=100).water_ml > _t(weight_kg=60).water_ml
