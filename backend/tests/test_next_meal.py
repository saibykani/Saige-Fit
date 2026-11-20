from app.data.recipes_seed import R
from app.services import diet_engine as de
from app.services import next_meal as nm
from tests.test_ai_diet_engine import FOODS_ALL, rows
from tests.test_core_support import H, env, seed_user  # noqa: F401

REM = {"kcal": 900.0, "protein_g": 70.0, "carbs_g": 100.0, "fat_g": 30.0}


def seed_catalog(db):
    db.tables["food_items"] = rows()
    ids = {f["name"]: f["id"] for f in db.tables["food_items"]}
    db.tables["recipes"] = [{"id": f"r{i}", "name": r[0], "cuisine": r[1], "description": r[2], "servings": r[3], "prep_minutes": r[4],
                             "cook_minutes": r[5], "tags": r[6]} for i, r in enumerate(R)]
    db.tables["recipe_ingredients"] = [{"recipe_id": f"r{i}", "food_id": ids[n], "grams": g, "position": k}
                                       for i, r in enumerate(R) for k, (n, g, _) in enumerate(r[8]) if n in ids]


def test_suggest_is_deterministic_and_fits_remaining():
    foods = de.allowed_foods(FOODS_ALL, de.Prefs(diet_type="vegetarian"))
    a = nm.suggest([], foods, REM, hour=13)
    assert a == nm.suggest([], foods, REM, hour=13)
    assert a["slot"] == "lunch" and 1 <= len(a["suggestions"]) <= 5
    assert all(s["kcal"] <= REM["kcal"] * 1.05 and s["reason"] for s in a["suggestions"])


def test_suggest_target_reached():
    out = nm.suggest([], FOODS_ALL, {**REM, "kcal": 30}, hour=20)
    assert out["suggestions"] == [] and "target" in out["message"]


def test_endpoint_mixes_recipes_and_foods_and_respects_diet(env):
    seed_user(env.db)
    seed_catalog(env.db)
    env.db.tables["dietary_preferences"] = [{"user_id": "user-1", "diet_type": "vegan"}]
    r = env.client.get("/v1/suggestions/next-meal?date=2026-03-02&hour=8", headers=H())
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["remaining"]["kcal"] == 2400 and j["slot"] == "breakfast"
    assert 3 <= len(j["suggestions"]) <= 5
    assert {s["kind"] for s in j["suggestions"]} == {"recipe", "food"}
    names = " ".join(s["name"].lower() for s in j["suggestions"])
    assert not any(w in names.split() for w in ("chicken", "egg", "paneer", "curd", "whey", "fish"))


def test_endpoint_subtracts_eaten_and_needs_onboarding(env):
    seed_user(env.db)
    seed_catalog(env.db)
    env.db.tables["meal_logs"] = [{"id": "m1", "user_id": "user-1", "log_date": "2026-03-02", "meal_type": "lunch", "meal_items": [
        {"kcal": 2380, "protein_g": 100, "carbs_g": 200, "fat_g": 60, "quantity_g": 500}]}]
    j = env.client.get("/v1/suggestions/next-meal?date=2026-03-02&hour=19", headers=H()).json()
    assert j["remaining"]["kcal"] == 20 and j["suggestions"] == []
    assert env.client.get("/v1/suggestions/next-meal", headers=H("ghost")).status_code == 409
    assert env.client.get("/v1/suggestions/next-meal").status_code in (401, 403)
