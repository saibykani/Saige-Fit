import json

import httpx
import pytest

from tests.test_core_support import H, UUIDS, env, seed_user  # noqa: F401


# ================================================================ notifications
def test_defaults_created_on_first_get_and_stable_after(env):
    r = env.client.get("/v1/notifications/settings", headers=H()).json()["items"]
    assert [i["kind"] for i in r] == ["breakfast", "lunch", "dinner", "hydration", "workout", "daily_summary", "weekly_report", "weigh_in"]
    b = next(i for i in r if i["kind"] == "breakfast")
    assert b == {"kind": "breakfast", "enabled": True, "time_local": "08:00", "weekdays": [1, 2, 3, 4, 5, 6, 7], "timezone": "UTC"}
    assert next(i for i in r if i["kind"] == "weekly_report")["weekdays"] == [7]
    assert len(env.db.tables["notifications"]) == 8
    env.client.get("/v1/notifications/settings", headers=H())
    assert len(env.db.tables["notifications"]) == 8                   # no duplicates


def test_update_settings_and_per_user_scoping(env):
    body = {"items": [{"kind": "breakfast", "enabled": True, "time_local": "07:15", "weekdays": [5, 1, 1], "timezone": "Asia/Kolkata"},
                      {"kind": "hydration", "enabled": False}]}
    r = env.client.put("/v1/notifications/settings", json=body, headers=H())
    assert r.status_code == 200, r.text
    items = {i["kind"]: i for i in r.json()["items"]}
    assert items["breakfast"]["time_local"] == "07:15" and items["breakfast"]["weekdays"] == [1, 5]
    assert items["breakfast"]["timezone"] == "Asia/Kolkata" and items["hydration"]["enabled"] is False
    assert items["lunch"]["enabled"] is True and len(items) == 8       # untouched kinds keep defaults
    other = {i["kind"]: i for i in env.client.get("/v1/notifications/settings", headers=H("user-2")).json()["items"]}
    assert other["breakfast"]["time_local"] == "08:00"                 # user-2 unaffected


@pytest.mark.parametrize("items", [
    [], [{"kind": "breakfast", "enabled": True}],                                         # enabled needs a time
    [{"kind": "nope", "enabled": False}], [{"kind": "lunch", "enabled": True, "time_local": "24:00"}],
    [{"kind": "lunch", "enabled": True, "time_local": "12:00", "weekdays": []}],
    [{"kind": "lunch", "enabled": True, "time_local": "12:00", "weekdays": [8]}],
    [{"kind": "lunch", "enabled": True, "time_local": "12:00", "timezone": "bad tz!"}],
    [{"kind": "lunch", "enabled": False}, {"kind": "lunch", "enabled": True, "time_local": "12:00"}],   # duplicate kind
])
def test_update_settings_validation(env, items):
    assert env.client.put("/v1/notifications/settings", json={"items": items}, headers=H()).status_code == 422


def test_push_token(env):
    seed_user(env.db, profile=None)
    ok = env.client.post("/v1/devices/push-token", json={"token": "ExponentPushToken[abcdefghijklmnop]"}, headers=H())
    assert ok.status_code == 200 and env.db.tables["users"][0]["expo_push_token"] == "ExponentPushToken[abcdefghijklmnop]"
    for bad in ("short", "x" * 30, "ExponentPushToken[]", "ExponentPushToken[<script>alert(1)</script>]"):
        assert env.client.post("/v1/devices/push-token", json={"token": bad}, headers=H()).status_code == 422
    assert env.client.post("/v1/devices/push-token", json={"token": "ExponentPushToken[abcdefghijklmnop]"},
                           headers=H("ghost")).status_code == 409          # no account row


# ================================================================ subscription
ENT = [{"tier": "free", "feature": "manual_food_log"}, {"tier": "pro", "feature": "ai_food_scan"},
       {"tier": "pro", "feature": "ai_assistant"}, {"tier": "premium", "feature": "weekly_ai_report"},
       {"tier": "premium", "feature": "ai_food_scan"}]


def test_subscription_defaults_to_free_with_plan_catalog_no_prices(env):
    env.db.tables["plan_entitlements"] = list(ENT)
    d = env.client.get("/v1/subscription", headers=H()).json()
    assert d["tier"] == "free" and d["entitlements"] == ["manual_food_log"]
    assert [p["tier"] for p in d["plans"]] == ["free", "pro", "premium"]
    assert d["plans"][1]["features"] == ["ai_assistant", "ai_food_scan"]
    assert "price" not in json.dumps(d).lower()


