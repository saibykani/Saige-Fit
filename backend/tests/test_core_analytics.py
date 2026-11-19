from datetime import date

import pytest

from app.services import analytics_calc as ac
from tests.test_core_support import H, PROFILE, UUIDS, env, seed_user  # noqa: F401

T = {"kcal": 2000, "protein_g": 120, "carbs_g": 230, "fat_g": 60, "fiber_g": 30, "water_ml": 2500}


def meal(day, kcal, mt="lunch", protein=10.0, carbs=20.0, fat=5.0):
    return {"log_date": day, "meal_type": mt, "meal_items": [{"kcal": kcal, "protein_g": protein, "carbs_g": carbs, "fat_g": fat, "fiber_g": 2}]}


# ================================================================ pure
def test_build_series_averages_adherence_and_streak():
    days = ac.daterange(date(2026, 3, 1), date(2026, 3, 7))
    meals = [meal("2026-03-05", 2000), meal("2026-03-06", 1000), meal("2026-03-07", 2100, "dinner"), meal("2026-03-07", 100, "snack")]
    water = [{"log_date": "2026-03-07", "amount_ml": 2500, "counts_toward_goal": True},
             {"log_date": "2026-03-07", "amount_ml": 900, "counts_toward_goal": False}]
    sessions = [{"log_date": "2026-03-06", "started_at": "2026-03-06T10:00:00Z", "finished_at": "2026-03-06T10:45:00Z"},
                {"log_date": "2026-03-07", "started_at": "2026-03-07T10:00:00Z", "finished_at": None}]   # unfinished ignored
    weights = [{"log_date": "2026-03-01", "weight_kg": 80}, {"log_date": "2026-03-07", "weight_kg": 79}]
    r = ac.build(days, meals, water, sessions, weights, T, as_of=date(2026, 3, 7))
    s = r["series"]
    assert r["labels"][0] == "2026-03-01" and len(r["labels"]) == 7
    assert s["calories"] == [0, 0, 0, 0, 2000, 1000, 2200]
    assert s["water_ml"][-1] == 2500                       # non-counting beverage excluded
    assert s["workouts"][5] == 1 and s["workouts"][6] == 0 and s["workout_minutes"][5] == 45
    assert s["weight_kg"][0] == 80 and s["weight_kg"][3] is None and s["weight_kg"][6] == 79
    assert r["averages"]["calories"] == pytest.approx((2000 + 1000 + 2200) / 3, abs=0.1)   # logged days only
    assert r["averages"]["logged_days"] == 3 and r["averages"]["weight_change_kg"] == -1.0
    assert r["averages"]["workouts_per_week"] == 1.0 and r["averages"]["hydration_goal_days"] == 1
    assert r["adherence_pct"] == pytest.approx(100 * 2 / 7, abs=0.1)    # 2000 and 2200 (110%) are within 85-115%
    assert r["streak_days"] == 3
    assert {m["meal_type"] for m in r["by_meal"]} == {"lunch", "dinner", "snack"}


def test_streak_ignores_today_until_logged_and_breaks_on_gap():
    days = ac.daterange(date(2026, 3, 1), date(2026, 3, 5))
    r = ac.build(days, [meal("2026-03-03", 1), meal("2026-03-04", 1)], [], [], [], T, as_of=date(2026, 3, 5))
    assert r["streak_days"] == 2                                       # today (03-05) empty but yesterday chain counts
    r = ac.build(days, [meal("2026-03-01", 1), meal("2026-03-04", 1)], [], [], [], T, as_of=date(2026, 3, 5))
    assert r["streak_days"] == 1


def test_future_days_do_not_count_against_adherence():
    days = ac.daterange(date(2026, 3, 1), date(2026, 3, 31))
    r = ac.build(days, [meal("2026-03-01", 2000)], [], [], [], T, as_of=date(2026, 3, 1))
    assert r["adherence_pct"] == 100.0
    assert ac.build(days, [], [], [], [], T, as_of=date(2026, 2, 1))["adherence_pct"] == 0.0     # nothing elapsed yet


