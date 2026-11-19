import time
from datetime import timedelta

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.main import app
from app.routers.coach import get_llm, get_optional_llm
from app.services import coach as cs
from app.services import coach_safety, report as rp
from app.services.ai_data import utc_today
from tests.memdb import MemDb

SECRET = "test-secret-test-secret-test-secret-123"
TODAY = utc_today()


class FakeLLM:
    def __init__(self, reply="Aim for a protein-rich dinner such as dal and curd.", fail=False):
        self.reply, self.fail, self.calls = reply, fail, []

    async def complete(self, system, messages):
        self.calls.append((system, messages))
        if self.fail:
            raise RuntimeError("upstream down")
        return self.reply


def seed(tier="pro", consent=True, features=("ai_assistant", "weekly_ai_report")):
    return MemDb({
        "subscriptions": [{"user_id": "user-1", "tier": tier, "status": "active"}],
        "plan_entitlements": [{"tier": t, "feature": f} for t in ("pro", "premium") for f in features] if tier != "free" else [],
        "users": [{"id": "user-1", "email": "secret@example.com", "full_name": "Secret Name",
                   "ai_consent_at": "2026-01-01T00:00:00Z" if consent else None}],
        "user_profiles": [{"user_id": "user-1", "date_of_birth": "1990-04-01", "gender": "male", "height_cm": 180, "weight_kg": 80,
                           "target_kcal": 2000, "target_protein_g": 120, "target_carbs_g": 230, "target_fat_g": 60, "target_fiber_g": 30,
                           "target_water_ml": 2500, "training_days": 4, "injuries": ["knee"], "equipment": []}],
        "fitness_goals": [{"user_id": "user-1", "goal": "muscle_gain", "is_primary": True}],
        "dietary_preferences": [{"user_id": "user-1", "diet_type": "vegetarian", "allergies": ["peanuts"]}],
    })


@pytest.fixture
def env():
    db = seed()
    llm = FakeLLM()
    saved = dict(app.dependency_overrides)  # restore afterwards; other modules install overrides at import time
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_jwt_secret=SECRET)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_llm] = lambda: llm
    app.dependency_overrides[get_optional_llm] = lambda: llm
    yield db, llm, TestClient(app)
    app.dependency_overrides.clear()
    app.dependency_overrides.update(saved)


