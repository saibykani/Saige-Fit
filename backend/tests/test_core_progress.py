import httpx
import pytest

from app.services import progress_calc as pc
from tests.test_core_support import H, PROFILE, UUIDS, env, seed_user  # noqa: F401

D = "2026-03-01"


# ================================================================ pure calculations
def test_goal_pct_loss_gain_and_clamping():
    assert pc.goal_pct(90, 80, 70) == 50.0                       # loss goal, halfway
    assert pc.goal_pct(60, 65, 70) == 50.0                       # gain goal
    assert pc.goal_pct(90, 95, 70) == 0.0                        # moved the wrong way
    assert pc.goal_pct(90, 65, 70) == 100.0                      # overshoot clamps
    assert pc.goal_pct(80, 80, 80) == 100.0 and pc.goal_pct(80, 82, 80) == 0.0   # start == target
    assert pc.goal_pct(None, 80, 70) is None and pc.goal_pct(90, 80, None) is None


def test_weekly_change_slope():
    pts = [{"log_date": "2026-03-01", "weight_kg": 80}, {"log_date": "2026-03-08", "weight_kg": 79},
           {"log_date": "2026-03-15", "weight_kg": 78}]
    assert pc.weekly_change(pts) == -1.0
    assert pc.weekly_change(pts[:1]) is None and pc.weekly_change([]) is None
    assert pc.weekly_change([pts[0], {"log_date": "2026-03-01", "weight_kg": 81}]) is None   # same day


def test_trend_7d_window():
    pts = [{"log_date": "2026-03-01", "weight_kg": 80}, {"log_date": "2026-03-03", "weight_kg": 82},
           {"log_date": "2026-03-20", "weight_kg": 70}]
    tr = pc.trend_7d_avg(pts)
    assert [t["avg_kg"] for t in tr] == [80.0, 81.0, 70.0]       # last point has no neighbours in its window
    assert pc.trend_7d_avg([]) == []


def test_measurement_deltas_use_earliest_and_latest_recorded():
    rows = [{"log_date": "2026-01-01", "waist_cm": 90, "arm_cm": 35}, {"log_date": "2026-02-01", "waist_cm": 88},
            {"log_date": "2026-03-01", "waist_cm": 85, "chest_cm": 100}]
    d = pc.measurement_deltas(rows)
    assert d["waist_cm"] == -5.0 and d["arm_cm"] is None and d["chest_cm"] is None and d["hip_cm"] is None


# ================================================================ hydration
def test_hydration_add_totals_and_beverage_rules(env):
    seed_user(env.db)
    assert env.client.post("/v1/hydration", json={"amount_ml": 250, "log_date": D}, headers=H()).status_code == 201
    env.client.post("/v1/hydration", json={"amount_ml": 500, "log_date": D}, headers=H())
    tea = env.client.post("/v1/hydration", json={"amount_ml": 200, "beverage": "  Masala  Tea ", "log_date": D}, headers=H()).json()
    assert tea["log"]["beverage"] == "masala tea" and tea["log"]["counts_toward_goal"] is False
    env.client.post("/v1/hydration", json={"amount_ml": 300, "beverage": "coconut water", "counts_toward_goal": True, "log_date": D}, headers=H())
    day = env.client.get(f"/v1/hydration?date={D}", headers=H()).json()
    assert day["target_ml"] == 2800
    assert day["water_ml"] == 750                  # plain water only
    assert day["total_ml"] == 1050                 # everything that counts toward the goal
    assert day["all_ml"] == 1250
    assert len(day["logs"]) == 4


@pytest.mark.parametrize("body", [{"amount_ml": 0}, {"amount_ml": 5001}, {"amount_ml": 250, "beverage": ""},
                                  {"amount_ml": 250, "beverage": "x" * 41}, {"amount_ml": "lots"}])
def test_hydration_validation(env, body):
    assert env.client.post("/v1/hydration", json={**body, "log_date": D}, headers=H()).status_code == 422
    assert env.client.post("/v1/hydration", json={"amount_ml": 250}, headers=H()).status_code == 422   # log_date required


def test_hydration_default_target_without_profile(env):
    assert env.client.get(f"/v1/hydration?date={D}", headers=H()).json()["target_ml"] == 2000


