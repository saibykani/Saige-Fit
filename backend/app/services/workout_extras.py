"""Pure helpers for quick workouts, exercise history/progression and the weekly overview (no I/O, no AI)."""
from __future__ import annotations

from datetime import date, timedelta

from app.services import workout_engine as we

QUICK_MINUTES = (15, 30, 45, 60)
GROUP_ALIASES = {"legs": ["quads", "hamstrings", "glutes", "calves"], "arms": ["biceps", "triceps"]}


def normalise_equipment(items: list[str] | None) -> set[str]:
    return {we.EQUIP_SYNONYMS.get((e or "").lower().strip()) for e in items or []} - {None}


def _single_group_day(groups: list[str], usable: list[dict], goal: str, experience: str, budget: float, cap: int) -> list[dict]:
    pools = [we._ordered_pool([e for e in usable if e["muscle_group"] == g], 0, experience) for g in groups]
    chosen: list[dict] = []
    spent = 0.0
    for rnd in range(cap):
        progressed = False
        for pool in pools:
            if rnd >= len(pool) or len(chosen) >= cap:
                continue
            ex = pool[rnd]
            item = {"exercise_id": ex["id"], **we.prescribe(ex, goal, experience)}
            cost = we.estimate_minutes(item, ex)
            if spent + cost > budget and item["sets"] > 2:
                item["sets"] = 2
                cost = we.estimate_minutes(item, ex)
            if spent + cost > budget and len(chosen) >= 2:
                return chosen
            chosen.append(item)
            spent += cost
            progressed = True
        if not progressed:
            break
    return chosen


def quick_session(*, catalog: list[dict], goal: str, experience: str, env: str, profile_equipment: list[str] | None,
                  injuries: list[str] | None, minutes: int, muscle: str | None, equipment: list[str] | None) -> tuple[list[dict], list[str]]:
    """Returns (items, notes). Raises ValueError when nothing suitable exists."""
    notes: list[str] = []
    tags, unknown = we.injury_tags(injuries)
    for u in unknown:
        notes.append(f"We couldn't map '{u}' to a movement restriction, so please check each exercise with a clinician or coach.")
    if tags:
        notes.append("Exercises that conflict with your reported limitations (" + ", ".join(sorted(tags)) + ") were left out.")
    avail = we.available_equipment(env, profile_equipment)
    wanted = normalise_equipment(equipment)
    if wanted:
        avail = avail & wanted
    usable = [e for e in we.usable_exercises(catalog, avail, experience, tags) if e["muscle_group"] != "cardio"]
    key = (muscle or "full").lower().strip()
    if key in we.TEMPLATES:
        items, _ = we.build_day(key, usable, goal, experience, minutes, 0)
    elif key in GROUP_ALIASES or any(e["muscle_group"] == key for e in usable):
        cap = {"beginner": 5, "intermediate": 7, "advanced": 9}.get(experience, 5)
        items = _single_group_day(GROUP_ALIASES.get(key, [key]), usable, goal, experience, minutes - we.WARMUP_MIN, cap)
    else:
        items = []
    if not items:
        raise ValueError("No suitable exercises for that muscle, equipment and your limitations")
    return items, notes


def plan_minutes(items: list[dict], by_id: dict[str, dict]) -> int:
    return we.day_minutes(items, by_id) if items else 0


# ---------- history / progression ----------
def done_sets(sets: list[dict]) -> list[dict]:
    return [s for s in sets if s.get("completed") and not s.get("skipped") and int(s.get("reps") or 0) > 0]


def weight_step(weight: float, compound: bool) -> float:
    return 5.0 if compound and weight >= 60 else 2.5


def round_to(w: float, step: float = 2.5) -> float:
    return round(round(w / step) * step, 2)


def suggest_next(last_sets: list[dict], compound: bool, target_reps: int) -> dict:
    """Simple double progression: hit the target reps on every top set -> add weight; else repeat the weight and chase +1 rep."""
    sets = done_sets(last_sets)
    if not sets:
        return {"action": "start", "weight_kg": None, "reps": None,
                "reason": "No history yet. Start light, focus on form, and log your sets."}
    top_w = max(float(s.get("weight_kg") or 0) for s in sets)
    at_top = [s for s in sets if float(s.get("weight_kg") or 0) == top_w]
    min_reps = min(int(s["reps"]) for s in at_top)
    if top_w <= 0:
        reps = max(int(s["reps"]) for s in at_top)
        return {"action": "add_reps", "weight_kg": 0, "reps": reps + 1, "reason": f"Bodyweight: aim for {reps + 1} reps on your first set."}
    if min_reps >= target_reps:
        nw = round_to(top_w + weight_step(top_w, compound))
        return {"action": "increase", "weight_kg": nw, "reps": max(1, target_reps - 2),
                "reason": f"You hit {min_reps}+ reps on every set at {top_w:g} kg. Add weight."}
    return {"action": "repeat", "weight_kg": top_w, "reps": min_reps + 1,
            "reason": f"Repeat {top_w:g} kg and aim for {min_reps + 1} reps on each set."}


def warmup_sets(working_kg: float | None, compound: bool) -> list[dict]:
    if not working_kg or working_kg < 20 or not compound:
        return []
    return [{"weight_kg": round_to(working_kg * p), "reps": r} for p, r in ((0.5, 8), (0.7, 5), (0.85, 3))]


def history_by_session(sets: list[dict], date_of: dict[str, str], limit: int) -> list[dict]:
    grouped: dict[str, list[dict]] = {}
    for s in done_sets(sets):
        if s["session_id"] in date_of:
            grouped.setdefault(s["session_id"], []).append(s)
    out = []
    for sid, ss in grouped.items():
        ss.sort(key=lambda s: s.get("set_number") or 0)
        best = max(ss, key=lambda s: we.pr_score(s.get("weight_kg"), s.get("reps")))
        out.append({"session_id": sid, "date": date_of[sid],
                    "sets": [{"set_number": s.get("set_number"), "reps": s.get("reps"), "weight_kg": s.get("weight_kg"), "is_pr": bool(s.get("is_pr"))} for s in ss],
                    "top_e1rm": round(we.pr_score(best.get("weight_kg"), best.get("reps")), 1),
                    "volume_kg": round(sum(float(s.get("weight_kg") or 0) * int(s["reps"]) for s in ss), 1)})
    out.sort(key=lambda x: x["date"], reverse=True)
    return out[:limit]


def week_start(d: date) -> date:
    return d - timedelta(days=d.isoweekday() - 1)
