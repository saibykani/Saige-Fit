import httpx
import pytest

from app.services import openfoodfacts as off
from app.services import usda
from tests.test_core_support import H, UUIDS, env, seed_user  # noqa: F401

CODE = "5449000000996"
GOOD = {"status": 1, "code": CODE, "product": {
    "code": CODE, "product_name": "Cola Zero Snack Bar", "brands": "Acme, Other", "serving_quantity": "40", "serving_size": "40 g",
    "allergens_tags": ["en:milk", "en:tree-nuts"], "ingredients_analysis_tags": ["en:vegetarian"],
    "nutriments": {"energy-kcal_100g": 400, "proteins_100g": 20, "carbohydrates_100g": 40, "fat_100g": 18,
                   "saturated-fat_100g": 5, "fiber_100g": 6, "sugars_100g": 12, "salt_100g": 0.5}}}


# ---------------------------------------------------------------- pure parsers
def test_parse_product_normalises_units_and_tags():
    p = off.parse_product(GOOD)
    assert p["name"] == "Cola Zero Snack Bar" and p["brand"] == "Acme" and p["default_serving_g"] == 40.0
    assert p["nutrition"]["sodium_mg"] == 200.0                      # salt 0.5 g -> 200 mg sodium
    assert p["allergens"] == ["milk", "tree_nuts"]
    assert "vegetarian" in p["diet_tags"] and "vegan" not in p["diet_tags"]


def test_parse_product_converts_kj_and_defaults_unknown_diet():
    prod = {**GOOD["product"], "nutriments": {"energy_100g": 1674, "proteins_100g": 20, "carbohydrates_100g": 40, "fat_100g": 18},
            "ingredients_analysis_tags": []}
    p = off.parse_product({"status": 1, "product": prod})
    assert p["nutrition"]["kcal"] == pytest.approx(400.0, abs=0.2)
    assert p["diet_tags"] == ["non_vegetarian"]                       # unknown never claims veg-compatibility


def test_parse_product_vegan_tags_everyone():
    prod = {**GOOD["product"], "ingredients_analysis_tags": ["en:vegan", "en:vegetarian"]}
    assert set(off.parse_product({"status": 1, "product": prod})["diet_tags"]) == set(off.ALL_DIETS)


def test_parse_product_rejects_implausible_and_incomplete():
    bad_energy = {**GOOD["product"], "nutriments": {"energy-kcal_100g": 950, "proteins_100g": 1, "carbohydrates_100g": 1, "fat_100g": 1}}
    with pytest.raises(off.ProductUnreliable):
        off.parse_product({"status": 1, "product": bad_energy})
    with pytest.raises(off.ProductUnreliable):
        off.parse_product({"status": 1, "product": {**GOOD["product"], "nutriments": {"proteins_100g": 3}}})
    with pytest.raises(off.ProductUnreliable):
        off.parse_product({"status": 1, "product": {**GOOD["product"], "product_name": " "}})
    assert off.parse_product({"status": 0}) is None and off.parse_product("junk") is None


def test_usda_parse_handles_both_shapes_and_atwater_fallback():
    search = {"fdcId": 1, "description": "RICE, WHITE", "dataType": "SR Legacy", "foodNutrients": [
        {"nutrientNumber": "208", "value": 130}, {"nutrientNumber": "203", "value": 2.7},
        {"nutrientNumber": "205", "value": 28}, {"nutrientNumber": "204", "value": 0.3}]}
    detail = {"fdcId": 2, "description": "Banana", "foodNutrients": [
        {"nutrient": {"number": "957"}, "amount": 92}, {"nutrient": {"number": "203"}, "amount": 1.1},
        {"nutrient": {"number": "205"}, "amount": 23}, {"nutrient": {"number": "204"}, "amount": 0.3}]}
    assert usda.parse_food(search)["name"] == "Rice, White"
    assert usda.parse_food(detail)["nutrition"]["kcal"] == 92
    assert usda.parse_food({**search, "foodNutrients": [{"nutrientNumber": "203", "value": 3}]}) is None   # no energy
    assert usda.parse_food({**search, "foodNutrients": [{"nutrientNumber": "208", "value": 800},
                                                         {"nutrientNumber": "203", "value": 1}]}) is None  # implausible


