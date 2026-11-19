import pytest

from app.services import fitness_engine as fe
from tests.test_core_support import H, PROFILE, env, seed_user  # noqa: F401

ONBOARD = {
    "full_name": "Asha Rao", "date_of_birth": "1995-05-01", "gender": "female", "country": "IN", "language": "en",
    "height_cm": 165, "weight_kg": 70, "target_weight_kg": 62, "goal": "fat_loss", "activity_level": "lightly_active",
    "sleep_hours": 7, "experience": "beginner", "workout_env": "gym", "training_days": 4, "workout_days": [3, 1, 5, 1],
    "workout_minutes": 45, "preferred_workout_time": "06:30", "equipment": ["dumbbells", " dumbbells "],
    "injuries": ["knee"], "diet_type": "vegetarian", "allergies": ["peanuts"], "cuisines": ["indian", "asian"],
    "meals_per_day": 5, "monthly_budget": 8000, "privacy_consent": True, "ai_consent": True, "log_date": "2026-03-01",
}


def test_me_for_new_user_is_not_onboarded(env):
    seed_user(env.db, profile=None)
    r = env.client.get("/v1/me", headers=H())
    assert r.status_code == 200
    d = r.json()
    assert d["onboarded"] is False and d["profile"] is None and d["goal"] is None and d["diet"] is None
    assert d["tier"] == "free" and d["user"]["id"] == "user-1"


def test_me_falls_back_to_token_identity_when_row_missing(env):
    d = env.client.get("/v1/me", headers=H()).json()
    assert d["user"]["email"] == "user-1@example.com" and d["onboarded"] is False


def test_me_reports_tier_entitlements_and_profile(env):
    seed_user(env.db)
    env.db.tables["dietary_preferences"] = [{"user_id": "user-1", "diet_type": "vegan"}]
    env.db.tables["subscriptions"] = [{"user_id": "user-1", "tier": "pro", "status": "active", "created_at": "2026-01-01"}]
    env.db.tables["plan_entitlements"] = [{"tier": "pro", "feature": "ai_food_scan"}, {"tier": "free", "feature": "manual_food_log"}]
    d = env.client.get("/v1/me", headers=H()).json()
    assert d["onboarded"] is True and d["goal"] == "fat_loss" and d["diet"]["diet_type"] == "vegan"
    assert d["tier"] == "pro" and d["entitlements"] == ["ai_food_scan"]


def test_me_does_not_leak_other_users(env):
    seed_user(env.db, "user-2")
    d = env.client.get("/v1/me", headers=H("user-1")).json()
    assert d["onboarded"] is False and d["profile"] is None


def test_onboarding_saves_everything_and_computes_targets(env):
    seed_user(env.db, profile=None)
    r = env.client.post("/v1/onboarding", json=ONBOARD, headers=H())
    assert r.status_code == 200, r.text
    t = r.json()["targets"]
    expect = fe.compute_targets(weight_kg=70, height_cm=165, age=fe.age_from_dob(__import__("datetime").date(1995, 5, 1)),
                                gender=fe.Gender.female, activity=fe.Activity.lightly_active, goal=fe.Goal.fat_loss,
                                training_days=4, target_weight_kg=62)
    assert t["target_kcal"] == expect.target_kcal and t["protein_g"] == expect.protein_g and "disclaimer" in t

    prof = env.db.tables["user_profiles"][0]
    assert prof["user_id"] == "user-1" and prof["target_kcal"] == expect.target_kcal
    assert prof["target_protein_g"] == expect.protein_g and prof["target_water_ml"] == expect.water_ml
    assert prof["workout_days"] == [1, 3, 5]                     # de-duplicated and sorted
    assert prof["preferred_workout_time"] == "06:30" and prof["water_target_custom"] is False
    u = env.db.tables["users"][0]
    assert u["full_name"] == "Asha Rao" and u["privacy_consent_at"] and u["ai_consent_at"]
    assert env.db.tables["fitness_goals"][0]["goal"] == "fat_loss"
    assert env.db.tables["dietary_preferences"][0]["allergies"] == ["peanuts"]
    assert env.db.tables["dietary_preferences"][0]["cuisines"] == ["indian", "asian"]
    assert env.db.tables["weight_logs"][0]["weight_kg"] == 70 and env.db.tables["weight_logs"][0]["log_date"] == "2026-03-01"
    assert env.client.get("/v1/me", headers=H()).json()["onboarded"] is True