def test_hydration_delete_and_isolation(env):
    seed_user(env.db)
    mine = env.client.post("/v1/hydration", json={"amount_ml": 250, "log_date": D}, headers=H("user-1")).json()["log"]["id"]
    theirs = env.client.post("/v1/hydration", json={"amount_ml": 250, "log_date": D}, headers=H("user-2")).json()["log"]["id"]
    assert env.client.delete(f"/v1/hydration/{theirs}", headers=H("user-1")).status_code == 404
    assert len(env.db.tables["hydration_logs"]) == 2
    assert env.client.delete(f"/v1/hydration/{mine}", headers=H("user-1")).status_code == 200
    assert env.client.delete(f"/v1/hydration/{mine}", headers=H("user-1")).status_code == 404
    assert [x["user_id"] for x in env.db.tables["hydration_logs"]] == ["user-2"]
    assert env.client.get(f"/v1/hydration?date={D}", headers=H("user-1")).json()["logs"] == []
    assert env.client.delete("/v1/hydration/a,b", headers=H()).status_code in (404, 422)


def test_hydration_history_zero_filled(env):
    seed_user(env.db)
    for d, ml in (("2026-03-01", 3000), ("2026-03-03", 500)):
        env.client.post("/v1/hydration", json={"amount_ml": ml, "log_date": d}, headers=H())
    env.client.post("/v1/hydration", json={"amount_ml": 800, "log_date": "2026-03-03", "beverage": "soda"}, headers=H())
    h = env.client.get("/v1/hydration/history?days=5&end=2026-03-05", headers=H()).json()
    assert [d["date"] for d in h["days"]] == ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"]
    assert [d["total_ml"] for d in h["days"]] == [3000, 0, 500, 0, 0]          # soda excluded
    assert h["days"][2]["all_ml"] == 1300 and h["days_goal_met"] == 1
    assert env.client.get("/v1/hydration/history?days=0", headers=H()).status_code == 422
    assert env.client.get("/v1/hydration/history?days=91", headers=H()).status_code == 422


def test_hydration_target_bounds_and_survives_recompute(env):
    seed_user(env.db)
    assert env.client.put("/v1/hydration/target", json={"target_ml": 499}, headers=H()).status_code == 422
    assert env.client.put("/v1/hydration/target", json={"target_ml": 8001}, headers=H()).status_code == 422
    assert env.client.put("/v1/hydration/target", json={"target_ml": 3500}, headers=H()).json() == {"target_ml": 3500}
    env.client.post("/v1/weight", json={"weight_kg": 95, "log_date": D}, headers=H())     # triggers target recompute
    prof = env.db.tables["user_profiles"][0]
    assert prof["target_water_ml"] == 3500 and prof["target_kcal"] != 2400


def test_hydration_target_requires_profile(env):
    assert env.client.put("/v1/hydration/target", json={"target_ml": 2500}, headers=H()).status_code == 409


# ================================================================ weight
def test_weight_upsert_same_day_and_profile_sync(env):
    seed_user(env.db)
    a = env.client.post("/v1/weight", json={"weight_kg": 79.5, "log_date": D}, headers=H())
    assert a.status_code == 201 and a.json()["targets_updated"] is True
    env.client.post("/v1/weight", json={"weight_kg": 79.0, "log_date": D}, headers=H())
    rows = env.db.tables["weight_logs"]
    assert len(rows) == 1 and rows[0]["weight_kg"] == 79.0                          # one row per day
    prof = env.db.tables["user_profiles"][0]
    assert prof["weight_kg"] == 79.0 and prof["bmi"] is not None


def test_backdated_weight_does_not_change_current_profile(env):
    seed_user(env.db)
    env.client.post("/v1/weight", json={"weight_kg": 78, "log_date": "2026-03-10"}, headers=H())
    r = env.client.post("/v1/weight", json={"weight_kg": 85, "log_date": "2026-03-01"}, headers=H())
    assert r.json()["targets_updated"] is False
    assert env.db.tables["user_profiles"][0]["weight_kg"] == 78


def test_weight_without_profile_still_logs(env):
    r = env.client.post("/v1/weight", json={"weight_kg": 70, "log_date": D}, headers=H())
    assert r.status_code == 201 and r.json()["targets_updated"] is False and len(env.db.tables["weight_logs"]) == 1


@pytest.mark.parametrize("body", [{"weight_kg": 24.9}, {"weight_kg": 400.1}, {"weight_kg": "x"}, {"weight_kg": 70},
                                  {"log_date": D}])
def test_weight_validation(env, body):
    payload = {"weight_kg": 70, "log_date": D, **body} if "log_date" not in body or "weight_kg" in body else body
    if body == {"weight_kg": 70}:
        payload = {"weight_kg": 70}                                                 # missing log_date
    assert env.client.post("/v1/weight", json=payload, headers=H()).status_code == 422


