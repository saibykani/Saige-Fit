import random

import pytest

from app.data.curated_foods import DIET_TAGS, FOODS
from app.services import diet_engine as de
from app.services.nutrition_engine import sum_nutrients


def rows():
    out = []
    for i, (name, cuisine, diet, allergens, kcal, p, c, f, sat, fib, sug, na, serv, label, unit) in enumerate(FOODS):
        out.append({"id": f"f{i}", "name": name, "cuisine": cuisine, "diet_tags": DIET_TAGS[diet], "allergens": allergens,
                    "default_serving_g": serv, "serving_label": label, "grams_per_unit": unit,
                    "food_nutrition": [{"kcal": kcal, "protein_g": p, "carbs_g": c, "fat_g": f, "sat_fat_g": sat,
                                        "fiber_g": fib, "sugar_g": sug, "sodium_mg": na}]})
    return out


FOODS_ALL = de.build_foods(rows())
MEAT_WORDS = {"chicken", "fish"}
DAIRY_WORDS = {"paneer", "curd", "yogurt", "milk", "whey", "dahi"}


def tgt(kcal=2000, p=120):
    return de.DietTargets(kcal=kcal, protein_g=p, carbs_g=round((kcal - p * 4 - 0.27 * kcal) / 4), fat_g=round(0.27 * kcal / 9), fiber_g=30)


def names_of(day):
    return [i.food.name for _, items in day.meals for i in items]


# ---------- classification & filtering ----------
def test_all_curated_foods_loaded_and_classified():
    assert len(FOODS_ALL) == len(FOODS)
    by = {f.name: f for f in FOODS_ALL}
    assert "bmain" in by["Idli"].roles and "carb" in by["Cooked white rice"].roles and "protein" in by["Paneer"].roles
    assert by["Chicken biryani"].roles == {"combo"}
    assert {"fruit"} <= by["Banana"].roles and {"nut"} <= by["Almonds"].roles


def test_unknown_foods_are_classified_from_macros():
    assert "protein" in de.classify("Mystery lean thing", de.Nutrients(120, 25, 2, 2))
    assert "nut" in de.classify("Mystery paste", de.Nutrients(600, 10, 10, 55))
    assert "carb" in de.classify("Mystery grain", de.Nutrients(350, 8, 75, 2))


def allowed(**kw):
    return de.allowed_foods(FOODS_ALL, de.Prefs(**kw))


def test_vegetarian_excludes_meat_fish_and_egg():
    for f in allowed(diet_type="vegetarian"):
        assert not (f.tokens & (MEAT_WORDS | {"egg", "biryani"}))
    assert any("paneer" in f.tokens for f in allowed(diet_type="vegetarian"))


def test_vegan_excludes_all_animal_foods():
    names = [f.name for f in allowed(diet_type="vegan")]
    for n in names:
        assert not (set(n.lower().replace("(", " ").replace(")", " ").split()) & (MEAT_WORDS | DAIRY_WORDS | {"egg", "biryani"})), n
    assert "Tofu (firm)" in names and "Cooked white rice" in names


def test_eggetarian_includes_eggs_not_meat():
    names = [f.name for f in allowed(diet_type="eggetarian")]
    assert "Boiled egg" in names and not any("Chicken" in n or "Fish" in n for n in names)


def test_allergies_and_intolerances_are_excluded():
    assert not any("milk" in f.allergens for f in allowed(allergies=["lactose"]))
    assert not any({"peanuts", "tree_nuts"} & f.allergens for f in allowed(allergies=["nuts"]))
    assert not any("gluten" in f.allergens for f in allowed(intolerances=["gluten"]))
    assert not any("soy" in f.allergens for f in allowed(allergies=["soya"]))
    assert not any("fish" in f.allergens for f in allowed(allergies=["shellfish"]))


def test_disliked_and_restricted_words_excluded():
    names = [f.name for f in allowed(disliked=["paneer"], restrictions=["no rice", "avoid banana"])]
    assert not any("Paneer" in n or "rice" in n.lower() or "Banana" in n for n in names)


