from datetime import date

import pytest

from app.data.exercises_seed import EXERCISES
from app.services import workout_extras as wx
from tests.test_core_support import H, env, seed_user  # noqa: F401

BY_NAME = {}


def seed(env, uid="user-1", **profile_over):
    seed_user(env.db, uid)
    env.db.tables["user_profiles"][0].update({"experience": "intermediate", "workout_env": "gym", "equipment": [], "injuries": [], **profile_over})
    cat = [{"id": f"ex-{i}", "name": e["name"], "muscle_group": e["muscle_group"], "secondary_muscles": e["secondary_muscles"],
            "equipment": e["equipment"], "difficulty": e["difficulty"], "is_compound": e["is_compound"],
            "contraindications": e["contraindications"], "instructions": e["instructions"], "common_mistakes": e["common_mistakes"],
            "alternative_ids": [], "media_url": None} for i, e in enumerate(EXERCISES)]
    env.db.tables["exercises"] = cat
    BY_NAME.update({e["name"]: e for e in cat})
    return cat


def post_quick(env, **body):
    return env.client.post("/v1/workouts/quick", json=body, headers=H())


def day_exercises(r):
    return [i["exercise"] for i in r.json()["day"]["exercises"]]


# ---------- quick ----------
def test_quick_requires_auth(env):
    assert env.client.post("/v1/workouts/quick", json={"minutes": 30}).status_code in (401, 403)


def test_quick_shape_and_duration(env):
    seed(env)
    for m in (15, 30, 45, 60):
        r = post_quick(env, minutes=m)
        assert r.status_code == 200, r.text
        d = r.json()["day"]
        assert d["id"] == "quick" and not d["is_rest"] and len(d["exercises"]) >= 2
        assert {"exercise", "sets", "reps", "rest_s"} <= set(d["exercises"][0])
        assert d["estimated_minutes"] <= m + 8
    assert len(post_quick(env, minutes=60).json()["day"]["exercises"]) >= len(post_quick(env, minutes=15).json()["day"]["exercises"])


def test_quick_rejects_bad_minutes(env):
    seed(env)
    assert post_quick(env, minutes=20).status_code == 422
    assert post_quick(env, minutes=90).status_code == 422


def test_quick_needs_profile(env):
    seed_user(env.db, profile=None)
    assert post_quick(env, minutes=30).status_code == 409


@pytest.mark.parametrize("muscle", ["chest", "legs", "biceps", "core", "push"])
def test_quick_muscle_filter(env, muscle):
    seed(env)
    r = post_quick(env, minutes=45, muscle=muscle)
    assert r.status_code == 200, r.text
    groups = {e["muscle_group"] for e in day_exercises(r)}
    allowed = {"legs": {"quads", "hamstrings", "glutes", "calves"}, "push": {"chest", "shoulders", "triceps"}}.get(muscle, {muscle})
    assert groups <= allowed and groups


def test_quick_unknown_muscle_422(env):
    seed(env)
    assert post_quick(env, minutes=30, muscle="elbows_of_doom").status_code == 422


def test_quick_injury_filtering(env):
    seed(env, injuries=["bad knee", "lower back pain"])
    r = post_quick(env, minutes=60, muscle="legs")
    assert r.status_code == 200
    for e in day_exercises(r):
        assert not set(e["contraindications"]) & {"knee", "lower_back"}
    assert any("limitations" in n for n in r.json()["notes"])


def test_quick_profile_equipment_home(env):
    seed(env, workout_env="home", equipment=["dumbbells"])
    r = post_quick(env, minutes=45)
    assert r.status_code == 200
    for e in day_exercises(r):
        assert set(e["equipment"]) <= {"bodyweight", "dumbbell"}


def test_quick_equipment_request_narrows(env):
    seed(env)
    r = post_quick(env, minutes=45, muscle="chest", equipment=["dumbbells"])
    assert r.status_code == 200
    assert all(set(e["equipment"]) <= {"dumbbell"} for e in day_exercises(r))
    # no matching equipment for that muscle -> clear 422, never an empty plan
    assert post_quick(env, minutes=30, muscle="chest", equipment=["kettlebell"]).status_code == 422


# ---------- history ----------
def add_session(env, uid, sid, day, finished=True):
    env.db.tables.setdefault("workout_sessions", []).append(
        {"id": sid, "user_id": uid, "log_date": day, "started_at": f"{day}T08:00:00Z", "finished_at": f"{day}T09:00:00Z" if finished else None})


def add_set(env, sid, ex, n, reps, w, pr=False, completed=True):
    env.db.tables.setdefault("workout_sets", []).append(
        {"id": f"set-{len(env.db.tables.get('workout_sets', []))}", "session_id": sid, "exercise_id": ex, "set_number": n,
         "reps": reps, "weight_kg": w, "completed": completed, "skipped": False, "is_pr": pr})


def hist(env, ex_id, uid="user-1", **q):
    qs = "&".join(f"{k}={v}" for k, v in q.items())
    return env.client.get(f"/v1/workouts/exercises/{ex_id}/history?{qs}", headers=H(uid))


def test_history_requires_auth(env):
    seed(env)
    assert env.client.get("/v1/workouts/exercises/ex-0/history").status_code in (401, 403)