def test_weight_list_trend_range_and_delete_isolation(env):
    seed_user(env.db)
    for d, w in (("2026-02-01", 82), ("2026-03-01", 80), ("2026-03-02", 79), ("2026-03-04", 78)):
        env.client.post("/v1/weight", json={"weight_kg": w, "log_date": d}, headers=H())
    env.client.post("/v1/weight", json={"weight_kg": 50, "log_date": "2026-03-02"}, headers=H("user-2"))
    r = env.client.get("/v1/weight?days=10&end=2026-03-05", headers=H()).json()
    assert [p["log_date"] for p in r["points"]] == ["2026-03-01", "2026-03-02", "2026-03-04"]     # in range, own only
    assert [t["avg_kg"] for t in r["trend_7d_avg"]] == [80.0, 79.5, 79.0]
    other = next(x["id"] for x in env.db.tables["weight_logs"] if x["user_id"] == "user-2")
    assert env.client.delete(f"/v1/weight/{other}", headers=H()).status_code == 404
    mine = r["points"][0]["id"]
    assert env.client.delete(f"/v1/weight/{mine}", headers=H()).status_code == 200
    assert env.client.get("/v1/weight?days=0", headers=H()).status_code == 422


# ================================================================ measurements
def test_measurements_partial_merge_per_day(env):
    assert env.client.post("/v1/measurements", json={"log_date": D, "waist_cm": 85}, headers=H()).status_code == 201
    env.client.post("/v1/measurements", json={"log_date": D, "chest_cm": 100}, headers=H())
    rows = env.db.tables["body_measurements"]
    assert len(rows) == 1 and rows[0]["waist_cm"] == 85 and rows[0]["chest_cm"] == 100     # second call didn't wipe waist
    env.client.post("/v1/measurements", json={"log_date": "2026-03-08", "waist_cm": 84}, headers=H())
    items = env.client.get("/v1/measurements?end=2026-03-31", headers=H()).json()["items"]
    assert [i["log_date"] for i in items] == ["2026-03-08", D]                              # newest first


@pytest.mark.parametrize("body", [{}, {"waist_cm": 5}, {"arm_cm": 500}, {"body_fat_pct": 1}, {"body_fat_pct": 80}])
def test_measurement_validation(env, body):
    assert env.client.post("/v1/measurements", json={"log_date": D, **body}, headers=H()).status_code == 422


def test_measurements_user_scoped(env):
    env.client.post("/v1/measurements", json={"log_date": D, "waist_cm": 80}, headers=H("user-2"))
    assert env.client.get("/v1/measurements?end=2026-12-31", headers=H("user-1")).json()["items"] == []


# ================================================================ summary
def test_summary_loss_goal(env):
    seed_user(env.db, profile={**PROFILE, "weight_kg": 80, "target_weight_kg": 70})
    for d, w in (("2026-01-10", 90), ("2026-02-20", 86), ("2026-03-01", 85)):
        env.client.post("/v1/weight", json={"weight_kg": w, "log_date": d}, headers=H())
    env.db.tables["body_measurements"] = [
        {"user_id": "user-1", "log_date": "2026-02-10", "waist_cm": 95}, {"user_id": "user-1", "log_date": "2026-03-01", "waist_cm": 92}]
    env.db.tables["progress_photos"] = [{"id": "p1", "user_id": "user-1"}, {"id": "p2", "user_id": "user-2"}]
    s = env.client.get("/v1/progress/summary?range=30&end=2026-03-01", headers=H()).json()
    assert s["current_weight"] == 85 and s["journey_start_weight"] == 90 and s["target_weight"] == 70
    assert s["goal_pct"] == 25.0                                  # 5 of 20 kg
    assert s["start_weight"] == 86 and s["change_kg"] == -1.0     # inside the 30-day window
    assert s["weekly_change_kg"] is not None and s["weekly_change_kg"] < 0
    assert s["measurements_delta"]["waist_cm"] == -3.0 and s["photos_count"] == 1
    assert s["bmi"] == pytest.approx(85 / 1.8 ** 2, abs=0.1)
    wide = env.client.get("/v1/progress/summary?range=90&end=2026-03-01", headers=H()).json()
    assert wide["start_weight"] == 90 and wide["change_kg"] == -5.0


def test_summary_gain_goal(env):
    seed_user(env.db, profile={**PROFILE, "weight_kg": 62, "target_weight_kg": 70})
    for d, w in (("2026-02-01", 60), ("2026-03-01", 65)):
        env.client.post("/v1/weight", json={"weight_kg": w, "log_date": d}, headers=H())
    assert env.client.get("/v1/progress/summary?end=2026-03-01", headers=H()).json()["goal_pct"] == 50.0


