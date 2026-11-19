import pytest

from app.services.nutrition_engine import (
    Nutrients, day_summary, insights, sum_nutrients, validate_per_100g,
)

RICE = Nutrients(kcal=130, protein_g=2.7, carbs_g=28, fat_g=0.3, fiber_g=0.4, sugar_g=0.1)
DAL = Nutrients(kcal=116, protein_g=9, carbs_g=20, fat_g=0.4, fiber_g=8)


def test_scaling_150g_rice():
    n = RICE.scaled(150)
    assert n.kcal == 195.0
    assert n.protein_g == 4.1
    assert n.sat_fat_g is None  # unknown stays unknown, not 0


def test_scaling_rejects_bad_portions():
    for g in (0, -5, 5001):
        with pytest.raises(ValueError):
            RICE.scaled(g)


def test_sum_handles_missing_optional_fields():
    total = sum_nutrients([RICE.scaled(150), DAL.scaled(100)])
    assert total.kcal == pytest.approx(311.0)
    assert total.fiber_g == pytest.approx(8.6)
    assert total.sodium_mg is None


def test_validate_flags_impossible_records():
    assert validate_per_100g(RICE) == []
    assert validate_per_100g(Nutrients(kcal=50, protein_g=60, carbs_g=30, fat_g=20))
    assert validate_per_100g(Nutrients(kcal=130, protein_g=2, carbs_g=10, fat_g=0))  # kcal mismatch
    assert validate_per_100g(Nutrients(kcal=100, protein_g=5, carbs_g=10, fat_g=3, sugar_g=15))


TARGETS = {"kcal": 2000, "protein_g": 120, "carbs_g": 230, "fat_g": 60, "fiber_g": 30}


def test_day_summary_remaining():
    s = day_summary([Nutrients(kcal=900, protein_g=40, carbs_g=100, fat_g=30, fiber_g=10)], TARGETS)
    assert s.remaining_kcal == 1100
    assert s.remaining["protein_g"] == 80
    assert s.remaining["fiber_g"] == 20


def test_insights_use_actual_data():
    s = day_summary([Nutrients(kcal=900, protein_g=20, carbs_g=130, fat_g=10)], TARGETS)
    msgs = insights(s, water_ml=500, water_target_ml=2500, hour=16, protein_target_g=120)
    assert any("protein" in m for m in msgs)
    assert any("hydration" in m for m in msgs)


def test_no_false_alarms_for_empty_morning():
    s = day_summary([], TARGETS)
    assert insights(s, water_ml=0, water_target_ml=2500, hour=8, protein_target_g=120) == []