def test_history_empty_and_unknown(env):
    cat = seed(env)
    r = hist(env, cat[0]["id"])
    assert r.status_code == 200
    d = r.json()
    assert d["sessions"] == [] and d["best"] is None and d["e1rm"] is None
    assert d["suggestion"]["action"] == "start" and d["suggestion"]["weight_kg"] is None and d["warmup"] == []
    assert hist(env, "nope").status_code == 404


def test_history_progressive_overload_and_isolation(env):
    cat = seed(env)
    ex = BY_NAME["Barbell bench press"]["id"]
    add_session(env, "user-1", "s1", "2026-03-01")
    add_session(env, "user-1", "s2", "2026-03-08")
    add_session(env, "user-2", "s3", "2026-03-09")
    for n in (1, 2, 3):
        add_set(env, "s1", ex, n, 8, 60.0)
        add_set(env, "s2", ex, n, 10, 60.0)
        add_set(env, "s3", ex, n, 5, 200.0, pr=True)  # someone else's data must never leak
    d = hist(env, ex).json()
    assert [s["date"] for s in d["sessions"]] == ["2026-03-08", "2026-03-01"]
    assert d["best"]["weight_kg"] == 60.0 and d["best"]["reps"] == 10 and d["best"]["e1rm"] == 80.0
    assert d["e1rm"] == 80.0
    assert d["suggestion"]["action"] == "increase" and d["suggestion"]["weight_kg"] == 65.0  # compound >= 60 kg: +5
    assert [w["weight_kg"] for w in d["warmup"]] == [32.5, 45.0, 55.0] and [w["reps"] for w in d["warmup"]] == [8, 5, 3]
    assert len(hist(env, ex, limit=1).json()["sessions"]) == 1
    other = hist(env, ex, uid="user-2").json()
    assert other["best"]["weight_kg"] == 200.0 and len(other["sessions"]) == 1


def test_history_repeat_when_reps_short_and_ignores_incomplete(env):
    seed(env)
    ex = BY_NAME["Dumbbell bench press"]["id"]
    add_session(env, "user-1", "s1", "2026-03-01")
    add_set(env, "s1", ex, 1, 10, 20.0)
    add_set(env, "s1", ex, 2, 7, 20.0)
    add_set(env, "s1", ex, 3, 12, 30.0, completed=False)
    s = hist(env, ex).json()["suggestion"]
    assert s == {"action": "repeat", "weight_kg": 20.0, "reps": 8, "reason": s["reason"]}


def test_suggest_next_rules():
    assert wx.suggest_next([{"completed": True, "reps": 12, "weight_kg": 20}], False, 12)["weight_kg"] == 22.5
    bw = wx.suggest_next([{"completed": True, "reps": 15, "weight_kg": 0}], False, 12)
    assert bw["action"] == "add_reps" and bw["reps"] == 16
    assert wx.warmup_sets(10, True) == [] and wx.warmup_sets(100, False) == []


# ---------- overview ----------
def test_overview_requires_auth(env):
    assert env.client.get("/v1/workouts/overview").status_code in (401, 403)


def test_overview_empty(env):
    seed(env)
    d = env.client.get("/v1/workouts/overview?today=2026-03-11", headers=H()).json()
    assert d["muscles"] == [] and d["sessions_this_week"] == 0 and d["planned_sessions"] == 0
    assert d["streak"] == {"current": 0, "longest": 0} and d["last_pr"] is None and d["week_start"] == "2026-03-09"


def test_overview_week_volume_streak_pr_and_isolation(env):
    seed(env)
    bench, squat = BY_NAME["Barbell bench press"]["id"], BY_NAME["Barbell back squat"]["id"]
    add_session(env, "user-1", "prev", "2026-03-05")      # previous week
    add_session(env, "user-1", "a", "2026-03-09")         # Monday this week
    add_session(env, "user-1", "b", "2026-03-10")
    add_session(env, "user-1", "open", "2026-03-11", finished=False)
    add_session(env, "user-2", "other", "2026-03-10")
    add_set(env, "prev", bench, 1, 10, 50.0)
    add_set(env, "a", bench, 1, 10, 60.0)
    add_set(env, "a", bench, 2, 10, 60.0)
    add_set(env, "b", squat, 1, 5, 100.0, pr=True)
    add_set(env, "open", bench, 1, 10, 999.0)
    add_set(env, "other", bench, 1, 10, 500.0, pr=True)
    env.db.tables["workout_plans"] = [{"id": "p1", "user_id": "user-1", "name": "x", "is_active": True}]
    env.db.tables["workout_days"] = [{"id": f"d{i}", "plan_id": "p1", "weekday": i, "is_rest": i > 3} for i in range(1, 8)]
    d = env.client.get("/v1/workouts/overview?today=2026-03-11", headers=H()).json()
    m = {x["muscle_group"]: x for x in d["muscles"]}
    assert m["chest"]["sets"] == 2 and m["chest"]["volume_kg"] == 1200.0 and m["chest"]["prev_sets"] == 1
    assert m["quads"]["sets"] == 1 and m["quads"]["volume_kg"] == 500.0
    assert d["sessions_this_week"] == 2 and d["planned_sessions"] == 3
    assert d["streak"]["current"] == 2
    assert d["last_pr"]["name"] == "Barbell back squat" and d["last_pr"]["achieved_on"] == "2026-03-10"