def test_summary_empty_and_single_point(env):
    seed_user(env.db)                                              # no weight logs yet
    s = env.client.get("/v1/progress/summary", headers=H()).json()
    assert s["current_weight"] == 80 and s["start_weight"] is None and s["change_kg"] is None
    assert s["weekly_change_kg"] is None and s["goal_pct"] == 0.0 and s["photos_count"] == 0
    env.client.post("/v1/weight", json={"weight_kg": 78, "log_date": D}, headers=H())
    one = env.client.get(f"/v1/progress/summary?end={D}", headers=H()).json()
    assert one["weekly_change_kg"] is None and one["change_kg"] == 0.0


def test_summary_without_profile_or_target(env):
    s = env.client.get("/v1/progress/summary", headers=H()).json()
    assert s["current_weight"] is None and s["goal_pct"] is None and s["bmi"] is None
    seed_user(env.db, profile={**PROFILE, "target_weight_kg": None})
    assert env.client.get("/v1/progress/summary", headers=H()).json()["goal_pct"] is None


def test_summary_rejects_unsupported_range(env):
    assert env.client.get("/v1/progress/summary?range=7", headers=H()).status_code == 422


# ================================================================ photos
def storage_handler(env, sign_ok=True):
    def h(req: httpx.Request):
        url = str(req.url)
        if "/storage/v1/object/sign/" in url:
            if not sign_ok:
                return httpx.Response(400, json={})
            return httpx.Response(200, json={"signedURL": "/object/sign/progress-photos/x?token=abc"})
        if req.method == "DELETE" and "/storage/v1/object/progress-photos" in url:
            return httpx.Response(200, json=[])
        return httpx.Response(500)
    env.handler = h


def test_photo_add_list_signed_urls_with_user_token(env):
    storage_handler(env)
    r = env.client.post("/v1/progress/photos", json={"image_path": "user-1/a1.jpg", "angle": "front", "taken_on": D}, headers=H())
    assert r.status_code == 201, r.text
    assert r.json()["photo"]["signed_url"] == "https://x.supabase.co/storage/v1/object/sign/progress-photos/x?token=abc"
    sign = env.calls("/object/sign/progress-photos/user-1/a1.jpg", "POST")[0]
    assert sign.headers["authorization"].startswith("Bearer ey") and sign.headers["apikey"] == "anon"   # user's JWT, not service role
    env.client.post("/v1/progress/photos", json={"image_path": "user-2/b.jpg", "taken_on": D}, headers=H("user-2"))
    photos = env.client.get("/v1/progress/photos", headers=H()).json()["photos"]
    assert [p["image_path"] for p in photos] == ["user-1/a1.jpg"] and photos[0]["signed_url"]


@pytest.mark.parametrize("path", ["user-2/a.jpg", "a.jpg", "user-1/../user-2/a.jpg", "user-1a/x.jpg", "user-1/a b.jpg",
                                  "/user-1/a.jpg", "user-1/" + "x" * 300])
def test_photo_path_must_be_own_folder(env, path):
    storage_handler(env)
    r = env.client.post("/v1/progress/photos", json={"image_path": path, "taken_on": D}, headers=H())
    assert r.status_code == 422 and env.db.tables.get("progress_photos", []) == []


def test_photo_validation_and_sign_failure_is_soft(env):
    storage_handler(env, sign_ok=False)
    assert env.client.post("/v1/progress/photos", json={"image_path": "user-1/a.jpg", "angle": "top", "taken_on": D},
                           headers=H()).status_code == 422
    r = env.client.post("/v1/progress/photos", json={"image_path": "user-1/a.jpg", "taken_on": D}, headers=H())
    assert r.status_code == 201 and r.json()["photo"]["signed_url"] is None


def test_photo_delete_removes_row_and_file_and_respects_owner(env):
    storage_handler(env)
    env.db.tables["progress_photos"] = [
        {"id": "p1", "user_id": "user-1", "image_path": "user-1/a.jpg"}, {"id": "p2", "user_id": "user-2", "image_path": "user-2/b.jpg"}]
    assert env.client.delete("/v1/progress/photos/p2", headers=H("user-1")).status_code == 404
    assert env.client.delete("/v1/progress/photos/p1", headers=H("user-1")).status_code == 200
    assert [p["id"] for p in env.db.tables["progress_photos"]] == ["p2"]
    assert env.calls("/storage/v1/object/progress-photos", "DELETE")
