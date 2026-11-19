"""Shared helpers for the test_core_* suites (not a test module itself)."""
from __future__ import annotations

import time

import httpx
import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.main import app
from app.services.account import get_transport
from tests.memdb import MemDb, _match

SECRET = "test-secret-test-secret-test-secret-123"
RESERVED = {"select", "order", "limit", "offset", "on_conflict"}


class Db(MemDb):
    """MemDb + repeated filters (list values, e.g. gte/lte on one column) and `not.` negation."""

    def _filter(self, table, params):
        rows = self.tables.setdefault(table, [])

        def ok(r):
            for k, v in params.items():
                if k in RESERVED:
                    continue
                for cond in v if isinstance(v, list) else [v]:
                    if cond.startswith("not."):
                        if _match(r, k, cond[4:]):
                            return False
                    elif not _match(r, k, cond):
                        return False
            return True

        return [r for r in rows if ok(r)]


def token(uid="user-1", **over):
    claims = {"sub": uid, "aud": "authenticated", "exp": int(time.time()) + 600, "email": f"{uid}@example.com", **over}
    return jwt.encode(claims, SECRET, algorithm="HS256")


def H(uid="user-1"):
    return {"Authorization": f"Bearer {token(uid)}"}


class Env:
    def __init__(self):
        self.db = Db()
        self.settings = dict(supabase_jwt_secret=SECRET, supabase_url="https://x.supabase.co", supabase_anon_key="anon",
                             supabase_service_role_key="svc", usda_api_key="usda-key", environment="development")
        self.requests: list[httpx.Request] = []
        self.handler = lambda req: httpx.Response(500)
        self.client = TestClient(app)

    def _transport_handler(self, req: httpx.Request):
        self.requests.append(req)
        return self.handler(req)

    def calls(self, substr: str, method: str | None = None):
        return [r for r in self.requests if substr in str(r.url) and (method is None or r.method == method)]


@pytest.fixture
def env():
    e = Env()
    app.dependency_overrides[get_settings] = lambda: Settings(**e.settings)
    app.dependency_overrides[get_db] = lambda: e.db
    app.dependency_overrides[get_transport] = lambda: httpx.MockTransport(e._transport_handler)
    yield e
    app.dependency_overrides.clear()


UUIDS = [f"00000000-0000-4000-8000-{i:012d}" for i in range(1, 60)]

PROFILE = dict(date_of_birth="1995-05-01", gender="male", height_cm=180, weight_kg=80, target_weight_kg=75,
               activity_level="moderately_active", training_days=4, target_kcal=2400, target_protein_g=150,
               target_carbs_g=280, target_fat_g=70, target_fiber_g=34, target_water_ml=2800, water_target_custom=False)


def seed_user(db: Db, uid="user-1", profile: dict | None = PROFILE, goal="fat_loss"):
    db.tables.setdefault("users", []).append({"id": uid, "email": f"{uid}@example.com", "full_name": None,
                                              "avatar_path": None, "privacy_consent_at": None, "ai_consent_at": None})
    if profile is not None:
        db.tables.setdefault("user_profiles", []).append({"user_id": uid, **profile})
        db.tables.setdefault("fitness_goals", []).append({"id": f"g-{uid}", "user_id": uid, "goal": goal, "is_primary": True})
