"""Pure progress calculations (weights, trends, goal completion, measurement deltas)."""
from __future__ import annotations

from datetime import date, timedelta

MEASURE_FIELDS = ("waist_cm", "chest_cm", "arm_cm", "hip_cm", "thigh_cm", "body_fat_pct")


def to_date(v) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def trend_7d_avg(points: list[dict]) -> list[dict]:
    """For each weight point, the mean of all points in the trailing 7 days (inclusive)."""
    pts = sorted(((to_date(p["log_date"]), float(p["weight_kg"])) for p in points), key=lambda x: x[0])
    out = []
    for d, _ in pts:
        window = [w for dd, w in pts if d - timedelta(days=6) <= dd <= d]
        out.append({"log_date": d.isoformat(), "avg_kg": round(sum(window) / len(window), 2)})
    return out


def weekly_change(points: list[dict]) -> float | None:
    """Least-squares slope in kg/week; None with fewer than 2 points or all on one day."""
    pts = sorted(((to_date(p["log_date"]), float(p["weight_kg"])) for p in points), key=lambda x: x[0])
    if len(pts) < 2 or pts[0][0] == pts[-1][0]:
        return None
    x0 = pts[0][0]
    xs = [(d - x0).days for d, _ in pts]
    ys = [w for _, w in pts]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    den = sum((x - mx) ** 2 for x in xs)
    if den == 0:
        return None
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den
    return round(slope * 7, 2)


def goal_pct(start: float | None, current: float | None, target: float | None) -> float | None:
    """Progress from start toward target, 0..100. Works for loss and gain goals; moving away counts as 0."""
    if start is None or current is None or target is None:
        return None
    if abs(target - start) < 0.05:
        return 100.0 if abs(current - target) <= 0.5 else 0.0
    pct = (current - start) / (target - start) * 100
    return round(max(0.0, min(100.0, pct)), 1)


def measurement_deltas(rows: list[dict]) -> dict[str, float | None]:
    """latest - earliest per field among rows that recorded it (None if fewer than 2 values)."""
    ordered = sorted(rows, key=lambda r: to_date(r["log_date"]))
    out: dict[str, float | None] = {}
    for f in MEASURE_FIELDS:
        vals = [float(r[f]) for r in ordered if r.get(f) is not None]
        out[f] = round(vals[-1] - vals[0], 1) if len(vals) >= 2 else None
    return out