# ---------------------------------------------------------------- barcode endpoint
def off_handler(env, payload=GOOD, status=200):
    def h(req: httpx.Request):
        url = str(req.url)
        if "openfoodfacts" in url:
            return httpx.Response(status, json=payload)
        if "/rest/v1/food_items" in url and req.method == "POST":
            import json
            body = json.loads(req.content)
            return httpx.Response(201, json=[{"id": UUIDS[1], **body}])
        if "/rest/v1/food_nutrition" in url and req.method == "POST":
            return httpx.Response(201, json=[{}])
        return httpx.Response(500)
    env.handler = h


def test_barcode_found_in_catalog_skips_upstream(env):
    seed_user(env.db)
    env.db.tables["food_items"] = [{"id": UUIDS[5], "name": "Local Bar", "barcode": CODE,
                                    "food_nutrition": [{"kcal": 100, "protein_g": 5, "carbs_g": 10, "fat_g": 4}]}]
    r = env.client.get(f"/v1/foods/barcode/{CODE}", headers=H())
    assert r.status_code == 200 and r.json()["food"]["name"] == "Local Bar" and r.json()["source"] == "catalog"
    assert r.json()["food"]["nutrition"]["kcal"] == 100
    assert env.requests == []


def test_barcode_fetches_off_and_caches_as_shared_via_service_role(env):
    off_handler(env)
    r = env.client.get(f"/v1/foods/barcode/{CODE}", headers=H())
    assert r.status_code == 200, r.text
    f = r.json()["food"]
    assert f["name"] == "Cola Zero Snack Bar" and f["nutrition"]["kcal"] == 400 and r.json()["source"] == "open_food_facts"
    import json
    posts = env.calls("/rest/v1/food_items", "POST")
    assert len(posts) == 1
    assert posts[0].headers["authorization"] == "Bearer svc"          # service role, shared catalog only
    body = json.loads(posts[0].content)
    assert "owner_id" not in body and body["source"] == "open_food_facts" and body["barcode"] == CODE
    assert env.calls("/rest/v1/food_nutrition", "POST")


def test_barcode_without_service_role_keeps_private_copy(env):
    env.settings["supabase_service_role_key"] = ""
    seed_user(env.db)
    off_handler(env)
    r = env.client.get(f"/v1/foods/barcode/{CODE}", headers=H())
    assert r.status_code == 200
    saved = env.db.tables["food_items"][0]
    assert saved["owner_id"] == "user-1" and saved["barcode"] == CODE
    assert env.db.tables["food_nutrition"][0]["kcal"] == 400
    assert env.calls("/rest/v1/") == []                               # never used HTTP/service role


@pytest.mark.parametrize("code", ["abc", "123", "1" * 15, "12345678a"])
def test_barcode_rejects_malformed(env, code):
    assert env.client.get(f"/v1/foods/barcode/{code}", headers=H()).status_code == 422


def test_barcode_unknown_product_404(env):
    off_handler(env, payload={"status": 0, "status_verbose": "product not found"})
    assert env.client.get(f"/v1/foods/barcode/{CODE}", headers=H()).status_code == 404


def test_barcode_unreliable_product_rejected_not_stored(env):
    bad = {"status": 1, "product": {**GOOD["product"], "nutriments": {"energy-kcal_100g": 950, "proteins_100g": 1,
                                                                    "carbohydrates_100g": 1, "fat_100g": 1}}}
    off_handler(env, payload=bad)
    r = env.client.get(f"/v1/foods/barcode/{CODE}", headers=H())
    assert r.status_code == 422 and "unreliable" in r.json()["detail"]
    assert env.calls("/rest/v1/food_items", "POST") == []


def test_barcode_upstream_down_502(env):
    off_handler(env, status=503)
    assert env.client.get(f"/v1/foods/barcode/{CODE}", headers=H()).status_code == 502
    env.handler = lambda req: (_ for _ in ()).throw(httpx.ConnectError("boom"))
    assert env.client.get(f"/v1/foods/barcode/{CODE}", headers=H()).status_code == 502


# ---------------------------------------------------------------- custom foods
BODY = {"name": "Homemade granola", "kcal": 450, "protein_g": 10, "carbs_g": 60, "fat_g": 18, "fiber_g": 7,
        "default_serving_g": 40, "serving_label": "1 bowl", "diet_type": "vegan"}