def test_build_handles_empty_data():
    r = ac.build(ac.daterange(date(2026, 3, 1), date(2026, 3, 3)), [], [], [], [], T, as_of=date(2026, 3, 3))
    assert r["series"]["calories"] == [0, 0, 0] and r["averages"]["calories"] == 0.0
    assert r["averages"]["weight_change_kg"] is None and r["streak_days"] == 0 and r["adherence_pct"] == 0.0


def test_rows_outside_range_are_ignored():
    r = ac.build(ac.daterange(date(2026, 3, 1), date(2026, 3, 2)), [meal("2026-02-28", 999)], [], [], [], T, as_of=date(2026, 3, 2))
    assert sum(r["series"]["calories"]) == 0


# ================================================================ endpoints
def seed_week(env):
    seed_user(env.db)
    env.db.tables["meal_logs"] = [
        {"id": "m1", "user_id": "user-1", **meal("2026-03-05", 2400)},
        {"id": "m2", "user_id": "user-1", **meal("2026-03-06", 2300, "dinner")},
        {"id": "m3", "user_id": "user-2", **meal("2026-03-06", 9999)},             # other user's data must not leak in
        {"id": "m4", "user_id": "user-1", **meal("2026-02-20", 111)},               # outside the window
    ]
    env.db.tables["hydration_logs"] = [{"user_id": "user-1", "log_date": "2026-03-06", "amount_ml": 2800, "counts_toward_goal": True}]
    env.db.tables["weight_logs"] = [{"user_id": "user-1", "log_date": "2026-03-01", "weight_kg": 81},
                                    {"user_id": "user-1", "log_date": "2026-03-06", "weight_kg": 80}]
    env.db.tables["workout_sessions"] = [{"user_id": "user-1", "log_date": "2026-03-06",
                                          "started_at": "2026-03-06T07:00:00Z", "finished_at": "2026-03-06T08:00:00Z"}]


def test_weekly_endpoint(env):
    seed_week(env)
    r = env.client.get("/v1/analytics/weekly?end=2026-03-07", headers=H())
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["labels"] == [f"2026-03-0{i}" for i in range(1, 8)]
    assert d["series"]["calories"][4:6] == [2400, 2300] and sum(d["series"]["calories"]) == 4700   # no leakage
    assert d["series"]["water_ml"][5] == 2800 and d["series"]["workouts"][5] == 1 and d["series"]["workout_minutes"][5] == 60
    assert d["targets"]["kcal"] == 2400 and d["averages"]["weight_change_kg"] == -1.0
    assert d["adherence_pct"] == pytest.approx(100 * 2 / 7, abs=0.1) and d["streak_days"] == 2       # 03-07 empty, chain 03-06 + 03-05 still counts


def test_weekly_streak_counts_back_from_last_logged_day(env):
    seed_week(env)
    d = env.client.get("/v1/analytics/weekly?end=2026-03-06", headers=H()).json()
    assert d["streak_days"] == 2


def test_daily_endpoint_has_workout_completion_and_meal_breakdown(env):
    seed_week(env)
    d = env.client.get("/v1/analytics/daily?date=2026-03-06", headers=H()).json()
    assert d["labels"] == ["2026-03-06"] and d["series"]["calories"] == [2300] and d["workout_completed"] is True
    assert d["by_meal"] == [{"meal_type": "dinner", "kcal": 2300}]
    assert env.client.get("/v1/analytics/daily?date=2026-03-05", headers=H()).json()["workout_completed"] is False


def test_monthly_endpoint(env):
    seed_week(env)
    d = env.client.get("/v1/analytics/monthly?month=2026-03&today=2026-03-10", headers=H()).json()
    assert len(d["labels"]) == 31 and d["range"]["as_of"] == "2026-03-10"
    assert d["averages"]["logged_days"] == 2
    past = env.client.get("/v1/analytics/monthly?month=2026-02", headers=H()).json()
    assert len(past["labels"]) == 28 and past["series"]["calories"][19] == 111


@pytest.mark.parametrize("path", ["/v1/analytics/monthly?month=2026-13", "/v1/analytics/monthly?month=26-03",
                                  "/v1/analytics/monthly", "/v1/analytics/weekly", "/v1/analytics/daily?date=nope"])
