"""Thin PostgREST client that forwards the *user's* JWT, so Postgres RLS enforces access.
The service-role key is deliberately not used for user-facing reads/writes."""
from __future__ import annotations

import httpx
from fastapi import Depends, HTTPException

from app.core.auth import CurrentUser, current_user
from app.core.config import Settings, get_settings


class Rest:
    def __init__(self, base_url: str, anon_key: str, token: str, transport: httpx.AsyncBaseTransport | None = None):
        self._base = base_url.rstrip("/") + "/rest/v1"
        self._headers = {"apikey": anon_key, "Authorization": f"Bearer {token}"}
        self._transport = transport

    async def _req(self, method: str, table: str, *, params=None, json=None, prefer: str | None = None):
        headers = dict(self._headers)
        if prefer:
            headers["Prefer"] = prefer
        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=15) as c:
                r = await c.request(method, f"{self._base}/{table}", params=params, json=json, headers=headers)
        except httpx.HTTPError:
            raise HTTPException(502, "Database unavailable")
        if r.status_code >= 400:
            raise HTTPException(502 if r.status_code >= 500 else 400, "Database request rejected")
        return r.json() if r.content else []

    async def select(self, table: str, **params) -> list[dict]:
        return await self._req("GET", table, params=params)

    async def insert(self, table: str, rows: list[dict] | dict) -> list[dict]:
        return await self._req("POST", table, json=rows, prefer="return=representation")


def get_db(user: CurrentUser = Depends(current_user), s: Settings = Depends(get_settings)) -> Rest:
    return Rest(s.supabase_url, s.supabase_anon_key, user.token)
