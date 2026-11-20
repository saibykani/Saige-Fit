"""Pure streak + badge calculations from existing log rows (no I/O)."""
from datetime import date, timedelta
from typing import Iterable


def _to_date(v) -> date | None:
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except (ValueError, TypeError):
        return None


def _days(values: Iterable) -> set[date]:
    return {d for d in (_to_date(v) for v in values) if d is not None}


def current_streak(days: Iterable, today: date) -> int:
    """Consecutive days ending today; an empty today doesn't break a chain that ends yesterday."""
    s = _days(days)
    d = today if today in s else today - timedelta(days=1)
    n = 0
    while d in s:
        n += 1
        d -= timedelta(days=1)
    return n


def longest_streak(days: Iterable) -> int:
    best = run = 0
    prev = None
    for d in sorted(_days(days)):
        run = run + 1 if prev is not None and d - prev == timedelta(days=1) else 1
        best = max(best, run)
        prev = d
    return best


def streak(days: Iterable, today: date) -> dict:
    return {"current": current_streak(days, today), "longest": longest_streak(days)}


def finished_workout_days(sessions: list[dict]) -> set[date]:
    return _days(s.get("log_date") for s in sessions if s.get("finished_at"))


def water_goal_days(rows: list[dict], target_ml: int | None) -> set[date]:
    if not target_ml or target_ml <= 0:
        return set()
    totals: dict[date, int] = {}
    for r in rows:
        d = _to_date(r.get("log_date"))
        if d is not None and r.get("counts_toward_goal", True):
            totals[d] = totals.get(d, 0) + int(r.get("amount_ml") or 0)
    return {d for d, ml in totals.items() if ml >= target_ml}


def _badge(key: str, title: str, description: str, value: int, goal: int) -> dict:
    return {"key": key, "title": title, "description": description, "earned": value >= goal,
            "progress": min(value, goal), "goal": goal}


def badges(meal_longest: int, workout_count: int, scan_count: int, water_longest: int) -> list[dict]:
    return [
        _badge("streak_7", "7-day streak", "Log meals 7 days in a row", meal_longest, 7),
        _badge("first_workout", "First workout", "Finish your first workout", workout_count, 1),
        _badge("workouts_10", "10 workouts", "Finish 10 workouts", workout_count, 10),
        _badge("first_scan", "First scan", "Scan your first meal", scan_count, 1),
        _badge("hydration_7", "Hydration hero", "Hit your water goal 7 days in a row", water_longest, 7),
    ]


def build(meal_dates: list, sessions: list[dict], water_rows: list[dict], target_water_ml: int | None,
          scans: list[dict], today: date) -> dict:
    wdays = finished_workout_days(sessions)
    hdays = water_goal_days(water_rows, target_water_ml)
    done_scans = sum(1 for s in scans if s.get("status", "done") == "done")
    meals = streak(meal_dates, today)
    water = streak(hdays, today)
    return {
        "streaks": {"logging": meals, "workout": streak(wdays, today), "water": water},
        "totals": {"workouts": len(wdays), "scans": done_scans},
        "badges": badges(meals["longest"], len(wdays), done_scans, water["longest"]),
    }