def hdr(sub="user-1"):
    t = jwt.encode({"sub": sub, "aud": "authenticated", "exp": int(time.time()) + 600}, SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {t}"}


def chat(client, message, **kw):
    return client.post("/v1/coach/chat", json={"message": message, **kw}, headers=hdr())


# ---------- safety pre-filter (pure) ----------
@pytest.mark.parametrize("msg,cat", [
    ("I have chest pain when I run", "emergency"),
    ("i feel like i might faint after workouts", "emergency"),
    ("I want to kill myself", "self_harm"),
    ("I think I have bulimia, how do I lose weight faster", "eating_disorder"),
    ("Can I eat 500 calories a day?", "extreme_restriction"),
    ("plan a 800 kcal diet for me", "extreme_restriction"),
    ("how long can I do a water fast for 5 days", "extreme_restriction"),
    ("I'm pregnant, what should I eat?", "medical_context"),
    ("I'm on metformin, can I diet?", "medical_context"),
])
def test_safety_flags_red_flags(msg, cat):
    assert coach_safety.check(msg).category == cat


@pytest.mark.parametrize("msg", [
    "How many calories should I eat today?", "Suggest a high-protein vegetarian breakfast",
    "What workout should I do today?", "Am I meeting my weekly fitness goal?", "I ate 1800 calories yesterday",
    "Suggest alternatives to chicken", "Create a weekly diet plan",
])
def test_safety_ignores_ordinary_questions(msg):
    assert coach_safety.check(msg) is None


# ---------- /v1/coach/chat ----------
def test_red_flag_message_bypasses_llm_gating_and_storage(env):
    db, llm, client = env
    app.dependency_overrides[get_db] = lambda: seed(tier="free", consent=False)  # free plan, no consent
    r = chat(client, "I have chest pain")
    assert r.status_code == 200 and r.json()["safety"] == "emergency" and "medical help" in r.json()["reply"]
    assert llm.calls == []


def test_chat_happy_path_uses_real_user_data_without_pii(env):
    db, llm, client = env
    db.tables["meal_logs"] = [{"id": "m1", "user_id": "user-1", "log_date": TODAY.isoformat(), "meal_type": "lunch",
                               "meal_items": [{"name": "Cooked white rice", "kcal": 195, "protein_g": 4.1, "carbs_g": 42, "fat_g": 0.5}]}]
    r = chat(client, "What should I eat for dinner?")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reply"] == llm.reply and body["conversation_id"] and body["safety"] is None and body["suggestions"]
    system, turns = llm.calls[0]
    assert "Cooked white rice" in system and '"kcal_remaining": 1805' in system and "vegetarian" in system and "knee" in system
    for pii in ("secret@example.com", "Secret Name", "1990-04-01"):
        assert pii not in system
    assert "not a doctor" in system and "Never invent" in system
    assert turns == [{"role": "user", "content": "What should I eat for dinner?"}]
    assert [m["role"] for m in db.tables["ai_messages"]] == ["user", "assistant"]
    assert db.tables["ai_conversations"][0]["user_id"] == "user-1"


def test_second_turn_includes_history(env):
    db, llm, client = env
    cid = chat(client, "Hi coach").json()["conversation_id"]
    chat(client, "And lunch?", conversation_id=cid)
    _, turns = llm.calls[1]
    assert [t["role"] for t in turns] == ["user", "assistant", "user"] and turns[-1]["content"] == "And lunch?"
    assert len(db.tables["ai_conversations"]) == 1


def test_chat_is_gated_by_plan_and_consent(env):
    db, llm, client = env
    app.dependency_overrides[get_db] = lambda: seed(tier="free")
    assert chat(client, "What should I eat?").status_code == 402
    app.dependency_overrides[get_db] = lambda: seed(consent=False)
    assert chat(client, "What should I eat?").status_code == 403
    assert llm.calls == []


@pytest.mark.parametrize("payload", [{"message": ""}, {"message": "x" * 2001}, {"message": "hi", "conversation_id": "../etc"}])
def test_chat_validation(env, payload):
    _, _, client = env
    assert client.post("/v1/coach/chat", json=payload, headers=hdr()).status_code == 422


def test_chat_requires_auth(env):
    _, _, client = env
    assert client.post("/v1/coach/chat", json={"message": "hi"}).status_code == 401


def test_chat_llm_failure_is_clean_and_stores_nothing(env):
    db, llm, client = env
    llm.fail = True
    r = chat(client, "What should I eat?")
    assert r.status_code == 502 and "upstream" not in r.text
    assert db.tables.get("ai_messages", []) == []


def test_cannot_continue_someone_elses_conversation(env):
    db, _, client = env
    db.tables["ai_conversations"] = [{"id": "c-other", "user_id": "user-2", "title": "x"}]
    assert chat(client, "hi", conversation_id="c-other").status_code == 404
    assert client.get("/v1/coach/conversations/c-other", headers=hdr()).status_code == 404
    assert client.delete("/v1/coach/conversations/c-other", headers=hdr()).status_code == 404
    assert db.tables["ai_conversations"]  # untouched


def test_conversation_list_get_delete(env):
    db, _, client = env
    cid = chat(client, "What should I eat for dinner tonight?").json()["conversation_id"]
    lst = client.get("/v1/coach/conversations", headers=hdr()).json()["conversations"]
    assert [c["id"] for c in lst] == [cid]
    msgs = client.get(f"/v1/coach/conversations/{cid}", headers=hdr()).json()["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    assert client.delete(f"/v1/coach/conversations/{cid}", headers=hdr()).json() == {"deleted": True}
    assert db.tables["ai_messages"] == [] and db.tables["ai_conversations"] == []


def test_trim_history_starts_with_user_and_caps_length():
    msgs = [{"role": "assistant" if i % 2 == 0 else "user", "content": str(i)} for i in range(50)]
    out = cs.trim_history(msgs)
    assert out[0]["role"] == "user" and len(out) <= cs.MAX_HISTORY


# ---------- weekly report ----------
def day(n):
    return (TODAY - timedelta(days=n)).isoformat()


def test_report_stats_are_computed_not_generated():
    meals = [{"log_date": day(1), "meal_items": [{"kcal": 2000, "protein_g": 130, "carbs_g": 200, "fat_g": 60}]},
             {"log_date": day(2), "meal_items": [{"kcal": 1000, "protein_g": 30, "carbs_g": 100, "fat_g": 30}]}]
    s = rp.compute_week_stats(end=TODAY, targets={"kcal": 2000, "protein_g": 120, "water_ml": 2500}, meals=meals,
                              hydration=[{"log_date": day(1), "amount_ml": 2400, "counts_toward_goal": True},
                                         {"log_date": day(1), "amount_ml": 500, "counts_toward_goal": False}],
                              weights=[{"log_date": day(6), "weight_kg": 80.0}, {"log_date": day(0), "weight_kg": 79.4}],
                              sessions=[{"log_date": day(1), "finished_at": "x"}, {"log_date": day(2), "finished_at": None}],
                              planned_workouts=4, goal="fat_loss")
    assert s["nutrition"]["days_logged"] == 2 and s["nutrition"]["avg_kcal"] == 1500 and s["nutrition"]["days_on_target"] == 1
    assert s["weight"]["change_kg"] == -0.6 and s["workouts"] == {"completed": 1, "planned": 4, "completion_pct": 25}
    assert s["hydration"]["days_goal_met"] == 1  # the 500 ml non-water drink is excluded
    recs = " ".join(rp.recommendations(s))
    assert "1 of 4 planned workouts" in recs and "Protein averaged 80 g" in recs


def test_report_endpoint_template_when_no_ai_consent_even_if_llm_exists(env):
    db, llm, client = env
    app.dependency_overrides[get_db] = lambda: seed(consent=False)
    r = client.get("/v1/reports/weekly", headers=hdr())
    assert r.status_code == 200 and r.json()["used_llm"] is False and llm.calls == []
    assert "No meals were logged" in r.json()["summary"] and r.json()["recommendations"]


def test_report_endpoint_uses_llm_to_phrase_computed_stats(env):
    db, llm, client = env
    llm.reply = "Great week, keep going!"
    db.tables["meal_logs"] = [{"id": "m1", "user_id": "user-1", "log_date": day(1), "meal_items": [
        {"kcal": 1950, "protein_g": 118, "carbs_g": 220, "fat_g": 60}]}]
    r = client.get("/v1/reports/weekly", headers=hdr()).json()
    assert r["used_llm"] is True and r["summary"] == "Great week, keep going!"
    assert r["stats"]["nutrition"]["avg_kcal"] == 1950 and "1950" in llm.calls[0][1][0]["content"]


def test_report_falls_back_to_template_when_llm_fails(env):
    _, llm, client = env
    llm.fail = True
    r = client.get("/v1/reports/weekly", headers=hdr()).json()
    assert r["used_llm"] is False and r["summary"]


def test_report_gating_and_validation(env):
    _, _, client = env
    app.dependency_overrides[get_db] = lambda: seed(tier="free")
    assert client.get("/v1/reports/weekly", headers=hdr()).status_code == 402
    db = seed(); db.tables["user_profiles"][0]["target_kcal"] = None
    app.dependency_overrides[get_db] = lambda: db
    assert client.get("/v1/reports/weekly", headers=hdr()).status_code == 409
    app.dependency_overrides[get_db] = lambda: seed()
    assert client.get(f"/v1/reports/weekly?end={(TODAY + timedelta(days=30)).isoformat()}", headers=hdr()).status_code == 422
    assert client.get("/v1/reports/weekly").status_code == 401