def test_onboarding_ai_consent_false_leaves_ai_unset_and_equipment_deduped(env):
    seed_user(env.db, profile=None)
    env.client.post("/v1/onboarding", json={**ONBOARD, "ai_consent": False}, headers=H())
    assert env.db.tables["users"][0]["ai_consent_at"] is None
    assert env.db.tables["user_profiles"][0]["equipment"] == ["dumbbells"]


def test_onboarding_is_idempotent(env):
    seed_user(env.db, profile=None)
    for _ in range(2):
        assert env.client.post("/v1/onboarding", json=ONBOARD, headers=H()).status_code == 200
    for t in ("user_profiles", "fitness_goals", "dietary_preferences", "weight_logs"):
        assert len(env.db.tables[t]) == 1, t


@pytest.mark.parametrize("patch,code", [
    ({"privacy_consent": False}, 422), ({"date_of_birth": "2999-01-01"}, 422), ({"date_of_birth": "2020-01-01"}, 422),
    ({"weight_kg": 5}, 422), ({"height_cm": 400}, 422), ({"goal": "bogus"}, 422), ({"training_days": 9}, 422),
    ({"preferred_workout_time": "25:99"}, 422), ({"workout_days": [0, 8]}, 422), ({"meals_per_day": 1}, 422),
    ({"diet_type": "carnivore"}, 422), ({"monthly_budget": -5}, 422), ({"full_name": ""}, 422),
])
def test_onboarding_validation(env, patch, code):
    seed_user(env.db, profile=None)
    assert env.client.post("/v1/onboarding", json={**ONBOARD, **patch}, headers=H()).status_code == code
    assert env.db.tables.get("user_profiles", []) == []  # nothing is half-saved


def test_onboarding_without_account_row_is_409(env):
    assert env.client.post("/v1/onboarding", json=ONBOARD, headers=H()).status_code == 409


def test_profile_update_recomputes_targets_and_keeps_custom_water(env):
    seed_user(env.db, profile={**PROFILE, "target_water_ml": 3300, "water_target_custom": True})
    r = env.client.put("/v1/profile", json={"weight_kg": 90, "goal": "muscle_gain"}, headers=H())
    assert r.status_code == 200, r.text
    prof = env.db.tables["user_profiles"][0]
    assert prof["weight_kg"] == 90 and prof["target_water_ml"] == 3300           # custom water survives
    assert prof["target_kcal"] == r.json()["targets"]["target_kcal"] != 2400
    assert env.db.tables["fitness_goals"][0]["goal"] == "muscle_gain"


def test_profile_update_diet_and_name(env):
    seed_user(env.db)
    r = env.client.put("/v1/profile", json={"full_name": "New Name", "allergies": ["soy"], "meals_per_day": 3}, headers=H())
    assert r.status_code == 200
    assert env.db.tables["users"][0]["full_name"] == "New Name"
    d = env.db.tables["dietary_preferences"][0]
    assert d["allergies"] == ["soy"] and d["meals_per_day"] == 3


@pytest.mark.parametrize("body,code", [({}, 422), ({"weight_kg": 5}, 422), ({"weight_kg": None}, 422),
                                       ({"goal": "bogus"}, 422), ({"date_of_birth": "2020-01-01"}, 422)])
def test_profile_update_validation(env, body, code):
    seed_user(env.db)
    assert env.client.put("/v1/profile", json=body, headers=H()).status_code == code


def test_profile_update_requires_onboarding(env):
    seed_user(env.db, profile=None)
    assert env.client.put("/v1/profile", json={"weight_kg": 70}, headers=H()).status_code == 409


def test_profile_update_never_touches_other_users(env):
    seed_user(env.db, "user-1")
    seed_user(env.db, "user-2")
    env.client.put("/v1/profile", json={"weight_kg": 95}, headers=H("user-1"))
    other = next(p for p in env.db.tables["user_profiles"] if p["user_id"] == "user-2")
    assert other["weight_kg"] == 80


def test_consent_toggle(env):
    seed_user(env.db, profile=None)
    on = env.client.post("/v1/consent", json={"ai": True}, headers=H()).json()
    assert on["ai_consent_at"] and env.db.tables["users"][0]["ai_consent_at"]
    off = env.client.post("/v1/consent", json={"ai": False}, headers=H()).json()
    assert off["ai_consent_at"] is None and env.db.tables["users"][0]["ai_consent_at"] is None
    assert env.client.post("/v1/consent", json={}, headers=H()).status_code == 422