def test_create_custom_food(env):
    r = env.client.post("/v1/foods", json=BODY, headers=H())
    assert r.status_code == 201, r.text
    f = r.json()["food"]
    assert f["name"] == "Homemade granola" and f["is_custom"] and f["nutrition"]["kcal"] == 450
    row = env.db.tables["food_items"][0]
    assert row["owner_id"] == "user-1" and row["source"] == "user" and "vegan" in row["diet_tags"]
    assert env.db.tables["food_nutrition"][0]["protein_g"] == 10


def test_custom_food_diet_type_controls_tags(env):
    env.client.post("/v1/foods", json={**BODY, "diet_type": "non_vegetarian"}, headers=H())
    assert env.db.tables["food_items"][0]["diet_tags"] == ["non_vegetarian"]


@pytest.mark.parametrize("patch", [
    {"kcal": 1000}, {"kcal": -1}, {"name": ""}, {"protein_g": 101}, {"default_serving_g": 0}, {"diet_type": "x"},
    {"kcal": 50},                       # macros imply ~450 kcal -> inconsistent
    {"protein_g": 60, "carbs_g": 60},   # >100 g of macros per 100 g
])
def test_custom_food_validation(env, patch):
    r = env.client.post("/v1/foods", json={**BODY, **patch}, headers=H())
    assert r.status_code == 422
    assert env.db.tables.get("food_items", []) == []


# ---------------------------------------------------------------- recent + favourites
def seed_foods(env):
    env.db.tables["food_items"] = [
        {"id": UUIDS[i], "name": n, "food_nutrition": [{"kcal": 100, "protein_g": 5, "carbs_g": 10, "fat_g": 4}]}
        for i, n in ((1, "Rice"), (2, "Dal"), (3, "Curd"))]


def test_recent_foods_distinct_most_recent_first_and_user_scoped(env):
    seed_foods(env)
    env.db.tables["meal_logs"] = [
        {"id": "m1", "user_id": "user-1", "eaten_at": "2026-03-01T08:00:00Z", "meal_items": [{"food_id": UUIDS[1], "quantity_g": 100}]},
        {"id": "m2", "user_id": "user-1", "eaten_at": "2026-03-02T08:00:00Z",
         "meal_items": [{"food_id": UUIDS[2], "quantity_g": 150}, {"food_id": UUIDS[1], "quantity_g": 200}]},
        {"id": "m3", "user_id": "user-2", "eaten_at": "2026-03-03T08:00:00Z", "meal_items": [{"food_id": UUIDS[3], "quantity_g": 50}]},
    ]
    items = env.client.get("/v1/foods/recent", headers=H()).json()["items"]
    assert [i["name"] for i in items] == ["Dal", "Rice"] or [i["name"] for i in items] == ["Rice", "Dal"]
    by = {i["name"]: i for i in items}
    assert by["Rice"]["last_quantity_g"] == 200 and by["Dal"]["last_quantity_g"] == 150   # latest meal wins
    assert "Curd" not in by                                                               # other user's log excluded


def test_recent_foods_empty(env):
    assert env.client.get("/v1/foods/recent", headers=H()).json() == {"items": []}


def test_favorites_add_list_remove_and_idempotent(env):
    seed_foods(env)
    assert env.client.post("/v1/favorites/foods", json={"food_id": UUIDS[1]}, headers=H()).status_code == 201
    assert env.client.post("/v1/favorites/foods", json={"food_id": UUIDS[1]}, headers=H()).status_code == 201
    assert len(env.db.tables["user_favorites"]) == 1
    items = env.client.get("/v1/favorites/foods", headers=H()).json()["items"]
    assert [i["name"] for i in items] == ["Rice"] and items[0]["nutrition"]["kcal"] == 100
    assert env.client.delete(f"/v1/favorites/foods/{UUIDS[1]}", headers=H()).json()["favorite"] is False
    assert env.client.get("/v1/favorites/foods", headers=H()).json()["items"] == []


def test_favorites_validation_and_isolation(env):
    seed_foods(env)
    assert env.client.post("/v1/favorites/foods", json={"food_id": UUIDS[30]}, headers=H()).status_code == 404
    assert env.client.post("/v1/favorites/foods", json={"food_id": "a,b)"}, headers=H()).status_code == 422
    env.client.post("/v1/favorites/foods", json={"food_id": UUIDS[2]}, headers=H("user-2"))
    assert env.client.get("/v1/favorites/foods", headers=H("user-1")).json()["items"] == []
    env.client.delete(f"/v1/favorites/foods/{UUIDS[2]}", headers=H("user-1"))       # cannot remove user-2's favourite
    assert len(env.db.tables["user_favorites"]) == 1


