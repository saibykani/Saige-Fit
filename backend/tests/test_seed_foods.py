from app.data.curated_foods import DIET_TAGS, FOODS
from app.services.nutrition_engine import Nutrients, validate_per_100g


def test_every_curated_food_is_plausible():
    bad = {}
    for row in FOODS:
        name, *_, kcal, p, c, f, sat, fib, sug, na, _s, _l, _u = row
        problems = validate_per_100g(Nutrients(kcal, p, c, f, sat, fib, sug, na))
        if problems:
            bad[name] = problems
    assert not bad, bad


def test_names_unique_and_diet_codes_valid():
    names = [r[0] for r in FOODS]
    assert len(names) == len(set(names))
    assert all(r[2] in DIET_TAGS for r in FOODS)


def test_required_indian_staples_present():
    names = " ".join(r[0].lower() for r in FOODS)
    for must in ["idli", "dosa", "upma", "poha", "pesarattu", "pongal", "paratha", "oats", "rice",
                 "roti", "dal", "sambar", "rasam", "paneer", "chicken curry", "fish curry",
                 "vegetable curry", "curd", "biryani", "egg", "sprouts", "banana", "almonds",
                 "peanuts", "yogurt", "protein"]:
        assert must in names, must


def test_animal_foods_not_tagged_vegan_or_vegetarian():
    for r in FOODS:
        if r[2] in ("N", "F"):
            tags = DIET_TAGS[r[2]]
            assert "vegetarian" not in tags and "vegan" not in tags
