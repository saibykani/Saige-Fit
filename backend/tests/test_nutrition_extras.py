from app.services import nutrition_insights as ni
from tests.test_core_support import H, env, seed_user  # noqa: F401
from tests.test_next_meal import seed_catalog

T = {"kcal": 2000.0, "protein_g": 150.0, "carbs_g": 200.0, "fat_g": 60.0, "fiber_g": 30.0}


def item(food_id="f1", qty=100, kcal=200, p=20, c=10, f=5, fib=3, name="Dal"):
    return {"food_id": food_id, "name": name, "quantity_g": qty, "kcal": kcal, "protein_g": p, "carbs_g": c, "fat_g": f,
            "fiber_g": fib}


def meal(mid, day, mtype, items, uid="user-1"):
    return {"id": mid, "user_id": uid, "log_date": day, "meal_type": mtype, "meal_items": items}


# ---------- service ----------
def test_score_perfect_and_empty():
    full = ni.score_day(T, T, 2800, 2800, True)
    assert full["score"] == 100 and all(s["score"] == 100 for s in full["subscores"])
    empty = ni.score_day({k: 0 for k in T}, T, 0, 2000, False)
    assert empty["score"] is None and all(s["score"] is None for s in empty["subscores"])
    assert ni.grade(None) == "No data"


def test_score_penalises_gaps_and_insights_name_protein():
    c = {**T, "protein_g": 100.0}
    s = ni.score_day(c, T, 2000, 2000, True)
    assert 0 < s["score"] < 100 and {x["key"]: x["score"] for x in s["subscores"]}["protein"] == 67
    tips = ni.insights(c, T, 2000, 2000, "vegetarian")
    assert tips[0]["title"] == "Protein is 50 g short" and "paneer" in tips[0]["body"] and len(tips) <= 4
    assert ni.insights(T, T, 2000, 2000)[0]["key"] == "ok"


def test_calorie_under_hidden_before_evening():
    c = {**T, "kcal": 600.0}
    assert all(i["key"] != "calories" for i in ni.insights(c, T, 2000, 2000, hour=12))
    assert any(i["key"] == "calories" for i in ni.insights(c, T, 2000, 2000, hour=21))


# ---------- /v1/nutrition/insights ----------
def test_insights_endpoint(env):
    seed_user(env.db)
    env.db.tables["meal_logs"] = [meal("m1", "2026-03-02", "lunch", [item(kcal=1200, p=60, c=150, f=40, fib=10)]),
                                  meal("m2", "2026-02-28", "lunch", [item(kcal=2400, p=150, c=280, f=70, fib=34)]),
                                  meal("x", "2026-03-02", "lunch", [item(kcal=9999)], uid="user-2")]
    env.db.tables["hydration_logs"] = [{"user_id": "user-1", "log_date": "2026-03-02", "amount_ml": 1400, "counts_toward_goal": True}]
    r = env.client.get("/v1/nutrition/insights?date=2026-03-02", headers=H())
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["logged"] and 0 <= j["score"] <= 100 and len(j["subscores"]) == 5 and 1 <= len(j["insights"]) <= 4
    assert j["consumed"]["kcal"] == 1200 and j["water_ml"] == 1400  # other user's 9999 kcal excluded
    assert len(j["trend"]) == 7 and j["trend"][-1]["date"] == "2026-03-02"
    by = {t["date"]: t["score"] for t in j["trend"]}
    assert by["2026-02-28"] is not None  # scored day
    assert by["2026-03-01"] is None and j["trend_avg"] is not None


def test_insights_empty_day_and_auth(env):
    seed_user(env.db)
    j = env.client.get("/v1/nutrition/insights?date=2026-03-02", headers=H()).json()
    assert j["logged"] is False and j["score"] is None and j["trend_avg"] is None and j["insights"][0]["key"] == "empty"
    assert env.client.get("/v1/nutrition/insights?date=2026-03-02", headers=H("ghost")).status_code == 409
    assert env.client.get("/v1/nutrition/insights?date=2026-03-02").status_code in (401, 403)
    assert env.client.get("/v1/nutrition/insights", headers=H()).status_code == 422


# ---------- /v1/meals/frequent ----------
def test_frequent(env):
    seed_user(env.db)
    env.db.tables["meal_logs"] = [
        meal("a", "2026-03-01", "breakfast", [item("f1", 100), item("f2", 50, name="Roti")]),
        meal("b", "2026-03-02", "breakfast", [item("f1", 100), item("f2", 50, name="Roti")]),
        meal("c", "2026-03-02", "snack", [item("f1", 200, kcal=400, p=40, c=20, f=10)]),
        meal("o", "2026-03-02", "snack", [item("f9", 10)], uid="user-2")]
    j = env.client.get("/v1/meals/frequent?today=2026-03-03", headers=H()).json()
    assert [f["food_id"] for f in j["foods"]] == ["f1", "f2"] and j["foods"][0]["times"] == 3
    assert j["foods"][0]["default_quantity_g"] == 100 and j["foods"][0]["kcal"] == 200
    assert len(j["meals"]) == 1 and j["meals"][0]["times"] == 2 and j["meals"][0]["name"] == "Dal + Roti"
    assert env.client.get("/v1/meals/frequent?today=2026-03-03&limit=1", headers=H()).json()["foods"][0]["food_id"] == "f1"


