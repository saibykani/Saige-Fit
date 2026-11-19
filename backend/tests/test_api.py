import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app

SECRET = "test-secret-test-secret-test-secret-123"
client = TestClient(app)


@pytest.fixture(autouse=True)
def _settings_override():
    # per-test (other fixtures clear dependency_overrides on teardown)
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_jwt_secret=SECRET)
    yield
    app.dependency_overrides.pop(get_settings, None)

BODY = {
    "date_of_birth": "1995-05-01", "gender": "male", "weight_kg": 80, "height_cm": 180,
    "activity_level": "moderately_active", "goal": "muscle_gain", "training_days": 4,
}


def token(**over):
    claims = {"sub": "user-1", "aud": "authenticated", "exp": int(time.time()) + 600, **over}
    return jwt.encode(claims, SECRET, algorithm="HS256")


def auth(t=None):
    return {"Authorization": f"Bearer {t or token()}"}


def test_health():
    assert client.get("/healthz").json()["status"] == "ok"


def test_targets_requires_auth():
    assert client.post("/v1/profile/targets", json=BODY).status_code == 401


def test_rejects_expired_and_forged_tokens():
    assert client.post("/v1/profile/targets", json=BODY,
                       headers=auth(token(exp=int(time.time()) - 5))).status_code == 401
    forged = jwt.encode({"sub": "x", "aud": "authenticated", "exp": int(time.time()) + 99},
                        "wrong-secret-wrong-secret-wrong-secret", algorithm="HS256")
    assert client.post("/v1/profile/targets", json=BODY, headers=auth(forged)).status_code == 401


def test_targets_happy_path():
    r = client.post("/v1/profile/targets", json=BODY, headers=auth())
    assert r.status_code == 200
    d = r.json()
    assert d["target_kcal"] > d["tdee_kcal"]
    assert "disclaimer" in d


@pytest.mark.parametrize("patch", [{"weight_kg": 5}, {"height_cm": 400}, {"goal": "bogus"},
                                   {"date_of_birth": "2020-01-01"}])
def test_targets_validation(patch):
    r = client.post("/v1/profile/targets", json={**BODY, **patch}, headers=auth())
    assert r.status_code == 422
