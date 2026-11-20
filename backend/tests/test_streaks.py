from datetime import date

from app.services import streaks as sk
from tests.test_core_support import H, env, seed_user  # noqa: F401

TODAY = date(2026, 3, 10)


def test_current_and_longest():
    days = ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-08", "2026-03-09"]
    assert sk.current_streak(days, TODAY) == 2          # today empty, chain through yesterday
    assert sk.longest_streak(days) == 3
    assert sk.current_streak(days, date(2026, 3, 12)) == 0
    assert sk.streak([], TODAY) == {"current": 0, "longest": 0}


def test_water_goal_days_ignore_non_counting():
    rows = [{"log_date": "2026-03-09", "amount_ml": 1500, "counts_toward_goal": True},
            {"log_date": "2026-03-09", "amount_ml": 1000, "counts_toward_goal": True},
            {"log_date": "2026-03-08", "amount_ml": 3000, "counts_toward_goal": False}]
    assert sk.water_goal_days(rows, 2500) == {date(2026, 3, 9)}
    assert sk.water_goal_days(rows, None) == set()


def test_badges_progress():
    b = {x["key"]: x for x in sk.badges(5, 10, 0, 0)}
    assert not b["streak_7"]["earned"] and b["streak_7"]["progress"] == 5
    assert b["workouts_10"]["earned"] and b["first_workout"]["earned"] and not b["first_scan"]["earned"]


def test_endpoint(env):
    seed_user(env.db)
    env.db.tables["meal_logs"] = [{"id": f"m{i}", "user_id": "user-1", "log_date": f"2026-03-{i:02d}"} for i in range(3, 10)] + \
        [{"id": "x", "user_id": "user-2", "log_date": "2026-03-10"}]
    env.db.tables["workout_sessions"] = [
        {"user_id": "user-1", "log_date": "2026-03-09", "finished_at": "2026-03-09T08:00:00Z"},
        {"user_id": "user-1", "log_date": "2026-03-08", "finished_at": None}]
    env.db.tables["food_scans"] = [{"id": "s1", "user_id": "user-1", "status": "done"},
                                   {"id": "s2", "user_id": "user-1", "status": "failed"}]
    r = env.client.get("/v1/streaks?today=2026-03-10", headers=H())
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["streaks"]["logging"] == {"current": 7, "longest": 7}
    assert d["streaks"]["workout"]["current"] == 1 and d["totals"] == {"workouts": 1, "scans": 1}
    b = {x["key"]: x for x in d["badges"]}
    assert b["streak_7"]["earned"] and b["first_workout"]["earned"] and b["first_scan"]["earned"] and not b["workouts_10"]["earned"]


def test_requires_auth(env):
    assert env.client.get("/v1/streaks").status_code in (401, 403)