def test_frequent_empty_and_auth(env):
    seed_user(env.db)
    assert env.client.get("/v1/meals/frequent", headers=H()).json() == {"foods": [], "meals": []}
    assert env.client.get("/v1/meals/frequent").status_code in (401, 403)


# ---------- /v1/meals/copy ----------
def test_copy_meals(env):
    seed_user(env.db)
    env.db.tables["meal_logs"] = [meal("a", "2026-03-01", "breakfast", [item()]), meal("b", "2026-03-01", "lunch", [item("f2")]),
                                  meal("t", "2026-03-02", "lunch", [item()]), meal("o", "2026-03-01", "dinner", [item()], uid="user-2")]
    r = env.client.post("/v1/meals/copy", json={"from_date": "2026-03-01", "to_date": "2026-03-02"}, headers=H())
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["copied"] == 1 and j["skipped_meal_types"] == ["lunch"] and j["kcal"] == 200
    new = [m for m in env.db.tables["meal_logs"] if m["id"] == j["meal_ids"][0]][0]
    assert new["user_id"] == "user-1" and new["meal_type"] == "breakfast" and new["log_date"] == "2026-03-02"
    assert [i for i in env.db.tables["meal_items"] if i["meal_id"] == new["id"]][0]["name"] == "Dal"


def test_copy_filter_empty_and_validation(env):
    seed_user(env.db)
    env.db.tables["meal_logs"] = [meal("a", "2026-03-01", "breakfast", [item()]), meal("b", "2026-03-01", "dinner", [item()])]
    r = env.client.post("/v1/meals/copy", json={"from_date": "2026-03-01", "to_date": "2026-03-02", "meal_types": ["dinner"]}, headers=H())
    assert r.json()["copied"] == 1
    empty = env.client.post("/v1/meals/copy", json={"from_date": "2026-01-01", "to_date": "2026-03-05"}, headers=H())
    assert empty.status_code == 200 and empty.json()["copied"] == 0
    assert env.client.post("/v1/meals/copy", json={"from_date": "2026-03-01", "to_date": "2026-03-01"}, headers=H()).status_code == 422
    assert env.client.post("/v1/meals/copy", json={"from_date": "2026-03-01", "to_date": "2026-03-02", "meal_types": ["brunch"]},
                           headers=H()).status_code == 422
    assert env.client.post("/v1/meals/copy", json={"from_date": "2026-03-01", "to_date": "2026-03-02"}).status_code in (401, 403)


def test_copy_cannot_read_other_users_meals(env):
    seed_user(env.db)
    env.db.tables["meal_logs"] = [meal("o", "2026-03-01", "dinner", [item()], uid="user-2")]
    j = env.client.post("/v1/meals/copy", json={"from_date": "2026-03-01", "to_date": "2026-03-02"}, headers=H()).json()
    assert j["copied"] == 0 and not any(m["user_id"] == "user-1" for m in env.db.tables["meal_logs"])


# ---------- /v1/meals/log-suggestion ----------
def test_log_suggestion_food_and_recipe(env):
    seed_user(env.db)
    seed_catalog(env.db)
    fid = env.db.tables["food_items"][0]["id"]
    r = env.client.post("/v1/meals/log-suggestion", json={"kind": "food", "id": fid, "meal_type": "lunch", "log_date": "2026-03-02"}, headers=H())
    assert r.status_code == 201, r.text
    assert r.json()["items"][0]["food_id"] == fid and r.json()["total"]["kcal"] > 0
    rec = env.db.tables["recipes"][0]
    r = env.client.post("/v1/meals/log-suggestion", json={"kind": "recipe", "id": rec["id"], "meal_type": "dinner", "log_date": "2026-03-02"}, headers=H())
    assert r.status_code == 201, r.text
    assert len(r.json()["items"]) >= 1
    assert {m["user_id"] for m in env.db.tables["meal_logs"]} == {"user-1"}


def test_log_suggestion_errors(env):
    seed_user(env.db)
    seed_catalog(env.db)
    body = {"kind": "food", "id": "nope", "meal_type": "lunch", "log_date": "2026-03-02"}
    assert env.client.post("/v1/meals/log-suggestion", json=body, headers=H()).status_code == 404
    assert env.client.post("/v1/meals/log-suggestion", json={**body, "kind": "recipe"}, headers=H()).status_code == 404
    assert env.client.post("/v1/meals/log-suggestion", json={**body, "kind": "x"}, headers=H()).status_code == 422
    assert env.client.post("/v1/meals/log-suggestion", json={**body, "id": "a b"}, headers=H()).status_code == 422
    assert env.client.post("/v1/meals/log-suggestion", json=body).status_code in (401, 403)
