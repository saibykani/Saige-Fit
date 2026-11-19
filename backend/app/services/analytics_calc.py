"""Pure analytics: turns raw rows into chart-ready series + averages, adherence and streaks."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from app.services.progress_calc import to_date

ADHERENCE_BAND = (0.85, 1.15)  # a day is "on target" when logged kcal is within 85-115% of the target


def daterange(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def _minutes(s: dict) -> float:
    try:
        a = datetime.fromisoformat(str(s["started_at"]).replace("Z", "+00:00"))
        b = datetime.fromisoformat(str(s["finished_at"]).replace("Z", "+00:00"))
    except (KeyError, ValueError, TypeError):
        return 0.0
    return max(0.0, (b - a).total_seconds() / 60)


def _r(v: float, d=1) -> float:
    return round(v, d)


def build(days: list[date], meals: list[dict], water: list[dict], sessions: list[dict], weights: list[dict],
          targets: dict, as_of: date) -> dict:
    keys = [d.isoformat() for d in days]
    idx = {k: i for i, k in enumerate(keys)}
    n = len(days)
    cal, pro, carb, fat, fib = ([0.0] * n for _ in range(5))
    logged = [False] * n
    by_meal: dict[str, float] = {}
    for m in meals:
        i = idx.get(str(m["log_date"])[:10])
        if i is None:
            continue
        for it in m.get("meal_items") or []:
            logged[i] = True
            cal[i] += float(it.get("kcal") or 0)
            pro[i] += float(it.get("protein_g") or 0)
            carb[i] += float(it.get("carbs_g") or 0)
            fat[i] += float(it.get("fat_g") or 0)
            fib[i] += float(it.get("fiber_g") or 0)
            by_meal[m["meal_type"]] = by_meal.get(m["meal_type"], 0.0) + float(it.get("kcal") or 0)
    wat = [0.0] * n
    for w in water:
        i = idx.get(str(w["log_date"])[:10])
        if i is not None and w.get("counts_toward_goal", True):
            wat[i] += float(w["amount_ml"])
    wk, wmin = [0] * n, [0.0] * n
    for s in sessions:
        i = idx.get(str(s["log_date"])[:10])
        if i is not None and s.get("finished_at"):
            wk[i] += 1
            wmin[i] += _minutes(s)
    wt: list[float | None] = [None] * n
    for w in sorted(weights, key=lambda x: str(x["log_date"])):
        i = idx.get(str(w["log_date"])[:10])
        if i is not None:
            wt[i] = float(w["weight_kg"])

    elapsed = [i for i, d in enumerate(days) if d <= as_of]
    kcal_t = float(targets["kcal"])
    lo, hi = ADHERENCE_BAND
    adherent = [i for i in elapsed if logged[i] and lo * kcal_t <= cal[i] <= hi * kcal_t]
    adherence = _r(100 * len(adherent) / len(elapsed)) if elapsed else 0.0

    # streak: consecutive logged days ending at as_of (or the day before, if today is still empty)
    end_i = max(elapsed) if elapsed else -1
    if end_i >= 0 and not logged[end_i]:
        end_i -= 1
    streak = 0
    while end_i >= 0 and logged[end_i]:
        streak += 1
        end_i -= 1

    ld = [i for i in range(n) if logged[i]]
    avg = lambda arr, sel: _r(sum(arr[i] for i in sel) / len(sel)) if sel else 0.0
    wvals = [v for v in wt if v is not None]
    hyd_target = float(targets.get("water_ml") or 0)
    weeks = len(elapsed) / 7 if elapsed else 0
    return {
        "range": {"start": keys[0], "end": keys[-1], "days": n, "as_of": as_of.isoformat()},
        "labels": keys,
        "series": {"calories": [_r(v) for v in cal], "protein_g": [_r(v) for v in pro], "carbs_g": [_r(v) for v in carb],
                   "fat_g": [_r(v) for v in fat], "fiber_g": [_r(v) for v in fib], "water_ml": [round(v) for v in wat],
                   "workouts": wk, "workout_minutes": [round(v) for v in wmin], "weight_kg": wt},
        "targets": targets,
        "averages": {  # nutrition averages use days with something logged; water over all elapsed days
            "calories": avg(cal, ld), "protein_g": avg(pro, ld), "carbs_g": avg(carb, ld), "fat_g": avg(fat, ld),
            "fiber_g": avg(fib, ld), "water_ml": avg(wat, elapsed), "logged_days": len(ld),
            "workouts_per_week": _r(sum(wk[i] for i in elapsed) / weeks, 1) if weeks else 0.0,
            "weight_change_kg": _r(wvals[-1] - wvals[0], 1) if len(wvals) >= 2 else None,
            "hydration_goal_days": sum(1 for i in elapsed if hyd_target and wat[i] >= hyd_target),
        },
        "adherence_pct": adherence,
        "streak_days": streak,
        "by_meal": [{"meal_type": k, "kcal": _r(v)} for k, v in sorted(by_meal.items(), key=lambda kv: -kv[1])],
    }
