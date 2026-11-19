"""Every endpoint added by BACKEND-CORE must reject unauthenticated calls."""
import pytest

from tests.test_core_support import env  # noqa: F401

D = "2026-03-01"
ENDPOINTS = [
    ("GET", "/v1/me", None),
    ("POST", "/v1/onboarding", {}),
    ("PUT", "/v1/profile", {"weight_kg": 80}),
    ("POST", "/v1/consent", {"ai": True}),
    ("GET", "/v1/account/export", None),
    ("DELETE", "/v1/account", {"confirm": "DELETE"}),
    ("GET", "/v1/foods/barcode/5449000000996", None),
    ("POST", "/v1/foods", {}),
    ("GET", "/v1/foods/recent", None),
    ("GET", "/v1/foods/usda?q=rice", None),
    ("POST", "/v1/foods/usda/import", {"fdc_id": 1}),
    ("GET", "/v1/favorites/foods", None),
    ("POST", "/v1/favorites/foods", {"food_id": "a"}),
    ("DELETE", "/v1/favorites/foods/a", None),
    ("GET", f"/v1/meals?date={D}", None),
    ("DELETE", "/v1/meals/a", None),
    ("PATCH", "/v1/meals/a/items/b", {"quantity_g": 10}),
    ("POST", "/v1/activity", {"date": D, "steps": 1}),
    ("GET", f"/v1/hydration?date={D}", None),
    ("POST", "/v1/hydration", {"amount_ml": 250, "log_date": D}),
    ("DELETE", "/v1/hydration/a", None),
    ("GET", "/v1/hydration/history", None),
    ("PUT", "/v1/hydration/target", {"target_ml": 2000}),
    ("POST", "/v1/weight", {"weight_kg": 80, "log_date": D}),
    ("GET", "/v1/weight", None),
    ("DELETE", "/v1/weight/a", None),
    ("POST", "/v1/measurements", {"log_date": D, "waist_cm": 80}),
    ("GET", "/v1/measurements", None),
    ("GET", "/v1/progress/summary", None),
    ("POST", "/v1/progress/photos", {"image_path": "u/a.jpg", "taken_on": D}),
    ("GET", "/v1/progress/photos", None),
    ("DELETE", "/v1/progress/photos/a", None),
    ("GET", f"/v1/analytics/daily?date={D}", None),
    ("GET", f"/v1/analytics/weekly?end={D}", None),
    ("GET", "/v1/analytics/monthly?month=2026-03", None),
    ("GET", "/v1/notifications/settings", None),
    ("PUT", "/v1/notifications/settings", {"items": []}),
    ("POST", "/v1/devices/push-token", {"token": "ExponentPushToken[abcdefghij]"}),
    ("GET", "/v1/subscription", None),
    ("POST", "/v1/subscription/verify", {"provider": "google", "receipt": "x"}),
    ("POST", "/v1/subscription/dev-tier", {"tier": "pro"}),
]


@pytest.mark.parametrize("method,path,body", ENDPOINTS)
def test_requires_auth(env, method, path, body):
    r = env.client.request(method, path, json=body)
    assert r.status_code == 401, (method, path, r.text)


@pytest.mark.parametrize("method,path,body", ENDPOINTS)
def test_rejects_forged_token(env, method, path, body):
    r = env.client.request(method, path, json=body, headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401
