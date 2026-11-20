"""Verifies Supabase-issued JWTs. The user id always comes from the verified token,
never from request bodies or query strings."""
from dataclasses import dataclass

import time

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None
    token: str = ""


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    if not settings.supabase_jwt_secret and (creds is not None or settings.guest_user_id):
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
        claims = jwt.decode(
            creds.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    return CurrentUser(id=claims["sub"], email=claims.get("email"), token=creds.credentials)
