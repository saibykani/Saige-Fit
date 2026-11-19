import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.main import app
from tests.memdb import MemDb

SECRET = "test-secret-test-secret-test-secret-123"


@pytest.fixture
def setup():
    db = MemDb({"exercises": [{"id": "ex-1", "name": "Squat"}], "user_favorites": []})
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_jwt_secret=SECRET)
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app), db
    app.dependency_overrides.clear()


def hdr():
    import time

    import jwt
    t = jwt.encode({"sub": "u1", "aud": "authenticated", "exp": int(time.time()) + 600}, SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {t}"}


def test_favorite_roundtrip_is_idempotent(setup):
    c, db = setup
    assert c.post("/v1/favorites/exercises/ex-1", headers=hdr()).status_code == 201
    assert c.post("/v1/favorites/exercises/ex-1", headers=hdr()).status_code == 201
    assert len(db.tables["user_favorites"]) == 1
    assert db.tables["user_favorites"][0]["user_id"] == "u1"
    assert c.get("/v1/favorites/exercises", headers=hdr()).json() == {"ids": ["ex-1"]}
    assert c.delete("/v1/favorites/exercises/ex-1", headers=hdr()).json()["favorite"] is False
    assert db.tables["user_favorites"] == []


def test_unknown_exercise_and_bad_ids_rejected(setup):
    c, _ = setup
    assert c.post("/v1/favorites/exercises/nope", headers=hdr()).status_code == 404
    assert c.post("/v1/favorites/exercises/a,b)or(x", headers=hdr()).status_code in (404, 422)


def test_requires_auth(setup):
    c, _ = setup
    assert c.post("/v1/favorites/exercises/ex-1").status_code == 401