def test_analytics_validation(env, path):
    seed_week(env)
    assert env.client.get(path, headers=H()).status_code == 422


def test_analytics_requires_onboarding(env):
    assert env.client.get("/v1/analytics/weekly?end=2026-03-07", headers=H()).status_code == 409


# ================================================================ journal (meals_extra)
FOODS = [{"id": UUIDS[1], "name": "Rice", "food_nutrition": [{"kcal": 130, "protein_g": 2.7, "carbs_g": 28, "fat_g": 0.3, "fiber_g": 0.4}]}]


def test_list_meals_with_totals_scoped_to_user_and_date(env):
    env.db.tables["meal_logs"] = [
        {"id": "m1", "user_id": "user-1", "log_date": "2026-03-01", "meal_type": "lunch", "eaten_at": "2026-03-01T12:00:00Z",
         "meal_items": [{"kcal": 195, "protein_g": 4, "carbs_g": 42, "fat_g": 0.5}, {"kcal": 100, "protein_g": 5, "carbs_g": 10, "fat_g": 3}]},
        {"id": "m2", "user_id": "user-1", "log_date": "2026-03-02", "meal_type": "lunch", "eaten_at": "x", "meal_items": []},
        {"id": "m3", "user_id": "user-2", "log_date": "2026-03-01", "meal_type": "lunch", "eaten_at": "x", "meal_items": []}]
    r = env.client.get("/v1/meals?date=2026-03-01", headers=H()).json()
    assert [m["id"] for m in r["meals"]] == ["m1"] and r["meals"][0]["total"]["kcal"] == 295
    assert env.client.get("/v1/meals", headers=H()).status_code == 422


def test_delete_meal_only_own(env):
    env.db.tables["meal_logs"] = [{"id": "m1", "user_id": "user-1"}, {"id": "m2", "user_id": "user-2"}]
    assert env.client.delete("/v1/meals/m2", headers=H()).status_code == 404
    assert env.client.delete("/v1/meals/m1", headers=H()).status_code == 200
    assert [m["id"] for m in env.db.tables["meal_logs"]] == ["m2"]


def test_patch_item_recomputes_from_food_record(env):
    env.db.tables["food_items"] = FOODS
    env.db.tables["meal_logs"] = [{"id": "m1", "user_id": "user-1"}, {"id": "m2", "user_id": "user-2"}]
    env.db.tables["meal_items"] = [{"id": "i1", "meal_id": "m1", "food_id": UUIDS[1], "quantity_g": 100, "kcal": 130},
                                   {"id": "i2", "meal_id": "m2", "food_id": UUIDS[1], "quantity_g": 100, "kcal": 130}]
    r = env.client.patch("/v1/meals/m1/items/i1", json={"quantity_g": 200}, headers=H())
    assert r.status_code == 200, r.text
    it = r.json()["item"]
    assert it["kcal"] == 260.0 and it["protein_g"] == 5.4 and it["quantity_g"] == 200 and it["user_edited"] is True
    assert env.client.patch("/v1/meals/m2/items/i2", json={"quantity_g": 50}, headers=H()).status_code == 404    # not mine
    assert env.client.patch("/v1/meals/m1/items/i2", json={"quantity_g": 50}, headers=H()).status_code == 404    # wrong meal
    for q in (0, -1, 5001, "x"):
        assert env.client.patch("/v1/meals/m1/items/i1", json={"quantity_g": q}, headers=H()).status_code == 422


def test_patch_item_whose_food_was_removed_is_409(env):
    env.db.tables["meal_logs"] = [{"id": "m1", "user_id": "user-1"}]
    env.db.tables["meal_items"] = [{"id": "i1", "meal_id": "m1", "food_id": None, "quantity_g": 100, "kcal": 130}]
    assert env.client.patch("/v1/meals/m1/items/i1", json={"quantity_g": 50}, headers=H()).status_code == 409