# ---------------------------------------------------------------- USDA
USDA_SEARCH = {"foods": [
    {"fdcId": 11, "description": "BANANA, RAW", "dataType": "SR Legacy", "foodNutrients": [
        {"nutrientNumber": "208", "value": 89}, {"nutrientNumber": "203", "value": 1.1},
        {"nutrientNumber": "205", "value": 23}, {"nutrientNumber": "204", "value": 0.3}]},
    {"fdcId": 12, "description": "Broken", "foodNutrients": [{"nutrientNumber": "208", "value": 900}]}]}
USDA_DETAIL = {"fdcId": 11, "description": "Banana, raw", "dataType": "SR Legacy", "foodNutrients": [
    {"nutrient": {"number": "208"}, "amount": 89}, {"nutrient": {"number": "203"}, "amount": 1.1},
    {"nutrient": {"number": "205"}, "amount": 23}, {"nutrient": {"number": "204"}, "amount": 0.3}]}


def test_usda_search_maps_and_filters_and_hides_key_from_client(env):
    env.handler = lambda req: httpx.Response(200, json=USDA_SEARCH)
    r = env.client.get("/v1/foods/usda?q=banana", headers=H())
    assert r.status_code == 200
    items = r.json()["items"]
    assert [i["fdc_id"] for i in items] == [11] and items[0]["name"] == "Banana, Raw"
    assert "usda-key" not in r.text
    assert "api_key=usda-key" in str(env.requests[0].url)              # key only used server-side


def test_usda_search_not_configured_and_upstream_failure(env):
    env.settings["usda_api_key"] = ""
    assert env.client.get("/v1/foods/usda?q=banana", headers=H()).status_code == 503
    env.settings["usda_api_key"] = "k"
    env.handler = lambda req: httpx.Response(500)
    assert env.client.get("/v1/foods/usda?q=banana", headers=H()).status_code == 502
    assert env.client.get("/v1/foods/usda?q=a", headers=H()).status_code == 422


def test_usda_import_creates_shared_food(env):
    import json

    def h(req):
        url = str(req.url)
        if "nal.usda.gov" in url:
            return httpx.Response(200, json=USDA_DETAIL)
        if "/rest/v1/food_items" in url:
            return httpx.Response(201, json=[{"id": UUIDS[7], **json.loads(req.content)}])
        return httpx.Response(201, json=[{}])
    env.handler = h
    r = env.client.post("/v1/foods/usda/import", json={"fdc_id": 11, "diet_type": "vegan"}, headers=H())
    assert r.status_code == 201, r.text
    assert r.json()["food"]["name"] == "Banana, raw" and r.json()["food"]["nutrition"]["kcal"] == 89
    body = json.loads(env.calls("/rest/v1/food_items", "POST")[0].content)
    assert body["source"] == "usda" and body["source_ref"] == "11" and "owner_id" not in body and "vegan" in body["diet_tags"]


def test_usda_import_existing_is_not_refetched(env):
    env.db.tables["food_items"] = [{"id": UUIDS[8], "name": "Banana", "source": "usda", "source_ref": "11",
                                    "food_nutrition": [{"kcal": 89, "protein_g": 1.1, "carbs_g": 23, "fat_g": 0.3}]}]
    r = env.client.post("/v1/foods/usda/import", json={"fdc_id": 11}, headers=H())
    assert r.status_code == 201 and r.json()["food"]["id"] == UUIDS[8] and env.requests == []


def test_usda_import_errors(env):
    env.handler = lambda req: httpx.Response(404)
    assert env.client.post("/v1/foods/usda/import", json={"fdc_id": 99}, headers=H()).status_code == 404
    env.handler = lambda req: httpx.Response(200, json={"fdcId": 5, "description": "Bad", "foodNutrients": []})
    assert env.client.post("/v1/foods/usda/import", json={"fdc_id": 5}, headers=H()).status_code == 422
    assert env.client.post("/v1/foods/usda/import", json={"fdc_id": -1}, headers=H()).status_code == 422