# ---------- plan quality ----------
@pytest.mark.parametrize("diet", ["non_vegetarian", "vegetarian", "eggetarian", "pescatarian"])
@pytest.mark.parametrize("kcal,prot", [(1500, 90), (1800, 110), (2200, 140), (2600, 150), (3000, 170)])
def test_daily_kcal_within_5pct_and_protein_within_10pct(diet, kcal, prot):
    p = de.Prefs(diet_type=diet, meals_per_day=5)
    days = de.generate_plan(FOODS_ALL, p, tgt(kcal, prot), 7, [True, False, True, False, True, False, False])
    for d in days:
        assert abs(d.totals.kcal - kcal) / kcal <= de.KCAL_TOLERANCE, (diet, kcal, d.totals.kcal, d.warnings)
        assert abs(d.totals.protein_g - prot) / prot <= de.PROTEIN_TOLERANCE, (diet, kcal, d.totals.protein_g, d.warnings)
        assert d.warnings == []


def test_vegan_with_dairy_and_nut_allergy_still_plans_with_honest_warnings_at_worst():
    p = de.Prefs(diet_type="vegan", allergies=["lactose", "nuts", "soy"], meals_per_day=4)
    days = de.generate_plan(FOODS_ALL, p, tgt(2000, 100), 3, [False])
    for d in days:
        assert not (set(w for n in names_of(d) for w in n.lower().split()) & (DAIRY_WORDS | {"tofu", "almonds", "peanuts"}))
        assert abs(d.totals.kcal - 2000) / 2000 <= 0.06 or d.warnings


def test_plans_never_contain_disallowed_foods():
    p = de.Prefs(diet_type="vegetarian", allergies=["milk"], disliked=["rice"], meals_per_day=6)
    for d in de.generate_plan(FOODS_ALL, p, tgt(2000, 100), 7, [False]):
        for _, items in d.meals:
            for it in items:
                assert "vegetarian" in it.food.diet_tags and "milk" not in it.food.allergens and "rice" not in it.food.tokens


@pytest.mark.parametrize("m,slots", [(2, ["lunch", "dinner"]), (3, ["breakfast", "lunch", "dinner"]),
                                     (4, ["breakfast", "lunch", "evening_snack", "dinner"]),
                                     (6, de.SLOTS), (7, de.SLOTS)])
def test_meals_per_day_slots(m, slots):
    d = de.generate_plan(FOODS_ALL, de.Prefs(meals_per_day=m), tgt(), 1, [False])[0]
    assert [s for s, _ in d.meals] == slots


def test_no_same_main_twice_in_a_day_and_weekly_variety():
    p = de.Prefs(diet_type="non_vegetarian", meals_per_day=6)
    days = de.generate_plan(FOODS_ALL, p, tgt(2200, 130), 7, [False])
    for d in days:
        mains = [i.food.id for _, items in d.meals for i in items if i.food.roles & de.MAINS]
        assert len(mains) == len(set(mains))
    lunches = {tuple(sorted(i.food.name for i in dict(d.meals)["lunch"])) for d in days}
    assert len(lunches) >= 4
    breakfasts = {tuple(sorted(i.food.name for i in dict(d.meals)["breakfast"])) for d in days}
    assert len(breakfasts) >= 4


def test_portions_are_practical_multiples_of_units():
    d = de.generate_plan(FOODS_ALL, de.Prefs(), tgt(2300, 140), 1, [False])[0]
    for _, items in d.meals:
        for it in items:
            assert it.grams >= it.food.step and abs(it.grams / it.food.step - round(it.grams / it.food.step)) < 1e-6
            assert it.lo <= it.grams <= it.hi


def test_nutrition_comes_from_records_not_invented():
    d = de.generate_plan(FOODS_ALL, de.Prefs(), tgt(), 1, [False])[0]
    manual = sum_nutrients([it.food.n100.scaled(it.grams) for _, items in d.meals for it in items])
    assert manual.kcal == d.totals.kcal and manual.protein_g == d.totals.protein_g


def test_training_days_shift_carbs_up_without_changing_calories():
    p = de.Prefs(meals_per_day=5)
    train = de.generate_plan(FOODS_ALL, p, tgt(2400, 140), 6, [True])
    rest = de.generate_plan(FOODS_ALL, p, tgt(2400, 140), 6, [False])
    ct = sum(d.totals.carbs_g for d in train) / 6
    cr = sum(d.totals.carbs_g for d in rest) / 6
    assert ct > cr
    for d in train + rest:
        assert abs(d.totals.kcal - 2400) / 2400 <= de.KCAL_TOLERANCE


