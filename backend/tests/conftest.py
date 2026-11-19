import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.data.curated_foods import DIET_TAGS, FOODS
from app.main import app
from app.routers.scan import get_vision

SECRET = "test-secret-test-secret-test-secret-123"


def make_catalog():
    cat = []
    for i, (name, cuisine, diet, allergens, kcal, p, c, f, sat, fib, sug, na, serv, label, unit) in enumerate(FOODS):
        cat.append({"id": f"food-{i}", "name": name, "allergens": allergens, "diet_tags": DIET_TAGS[diet],
                    "food_nutrition": [{"kcal": kcal, "protein_g": p, "carbs_g": c, "fat_g": f, "sat_fat_g": sat,
                                        "fiber_g": fib, "sugar_g": sug, "sodium_mg": na}]})
    return cat


class FakeDb:
    def __init__(self):
        self.catalog = make_catalog()
        self.tables = {
            "subscriptions": [{"tier": "pro", "status": "active"}],
            "plan_entitlements": [{"feature": "ai_food_scan"}],
            "users": [{"ai_consent_at": "2026-01-01T00:00:00Z"}],
            "dietary_preferences": [{"allergens": ["milk"]}],
            "user_profiles": [{"target_kcal": 2000, "target_protein_g": 120, "target_carbs_g": 230,
                               "target_fat_g": 60, "target_fiber_g": 30, "target_water_ml": 2500}],
            "meal_logs": [], "hydration_logs": [],
        }
        self.inserted = {}

    async def select(self, table, **params):
        if table == "food_items":
            ids = params.get("id")
            if ids:
                wanted = ids[4:-1].split(",")
                return [f for f in self.catalog if f["id"] in wanted]
            return self.catalog
        return self.tables.get(table, [])

    async def insert(self, table, rows):
        rows = rows if isinstance(rows, list) else [rows]
        out = [{**r, "id": f"{table}-{len(self.inserted.get(table, [])) + k}"} for k, r in enumerate(rows)]
        self.inserted.setdefault(table, []).extend(out)
        return out


class FakeVision:
    def __init__(self, items):
        self.items = items
        self.calls = 0

    async def identify(self, image, media_type):
        self.calls += 1
        return self.items


@pytest.fixture
def db():
    return FakeDb()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_jwt_secret=SECRET)
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def headers():
    t = jwt.encode({"sub": "user-1", "aud": "authenticated", "exp": int(time.time()) + 600}, SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {t}"}


def override_vision(items):
    v = FakeVision(items)
    app.dependency_overrides[get_vision] = lambda: v
    return v
