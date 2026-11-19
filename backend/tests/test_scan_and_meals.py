import httpx
import pytest

from app.core.db import Rest
from app.services import scanner
from app.services.scanner import DetectedItem
from tests.conftest import make_catalog, override_vision

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 100


def D(name, g, conf=0.9, amb=False):
    return DetectedItem(name=name, estimated_grams=g, confidence=conf, ambiguous=amb)


# ---------- pure scanner logic ----------
def test_validate_image_checks_magic_bytes_not_just_header():
    assert scanner.validate_image(JPEG, "image/jpeg", 8) == "image/jpeg"
    for data, ct in [(b"<?php evil ?>", "image/jpeg"), (JPEG, "image/gif"), (b"", "image/jpeg"),
                     (JPEG, None), (b"RIFF1234XXXX", "image/webp")]:
        with pytest.raises(ValueError):
            scanner.validate_image(data, ct, 8)
    with pytest.raises(ValueError):
        scanner.validate_image(JPEG + b"0" * (2 * 1024 * 1024), "image/jpeg", 1)


def test_parse_items_handles_fences_and_drops_bad_entries():
    txt = '```json\n{"items":[{"name":"rice","estimated_grams":150,"confidence":0.9},' \
          '{"name":"x","estimated_grams":-5,"confidence":0.9},{"name":"y","estimated_grams":9999,"confidence":2}]}\n```'
    items = scanner.parse_items(txt)
    assert [i.name for i in items] == ["rice"]
    assert scanner.parse_items('{"items":[]}') == []
    with pytest.raises(ValueError):
        scanner.parse_items("sorry I can't")


def test_matching_maps_common_names():
    cat = make_catalog()
    assert scanner.best_match("cooked rice", cat)[0]["name"] == "Cooked white rice"
    assert scanner.best_match("dal", cat)[0]["name"].startswith("Dal")
    assert scanner.best_match("curd", cat)[0]["name"].startswith("Curd")
    assert scanner.best_match("spaceship", cat)[0] is None


def test_resolve_scales_from_database_not_from_model():
    res = scanner.resolve([D("cooked rice", 150)], make_catalog(), set())[0]
    assert res["nutrition"]["kcal"] == pytest.approx(195.0)  # 130 kcal/100g * 1.5, from DB
    assert res["is_estimate"] is True


def test_resolve_flags_unmatched_ambiguous_low_confidence_and_allergens():
    res = scanner.resolve([D("mystery blob", 100), D("curd", 100, conf=0.4), D("curd", 100, amb=True),
                           D("paneer", 100)], make_catalog(), {"milk"})
    assert res[0]["nutrition"] is None and res[0]["needs_confirmation"]
    assert res[1]["needs_confirmation"] and res[2]["needs_confirmation"]
    assert res[3]["allergen_warnings"] == ["milk"]


# ---------- /v1/scan ----------
def post_scan(client, headers, data=JPEG, ctype="image/jpeg"):
    return client.post("/v1/scan", headers=headers, files={"image": ("meal.jpg", data, ctype)})


def test_scan_happy_path_plate_of_rice_dal_curd(client, headers, db):
    v = override_vision([D("cooked rice", 150), D("dal", 100), D("curd", 100)])
    r = post_scan(client, headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert [i["name"] for i in body["items"]] == ["Cooked white rice", "Dal (toor, cooked with tadka)",
                                                  "Curd / dahi (whole milk)"]
    assert body["items"][0]["nutrition"]["kcal"] == 195.0
    assert body["items"][2]["allergen_warnings"] == ["milk"]
    assert "Estimates" in body["disclaimer"]
    assert v.calls == 1 and "food_scans" in db.inserted


def test_scan_requires_auth(client):
    assert client.post("/v1/scan", files={"image": ("a.jpg", JPEG, "image/jpeg")}).status_code == 401


def test_scan_blocked_without_ai_consent(client, headers, db):
    override_vision([])
    db.tables["users"] = [{"ai_consent_at": None}]
    assert post_scan(client, headers).status_code == 403


def test_scan_blocked_on_free_plan(client, headers, db):
    v = override_vision([D("cooked rice", 100)])
    db.tables["plan_entitlements"] = []
    assert post_scan(client, headers).status_code == 402
    assert v.calls == 0  # no AI cost incurred


def test_scan_rejects_bad_files_before_calling_ai(client, headers):
    v = override_vision([])
    assert post_scan(client, headers, b"not an image", "image/jpeg").status_code == 422
    assert post_scan(client, headers, JPEG, "application/pdf").status_code == 422
    assert v.calls == 0


def test_scan_no_food_returns_empty_not_fake_data(client, headers):
    override_vision([])
    r = post_scan(client, headers)
    assert r.json()["items"] == [] and r.json()["empty"] is True


# ---------- /v1/meals + dashboard ----------
def food_id(db, name):
    return next(f["id"] for f in db.catalog if f["name"].startswith(name))


def test_log_meal_computes_server_side_and_dashboard_reflects_it(client, headers, db):
    body = {"meal_type": "lunch", "log_date": "2026-03-01", "is_estimate": True, "items": [
        {"food_id": food_id(db, "Cooked white rice"), "quantity_g": 150},
        {"food_id": food_id(db, "Dal"), "quantity_g": 100, "user_edited": True}]}
    r = client.post("/v1/meals", json=body, headers=headers)
    assert r.status_code == 201, r.text
    assert r.json()["total"]["kcal"] == pytest.approx(311.0)
    assert db.inserted["meal_logs"][0]["user_id"] == "user-1"  # from token, not body
    # simulate the persisted rows being read back by the dashboard
    db.tables["meal_logs"] = [{"id": "m1", "meal_type": "lunch", "meal_items": db.inserted["meal_items"]}]
    d = client.get("/v1/dashboard?date=2026-03-01&hour=16", headers=headers).json()
    assert d["consumed"]["kcal"] == pytest.approx(311.0)
    assert d["remaining_kcal"] == pytest.approx(1689.0)
    assert any("protein" in m for m in d["insights"])


@pytest.mark.parametrize("patch", [{"meal_type": "brunch"}, {"items": []},
                                   {"items": [{"food_id": "food-0", "quantity_g": 0}]},
                                   {"items": [{"food_id": "nope", "quantity_g": 10}]},
                                   {"photo_path": "someone-else/x.jpg"}])
def test_log_meal_validation(client, headers, db, patch):
    body = {"meal_type": "lunch", "log_date": "2026-03-01", "items": [{"food_id": "food-0", "quantity_g": 50}], **patch}
    assert client.post("/v1/meals", json=body, headers=headers).status_code == 422


def test_dashboard_requires_onboarding(client, headers, db):
    db.tables["user_profiles"] = []
    assert client.get("/v1/dashboard?date=2026-03-01", headers=headers).status_code == 409


# ---------- search + RLS forwarding ----------
def test_search_sanitises_filter_metacharacters(client, headers, db):
    assert client.get("/v1/foods/search?q=%2A%2C%29%28", headers=headers).json() == {"items": []}
    assert client.get("/v1/foods/search?q=a", headers=headers).status_code == 422


@pytest.mark.asyncio
async def test_rest_forwards_user_jwt_so_rls_applies():
    seen = {}

    def handler(req: httpx.Request):
        seen.update(req.headers)
        return httpx.Response(200, json=[{"ok": 1}])

    rest = Rest("https://x.supabase.co", "anon-key", "USER-JWT", httpx.MockTransport(handler))
    assert await rest.select("weight_logs") == [{"ok": 1}]
    assert seen["authorization"] == "Bearer USER-JWT" and seen["apikey"] == "anon-key"
