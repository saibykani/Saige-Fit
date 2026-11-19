"""Generic in-memory stand-in for app.core.db.Rest, for tests. Supports PostgREST-style filters
(eq, neq, gt, gte, lt, lte, in, ilike, is), order, limit; ignores `select` column lists and embeds.
Do NOT modify; subclass in your own test file if you need more."""
from __future__ import annotations

import itertools
import re


def _match(row: dict, key: str, cond: str) -> bool:
    op, _, val = cond.partition(".")
    v = row.get(key)
    if op == "in":
        return str(v) in [x.strip('"') for x in val.strip("()").split(",")]
    if op == "is":
        return (v is None) == (val == "null")
    if op == "ilike":
        pat = re.escape(val).replace(r"\*", ".*")
        return v is not None and re.fullmatch(pat, str(v), re.I) is not None
    if v is None:
        return False
    try:
        a, b = float(v), float(val)
    except (TypeError, ValueError):
        a, b = str(v), val
    return {"eq": a == b, "neq": a != b, "gt": a > b, "gte": a >= b, "lt": a < b, "lte": a <= b}[op]


class MemDb:
    _ids = itertools.count(1)

    def __init__(self, tables: dict[str, list[dict]] | None = None):
        self.tables: dict[str, list[dict]] = {k: [dict(r) for r in v] for k, v in (tables or {}).items()}

    def _filter(self, table, params):
        rows = self.tables.setdefault(table, [])
        reserved = {"select", "order", "limit", "offset", "on_conflict"}
        return [r for r in rows if all(_match(r, k, v) for k, v in params.items() if k not in reserved)]

    async def select(self, table, **params):
        rows = self._filter(table, params)
        if "order" in params:
            col, _, direction = params["order"].partition(".")
            rows = sorted(rows, key=lambda r: (r.get(col) is None, r.get(col)), reverse=direction == "desc")
        if "limit" in params:
            rows = rows[: int(params["limit"])]
        return [dict(r) for r in rows]

    async def insert(self, table, rows):
        rows = rows if isinstance(rows, list) else [rows]
        out = []
        for r in rows:
            new = {"id": f"{table}-{next(self._ids)}", **r}
            self.tables.setdefault(table, []).append(new)
            out.append(dict(new))
        return out

    async def upsert(self, table, rows, on_conflict):
        rows = rows if isinstance(rows, list) else [rows]
        keys = on_conflict.split(",")
        out = []
        for r in rows:
            hit = next((x for x in self.tables.setdefault(table, []) if all(x.get(k) == r.get(k) for k in keys)), None)
            if hit:
                hit.update(r)
                out.append(dict(hit))
            else:
                out += await self.insert(table, r)
        return out

    async def update(self, table, values, **filters):
        hits = self._filter(table, filters)
        for r in hits:
            r.update(values)
        return [dict(r) for r in hits]

    async def delete(self, table, **filters):
        hits = self._filter(table, filters)
        self.tables[table] = [r for r in self.tables[table] if r not in hits]
        return [dict(r) for r in hits]
