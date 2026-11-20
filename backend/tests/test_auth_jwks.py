import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app.core import auth
from app.core.config import Settings, get_settings
from app.main import app


class FakeJwks:
    def __init__(self, public_key):
        self.public_key = public_key

    def get_signing_key_from_jwt(self, token):
        return type("K", (), {"key": self.public_key})()


@pytest.fixture
def client():
    old = app.dependency_overrides.copy()
    app.dependency_overrides.clear()
    yield TestClient(app)
    app.dependency_overrides.clear()
    app.dependency_overrides.update(old)


def _token(priv, **over):
    claims = {"sub": "user-es", "aud": "authenticated", "exp": int(time.time()) + 600, "email": "a@b.co", **over}
    return jwt.encode(claims, priv, algorithm="ES256", headers={"kid": "k1"})


def test_es256_token_verified_via_jwks(client, monkeypatch):
    priv = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(auth, "_jwks_client", lambda url: FakeJwks(priv.public_key()))
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_url="https://x.supabase.co")
    r = client.get("/v1/me", headers={"Authorization": f"Bearer {_token(priv)}"})
    assert r.status_code != 401


def test_es256_token_signed_by_other_key_rejected(client, monkeypatch):
    good, evil = ec.generate_private_key(ec.SECP256R1()), ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(auth, "_jwks_client", lambda url: FakeJwks(good.public_key()))
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_url="https://x.supabase.co")
    assert client.get("/v1/me", headers={"Authorization": f"Bearer {_token(evil)}"}).status_code == 401
    assert client.get("/v1/me", headers={"Authorization": f"Bearer {_token(good, exp=int(time.time()) - 5)}"}).status_code == 401


def test_hs256_with_empty_secret_is_never_accepted(client):
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_url="https://x.supabase.co", supabase_jwt_secret="")
    forged = jwt.encode({"sub": "attacker", "aud": "authenticated", "exp": int(time.time()) + 600}, "", algorithm="HS256")
    assert client.get("/v1/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