def test_budget_prefers_cheaper_foods_as_tiebreak():
    cheap = de.generate_plan(FOODS_ALL, de.Prefs(budget=3000), tgt(), 7, [False])
    avg = lambda ds: sum(i.food.cost_tier for d in ds for _, its in d.meals for i in its) / sum(len(its) for d in ds for _, its in d.meals)  # noqa: E731
    normal = de.generate_plan(FOODS_ALL, de.Prefs(), tgt(), 7, [False])
    assert avg(cheap) <= avg(normal)


def test_liked_foods_are_favoured():
    p = de.Prefs(liked=["paneer"], diet_type="vegetarian")
    names = [n for d in de.generate_plan(FOODS_ALL, p, tgt(), 7, [False]) for n in names_of(d)]
    assert any("Paneer" in n for n in names)


def test_impossible_preferences_raise():
    with pytest.raises(ValueError):
        de.generate_plan(FOODS_ALL, de.Prefs(diet_type="vegan", allergies=["soy", "gluten", "nuts", "milk", "egg", "fish"], restrictions=["no rice banana apple dal sambar rasam sprouts chickpeas vegetable idli dosa pesarattu pongal upma poha oats"]), tgt(), 1, [False])


# ---------- rows, instructions, alternatives ----------
def test_rows_have_instructions_and_two_comparable_alternatives():
    p = de.Prefs(diet_type="vegetarian", allergies=["nuts"], meals_per_day=5)
    day = de.generate_plan(FOODS_ALL, p, tgt(), 1, [False])[0]
    pool = de.allowed_foods(FOODS_ALL, p)
    rows_ = de.to_plan_rows(day, pool)
    assert rows_ and all(r["instructions"] and r["scheduled_time"] for r in rows_)
    allowed_ids = {f.id for f in pool}
    for r in rows_:
        assert len(r["alternatives"]) == 2, r["name"]
        for a in r["alternatives"]:
            assert a["food_id"] in allowed_ids and a["food_id"] != r["food_id"]
            assert abs(a["kcal"] - r["kcal"]) / max(r["kcal"], 1) <= 0.3, (r["name"], a["name"], a["kcal"], r["kcal"])


def test_swap_candidates_and_random_pick_are_deterministic_with_seed():
    f = next(x for x in FOODS_ALL if x.name == "Cooked white rice")
    pool = de.allowed_foods(FOODS_ALL, de.Prefs())
    cands = de.swap_candidates(f, 150, "carb", pool, set(), 4)
    assert cands and all(c["food_id"] != f.id for c in cands)
    assert de.pick_random(cands, random.Random(1)) == de.pick_random(cands, random.Random(1))
    assert de.pick_random([]) is None


# ---------- recommendations ----------
def test_recommendations_fill_remaining_protein_900_of_2000_kcal():
    pool = de.allowed_foods(FOODS_ALL, de.Prefs(diet_type="vegetarian"))
    rem = {"kcal": 1100, "protein_g": 80, "carbs_g": 120, "fat_g": 35, "fiber_g": 20, "protein_target": 120}
    out = de.recommendations(pool, rem, hour=16)
    assert out["slot"] == "evening_snack" and out["suggestions"]
    top = out["suggestions"][0]
    assert top["protein_g"] >= 8 and "protein" in top["reason"]
    assert all(s["kcal"] <= 700 for s in out["suggestions"])
    assert not any("chicken" in s["name"].lower() or "fish" in s["name"].lower() for s in out["suggestions"])


def test_recommendations_when_target_reached():
    out = de.recommendations(FOODS_ALL, {"kcal": 20, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0}, hour=20)
    assert out["suggestions"] == [] and "target" in out["message"]


def test_next_slot_by_hour():
    assert [de.next_slot(h) for h in (5, 8, 11, 13, 17, 21)] == ["early_morning", "breakfast", "mid_morning", "lunch", "evening_snack", "dinner"]


def test_quantity_label_formats():
    idli = next(f for f in FOODS_ALL if f.name == "Idli")
    assert de.quantity_label(idli, 80) == "2 idlis (80 g)"
    assert de.quantity_label(idli, 120).startswith("~1.5 x")
