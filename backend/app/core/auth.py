"""Verifies Supabase-issued JWTs. The user id always comes from the verified token,
never from request bodies or query strings."""
from dataclasses import dataclass

import time
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)

ASYMMETRIC_ALGS = ["ES256", "RS256", "EdDSA"]


@lru_cache(maxsize=4)
def _jwks_client(url: str) -> jwt.PyJWKClient:
    # Caches the project's public signing keys so we don't fetch them on every request.
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)


def _decode(token: str, settings: Settings) -> dict:
    """Verifies a Supabase access token. Newer projects sign with an asymmetric key published at the
    project's JWKS endpoint (ES256/RS256); older ones use the shared HS256 secret."""
    alg = jwt.get_unverified_header(token).get("alg")
    opts = {"require": ["exp", "sub"]}
    if alg == "HS256":
        if not settings.supabase_jwt_secret:
            raise jwt.InvalidTokenError("shared secret not configured")  # never verify against an empty key
        return jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated", options=opts)
    if alg in ASYMMETRIC_ALGS and settings.supabase_url:
        key = _jwks_client(f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json").get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=[alg], audience="authenticated", options=opts)
    raise jwt.InvalidTokenError("unsupported token algorithm")


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None
    token: str = ""


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    if not (settings.supabase_jwt_secret or settings.supabase_url) and (creds is not None or settings.guest_user_id):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Auth not configured")
    if creds is None:
        if settings.guest_user_id:
            # No-login mode: sign a short-lived token for the configured guest user so database
            # row-level security still applies to that one user.
            now = int(time.time())
            token = jwt.encode(
                {"sub": settings.guest_user_id, "aud": "authenticated", "role": "authenticated",
                 "iat": now, "exp": now + 3600},
                settings.supabase_jwt_secret, algorithm="HS256")
            return CurrentUser(id=settings.guest_user_id, email=None, token=token)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        claims = _decode(creds.credentials, settings)
    except jwt.PyJWTError as e:
        # The error class name (never the token) helps diagnose setup problems such as an unreachable key set.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token", headers={"X-Auth-Reason": type(e).__name__})
    except Exception as e:  # e.g. a missing crypto library: report as 401 instead of a 500 crash
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token", headers={"X-Auth-Reason": type(e).__name__})
    return CurrentUser(id=claims["sub"], email=claims.get("email"), token=creds.credentials)