def test_subscription_active_expired_and_inactive(env):
    env.db.tables["plan_entitlements"] = list(ENT)
    env.db.tables["subscriptions"] = [{"user_id": "user-1", "tier": "pro", "status": "active", "created_at": "2026-01-01",
                                       "current_period_end": "2999-01-01T00:00:00Z"}]
    assert env.client.get("/v1/subscription", headers=H()).json()["tier"] == "pro"
    env.db.tables["subscriptions"][0]["current_period_end"] = "2020-01-01T00:00:00Z"
    d = env.client.get("/v1/subscription", headers=H()).json()
    assert d["tier"] == "free" and d["entitlements"] == ["manual_food_log"]                 # lapsed -> free
    env.db.tables["subscriptions"][0].update(current_period_end=None, status="canceled")
    assert env.client.get("/v1/subscription", headers=H()).json()["tier"] == "free"
    env.db.tables["subscriptions"] = [{"user_id": "user-2", "tier": "premium", "status": "active", "created_at": "2026-01-01"}]
    assert env.client.get("/v1/subscription", headers=H("user-1")).json()["tier"] == "free"   # other user's plan ignored


def test_subscription_uses_latest_row(env):
    env.db.tables["plan_entitlements"] = list(ENT)
    env.db.tables["subscriptions"] = [
        {"user_id": "user-1", "tier": "free", "status": "active", "created_at": "2026-01-01"},
        {"user_id": "user-1", "tier": "premium", "status": "trialing", "created_at": "2026-02-01"}]
    assert env.client.get("/v1/subscription", headers=H()).json()["tier"] == "premium"


def test_verify_is_501_until_billing_configured(env):
    r = env.client.post("/v1/subscription/verify", json={"provider": "google", "receipt": "tok"}, headers=H())
    assert r.status_code == 501
    assert env.client.post("/v1/subscription/verify", json={"provider": "paypal", "receipt": "tok"}, headers=H()).status_code == 422


def tier_handler(env, existing):
    def h(req: httpx.Request):
        if "/rest/v1/subscriptions" in str(req.url):
            if req.method == "GET":
                return httpx.Response(200, json=existing)
            return httpx.Response(200, json=[{}])
        return httpx.Response(500)
    env.handler = h


def test_dev_tier_disabled_by_default_and_in_production(env):
    tier_handler(env, [])
    assert env.client.post("/v1/subscription/dev-tier", json={"tier": "pro"}, headers=H()).status_code == 404
    env.settings.update(allow_dev_tier_switch=True, environment="production")                # flag can't override production
    assert env.client.post("/v1/subscription/dev-tier", json={"tier": "pro"}, headers=H()).status_code == 404
    assert env.requests == []


def test_dev_tier_enabled_uses_service_role_insert_or_update(env):
    env.settings.update(allow_dev_tier_switch=True)
    tier_handler(env, [])
    assert env.client.post("/v1/subscription/dev-tier", json={"tier": "pro"}, headers=H()).status_code == 200
    post = env.calls("/rest/v1/subscriptions", "POST")[0]
    assert post.headers["authorization"] == "Bearer svc"
    assert json.loads(post.content) == {"user_id": "user-1", "tier": "pro", "status": "active", "provider": "manual", "current_period_end": None}
    tier_handler(env, [{"id": "s1"}])
    env.client.post("/v1/subscription/dev-tier", json={"tier": "premium"}, headers=H())
    patch = env.calls("/rest/v1/subscriptions", "PATCH")[0]
    assert "user_id=eq.user-1" in str(patch.url)                                              # scoped to the caller only
    assert env.client.post("/v1/subscription/dev-tier", json={"tier": "gold"}, headers=H()).status_code == 422


def test_dev_tier_needs_service_key(env):
    env.settings.update(allow_dev_tier_switch=True, supabase_service_role_key="")
    assert env.client.post("/v1/subscription/dev-tier", json={"tier": "pro"}, headers=H()).status_code == 503