# ================================================================ dashboard extension + activity
def test_dashboard_activity_and_meal_slots(env):
    seed_user(env.db, profile={**PROFILE, "target_kcal": 2000})
    env.db.tables["meal_logs"] = [{"id": "m1", "user_id": "user-1", "log_date": "2026-03-01", "meal_type": "breakfast",
                                   "meal_items": [{"kcal": 400, "protein_g": 20, "carbs_g": 50, "fat_g": 10}]},
                                  {"id": "m2", "user_id": "user-1", "log_date": "2026-03-01", "meal_type": "snack",
                                   "meal_items": [{"kcal": 150, "protein_g": 5, "carbs_g": 20, "fat_g": 5}]}]
    env.db.tables["daily_activity"] = [{"user_id": "user-1", "log_date": "2026-03-01", "steps": 8123, "sleep_hours": 7.5}]
    env.db.tables["workout_sessions"] = [
        {"user_id": "user-1", "log_date": "2026-03-01", "started_at": "2026-03-01T07:00:00Z", "finished_at": "2026-03-01T07:50:00Z", "kcal_burned": 320},
        {"user_id": "user-1", "log_date": "2026-03-01", "started_at": "2026-03-01T18:00:00Z", "finished_at": None, "kcal_burned": None}]
    env.db.tables["diet_plan_meals"] = [{"plan_date": "2026-03-01", "meal_type": "breakfast", "name": "Poha", "kcal": 350},
                                        {"plan_date": "2026-03-01", "meal_type": "lunch", "name": "Dal rice", "kcal": 600},
                                        {"plan_date": "2026-03-02", "meal_type": "lunch", "name": "Other day", "kcal": 1}]
    d = env.client.get("/v1/dashboard?date=2026-03-01&hour=10", headers=H()).json()
    assert d["activity"] == {"steps": 8123, "sleep_hours": 7.5, "workout_minutes": 50, "active_kcal": 320}
    slots = {s["meal_type"]: s for s in d["meal_slots"]}
    assert slots["breakfast"] == {"meal_type": "breakfast", "planned_kcal": 350.0, "planned_meals": ["Poha"], "logged_kcal": 400.0}
    assert slots["lunch"]["planned_kcal"] == 600.0 and slots["lunch"]["logged_kcal"] == 0.0
    assert slots["snack"]["planned_kcal"] is None and slots["snack"]["logged_kcal"] == 150.0
    assert slots["dinner"]["planned_meals"] == [] and d["consumed"]["kcal"] == 550.0
    assert [s["meal_type"] for s in d["meal_slots"][:6]] == ["early_morning", "breakfast", "mid_morning", "lunch", "evening_snack", "dinner"]


def test_dashboard_activity_defaults_when_nothing_logged(env):
    seed_user(env.db)
    d = env.client.get("/v1/dashboard?date=2026-03-01&hour=9", headers=H()).json()
    assert d["activity"] == {"steps": None, "sleep_hours": None, "workout_minutes": 0, "active_kcal": 0}
    assert all(s["logged_kcal"] == 0 and s["planned_kcal"] is None for s in d["meal_slots"])


def test_activity_upsert_merges_fields_and_validates(env):
    r = env.client.post("/v1/activity", json={"date": "2026-03-01", "steps": 5000}, headers=H())
    assert r.status_code == 200 and r.json()["steps"] == 5000
    r = env.client.post("/v1/activity", json={"date": "2026-03-01", "sleep_hours": 6.5}, headers=H())
    assert r.json() == {"date": "2026-03-01", "steps": 5000, "sleep_hours": 6.5}            # steps survived
    assert len(env.db.tables["daily_activity"]) == 1
    env.client.post("/v1/activity", json={"date": "2026-03-01", "steps": 9000}, headers=H("user-2"))
    assert len(env.db.tables["daily_activity"]) == 2                                          # per-user rows
    for body in ({"date": "2026-03-01"}, {"date": "2026-03-01", "steps": -1}, {"date": "2026-03-01", "steps": 200001},
                 {"date": "2026-03-01", "sleep_hours": 25}, {"steps": 5}):
        assert env.client.post("/v1/activity", json=body, headers=H()).status_code == 422