# ================================================================ account
def test_export_contains_only_own_data(env):
    seed_user(env.db, "user-1")
    seed_user(env.db, "user-2")
    env.db.tables["weight_logs"] = [{"id": "w1", "user_id": "user-1", "weight_kg": 80}, {"id": "w2", "user_id": "user-2", "weight_kg": 55}]
    env.db.tables["meal_logs"] = [{"id": "m1", "user_id": "user-1", "meal_items": [{"kcal": 100}]}]
    env.db.tables["food_items"] = [{"id": UUIDS[1], "name": "Mine", "owner_id": "user-1"}, {"id": UUIDS[2], "name": "Theirs", "owner_id": "user-2"},
                                   {"id": UUIDS[3], "name": "Shared", "owner_id": None}]
    env.db.tables["ai_conversations"] = [{"id": "c1", "user_id": "user-2"}]
    r = env.client.get("/v1/account/export", headers=H("user-1"))
    assert r.status_code == 200
    d = r.json()
    assert d["user_id"] == "user-1" and d["exported_at"] and d["user"]["id"] == "user-1"
    assert [w["id"] for w in d["weight_logs"]] == ["w1"] and d["meal_logs"][0]["meal_items"] == [{"kcal": 100}]
    assert [f["name"] for f in d["custom_foods"]] == ["Mine"] and d["ai_conversations"] == []
    for key in ("user_profiles", "dietary_preferences", "hydration_logs", "progress_photos", "workout_sessions", "daily_activity"):
        assert key in d
    assert "user-2" not in json.dumps({k: v for k, v in d.items() if k not in ("user_id",)})


def delete_handler(env, files=("a.jpg", "b.jpg"), storage_ok=True, auth_status=200):
    state = {"listed": {}}

    def h(req: httpx.Request):
        url = str(req.url)
        if "/storage/v1/object/list/" in url:
            bucket = url.rsplit("/", 1)[-1]
            if not storage_ok:
                return httpx.Response(500, json={})
            first = bucket not in state["listed"]
            state["listed"][bucket] = True
            return httpx.Response(200, json=[{"name": n} for n in files] if (first and bucket == "food-photos") else [])
        if req.method == "DELETE" and "/storage/v1/object/" in url:
            return httpx.Response(200, json=[])
        if req.method == "DELETE" and "/auth/v1/admin/users/" in url:
            return httpx.Response(auth_status, json={})
        return httpx.Response(500)
    env.handler = h


def test_delete_account_requires_exact_confirmation(env):
    delete_handler(env)
    for body in ({}, {"confirm": "delete"}, {"confirm": "yes"}, {"confirm": ""}):
        assert env.client.request("DELETE", "/v1/account", json=body, headers=H()).status_code == 422
    assert env.requests == []                                         # nothing touched


def test_delete_account_purges_files_then_auth_user(env):
    delete_handler(env)
    r = env.client.request("DELETE", "/v1/account", json={"confirm": "DELETE"}, headers=H("user-1"))
    assert r.status_code == 200 and r.json() == {"deleted": True}
    order = [(q.method, str(q.url)) for q in env.requests]
    removed = [q for q in env.requests if q.method == "DELETE" and "/storage/v1/object/food-photos" in str(q.url)][0]
    assert json.loads(removed.content) == {"prefixes": ["user-1/a.jpg", "user-1/b.jpg"]}
    assert all(q.headers["authorization"] == "Bearer svc" for q in env.requests)
    assert order[-1] == ("DELETE", "https://x.supabase.co/auth/v1/admin/users/user-1")          # auth user last
    assert [m for m, u in order if "/auth/v1/" in u] == ["DELETE"]


def test_delete_account_aborts_if_files_cannot_be_removed(env):
    delete_handler(env, storage_ok=False)
    r = env.client.request("DELETE", "/v1/account", json={"confirm": "DELETE"}, headers=H())
    assert r.status_code == 502
    assert env.calls("/auth/v1/admin/users") == []                    # user can retry; nothing half-deleted


def test_delete_account_upstream_auth_failure_and_unconfigured(env):
    delete_handler(env, files=(), auth_status=500)
    assert env.client.request("DELETE", "/v1/account", json={"confirm": "DELETE"}, headers=H()).status_code == 502
    env.settings["supabase_service_role_key"] = ""
    assert env.client.request("DELETE", "/v1/account", json={"confirm": "DELETE"}, headers=H()).status_code == 503


def test_delete_account_only_targets_the_caller(env):
    delete_handler(env, files=())
    env.client.request("DELETE", "/v1/account", json={"confirm": "DELETE", "user_id": "user-2"}, headers=H("user-1"))
    assert any(str(q.url).endswith("/auth/v1/admin/users/user-1") for q in env.requests)
    assert not any("user-2" in str(q.url) for q in env.requests)
