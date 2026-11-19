"""Deterministic workout planning engine (pure functions, no I/O).

Safety principles:
- An exercise whose `contraindications` intersect the user's injury tags is NEVER selected, replaced into a plan,
  or suggested as a swap.
- The engine prescribes sets/reps/rest only. It never prescribes loads: the user logs their own weights.
- Volume is deliberately conservative for beginners.
Calorie burn from lifting is a rough MET-based ESTIMATE, not a measurement.
"""
from __future__ import annotations

import itertools
from dataclasses import dataclass, field

RANK = {"beginner": 0, "intermediate": 1, "advanced": 2}
MAJOR = {"chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes"}
TIMED = {"Plank", "Side plank", "Wall sit"}
LOSS_GOALS = {"weight_loss", "fat_loss"}
HYPER_GOALS = {"muscle_gain", "lean_muscle", "recomposition"}
WARMUP_MIN = 5
MAX_STRENGTH_DAYS = 6
LIFT_MET = 4.5  # general resistance training (Compendium of Physical Activities, vigorous ~6, light ~3.5)

# ---------- normalisation of free text ----------
INJURY_KEYWORDS = {
    "knee": "knee", "acl": "knee", "meniscus": "knee",
    "back": "lower_back", "spine": "lower_back", "lumbar": "lower_back", "disc": "lower_back", "sciatica": "lower_back",
    "shoulder": "shoulder", "rotator": "shoulder", "impingement": "shoulder",
    "wrist": "wrist", "carpal": "wrist",
    "elbow": "elbow", "tendin": "elbow",
    "neck": "neck", "cervical": "neck",
    "hip": "hip", "ankle": "ankle", "achilles": "ankle",
}
EQUIP_SYNONYMS = {
    "dumbbell": "dumbbell", "dumbbells": "dumbbell", "barbell": "barbell", "barbells": "barbell",
    "cable": "cable", "cables": "cable", "machine": "machine", "machines": "machine",
    "band": "bands", "bands": "bands", "resistance band": "bands", "resistance bands": "bands",
    "kettlebell": "kettlebell", "kettlebells": "kettlebell",
    "pull-up bar": "pullup_bar", "pullup bar": "pullup_bar", "pull up bar": "pullup_bar", "pullup_bar": "pullup_bar",
    "bodyweight": "bodyweight", "none": "bodyweight",
}
GYM_EQUIPMENT = {"barbell", "dumbbell", "cable", "machine", "bodyweight", "bands", "kettlebell", "pullup_bar"}


def injury_tags(injuries: list[str] | None) -> tuple[set[str], list[str]]:
    """Map free-text limitations to contraindication tags. Returns (tags, unrecognised_texts)."""
    tags: set[str] = set()
    unknown: list[str] = []
    for raw in injuries or []:
        text = (raw or "").lower().strip()
        if not text:
            continue
        hit = {tag for kw, tag in INJURY_KEYWORDS.items() if kw in text}
        if hit:
            tags |= hit
        else:
            unknown.append(raw)
    return tags, unknown


def available_equipment(env: str, user_equipment: list[str] | None) -> set[str]:
    listed = {EQUIP_SYNONYMS.get((e or "").lower().strip()) for e in (user_equipment or [])} - {None}
    if env in ("gym", "gym_home"):
        return set(GYM_EQUIPMENT)
    return {"bodyweight"} | listed  # home / outdoor: bodyweight plus whatever the user said they own


def is_safe(ex: dict, tags: set[str]) -> bool:
    return not (set(ex.get("contraindications") or []) & tags)


def usable_exercises(catalog: list[dict], equipment: set[str], experience: str, tags: set[str]) -> list[dict]:
    cap = RANK.get(experience, 0)
    out = []
    for ex in catalog:
        if not set(ex.get("equipment") or []) <= equipment:
            continue
        if RANK.get(ex.get("difficulty", "beginner"), 0) > cap:
            continue
        if not is_safe(ex, tags):
            continue
        out.append(ex)
    return out


# ---------- scheduling ----------
def _gaps(days: tuple[int, ...]) -> int:
    """Smallest cyclic gap (in days) between consecutive training days in a week."""
    if len(days) < 2:
        return 7
    ds = sorted(days)
    gaps = [b - a for a, b in zip(ds, ds[1:])] + [ds[0] + 7 - ds[-1]]
    return min(gaps)


def pick_weekdays(preferred: list[int] | None, n: int) -> list[int]:
    n = max(1, min(n, MAX_STRENGTH_DAYS))
    pref = sorted({d for d in (preferred or []) if 1 <= d <= 7})
    allowed = list(range(1, 8))
    if len(pref) >= n:
        pool = pref
        combos = list(itertools.combinations(pool, n))
    else:
        rest = [d for d in allowed if d not in pref]
        combos = [tuple(sorted(pref + list(c))) for c in itertools.combinations(rest, n - len(pref))]
    best = max(combos, key=lambda c: (_gaps(c), tuple(-x for x in c)))
    return list(best)


TEMPLATES = {
    "full": [("quads", 1), ("back", 1), ("chest", 1), ("hamstrings", 1), ("shoulders", 1), ("core", 1), ("glutes", 1), ("biceps", 1), ("triceps", 1)],
    "upper": [("chest", 2), ("back", 2), ("shoulders", 2), ("biceps", 1), ("triceps", 1)],
    "lower": [("quads", 2), ("hamstrings", 2), ("glutes", 1), ("calves", 1), ("core", 1)],
    "push": [("chest", 2), ("shoulders", 2), ("triceps", 2)],
    "pull": [("back", 3), ("biceps", 2), ("core", 1)],
    "legs": [("quads", 2), ("hamstrings", 2), ("glutes", 1), ("calves", 1)],
    "chest": [("chest", 5)],
    "back": [("back", 5)],
    "shoulders": [("shoulders", 5)],
    "arms": [("biceps", 3), ("triceps", 3)],
}
FOCUS = {
    "full": "Full body", "upper": "Upper body", "lower": "Lower body", "push": "Push (chest, shoulders, triceps)",
    "pull": "Pull (back, biceps)", "legs": "Legs", "chest": "Chest", "back": "Back", "shoulders": "Shoulders", "arms": "Arms",
}
SPLIT_NAME = {1: "Full body", 2: "Full body / Upper-Lower", 3: "Full body / Push-Pull-Legs", 4: "Upper/Lower", 5: "Push-Pull-Legs + Upper/Lower", 6: "Push-Pull-Legs"}


def choose_split(weekdays: list[int], experience: str, goal: str) -> list[str]:
    n = len(weekdays)
    spaced = _gaps(tuple(weekdays)) >= 2
    if n == 1:
        return ["full"]
    if n == 2:
        return ["full", "full"] if spaced else ["upper", "lower"]
    if n == 3:
        return ["full"] * 3 if spaced else ["push", "pull", "legs"]
    if n == 4:
        return ["upper", "lower", "upper", "lower"]
    if n == 5:
        if experience == "advanced" and goal in HYPER_GOALS:
            return ["chest", "back", "legs", "shoulders", "arms"]
        return ["push", "pull", "legs", "upper", "lower"]
    return ["push", "pull", "legs", "push", "pull", "legs"]


def primary_groups(template: str) -> set[str]:
    return {g for g, _ in TEMPLATES[template]} & MAJOR


# ---------- prescription ----------
def prescribe(ex: dict, goal: str, experience: str) -> dict:
    """Sets/reps/rest for one exercise. Reps is a string (e.g. "8-12", "30-45 s", "20 min")."""
    lvl = RANK.get(experience, 0)
    if ex["muscle_group"] == "cardio":
        return {"sets": 1, "reps": f"{(15, 20, 30)[lvl]} min", "rest_s": 0}
    if ex["name"] in TIMED:
        return {"sets": 3, "reps": "30-45 s", "rest_s": 45}
    comp = bool(ex.get("is_compound"))
    if goal == "strength":
        if comp:
            sets, reps, rest = (3, 4, 5)[lvl], ("6-8", "4-6", "3-5")[lvl], (120, 150, 180)[lvl]
        else:
            sets, reps, rest = 3, "8-12", 75
    elif goal in HYPER_GOALS:
        if comp:
            sets, reps, rest = (3, 3, 4)[lvl], ("8-10", "6-10", "6-10")[lvl], (90, 120, 120)[lvl]
        else:
            sets, reps, rest = (2, 3, 3)[lvl], "10-15", 60
    elif goal in LOSS_GOALS:
        sets, reps, rest = (3, "10-12", 60) if comp else ((2, 3, 3)[lvl], "12-15", 45)
    else:  # maintenance, general fitness
        sets, reps, rest = (3, "8-12", 90) if comp else ((2, 3, 3)[lvl], "10-15", 60)
    if experience == "beginner":
        sets = min(sets, 3 if comp else 2)
    return {"sets": sets, "reps": reps, "rest_s": rest}


def estimate_minutes(item: dict, ex: dict) -> float:
    if ex["muscle_group"] == "cardio":
        return float(item["reps"].split()[0])
    work = 40 if ex["name"] in TIMED else 45
    return item["sets"] * (work + item["rest_s"]) / 60.0


def day_minutes(items: list[dict], by_id: dict[str, dict]) -> int:
    return round(WARMUP_MIN + sum(estimate_minutes(i, by_id[i["exercise_id"]]) for i in items))


# ---------- plan generation ----------
EQUIP_PREF_BEGINNER = {"machine": 0, "dumbbell": 1, "cable": 2, "bodyweight": 3, "bands": 4, "kettlebell": 5, "pullup_bar": 6, "barbell": 7}
EQUIP_PREF_ADVANCED = {"barbell": 0, "dumbbell": 1, "cable": 2, "machine": 3, "pullup_bar": 4, "kettlebell": 5, "bodyweight": 6, "bands": 7}


def _ordered_pool(pool: list[dict], rotation: int, experience: str) -> list[dict]:
    pref = EQUIP_PREF_BEGINNER if experience == "beginner" else EQUIP_PREF_ADVANCED
    key = lambda e: (min(pref.get(q, 9) for q in e["equipment"]) if e["equipment"] else 9, e["name"])  # noqa: E731
    comps = sorted([e for e in pool if e["is_compound"]], key=key)
    isos = sorted([e for e in pool if not e["is_compound"]], key=key)
    rot = lambda xs: xs[rotation % len(xs):] + xs[:rotation % len(xs)] if xs else xs  # noqa: E731
    return rot(comps) + rot(isos)


def build_day(template: str, usable: list[dict], goal: str, experience: str, minutes: int, rotation: int) -> tuple[list[dict], int]:
    by_group: dict[str, list[dict]] = {}
    for e in usable:
        by_group.setdefault(e["muscle_group"], []).append(e)
    ordered = {g: _ordered_pool(by_group.get(g, []), rotation, experience) for g, _ in TEMPLATES[template]}
    cap = {"beginner": 5, "intermediate": 7, "advanced": 9}[experience]
    budget = minutes - WARMUP_MIN
    chosen: list[dict] = []
    spent = 0.0
    by_id = {e["id"]: e for e in usable}
    max_rounds = max(n for _, n in TEMPLATES[template])
    done = False
    for rnd in range(max_rounds):
        for group, n in TEMPLATES[template]:
            if rnd >= n or rnd >= len(ordered[group]) or len(chosen) >= cap:
                continue
            ex = ordered[group][rnd]
            item = {"exercise_id": ex["id"], **prescribe(ex, goal, experience)}
            cost = estimate_minutes(item, ex)
            if spent + cost > budget and item["sets"] > 2:
                item["sets"] = 2
                cost = estimate_minutes(item, ex)
            if spent + cost > budget and len(chosen) >= 2:
                done = True
                break
            chosen.append(item)
            spent += cost
        if done:
            break
    # a short, low-intensity finisher for fat-loss goals when time remains
    if goal in LOSS_GOALS and budget - spent >= 10:
        cardio = [e for e in usable if e["muscle_group"] == "cardio" and e["name"] in ("Brisk walk", "Stationary bike", "Elliptical")]
        if cardio:
            ex = sorted(cardio, key=lambda e: e["name"])[0]
            item = {"exercise_id": ex["id"], "sets": 1, "reps": "10 min", "rest_s": 0}
            chosen.append(item)
            by_id[ex["id"]] = ex
    # big lifts first, core last, cardio finisher at the very end
    group_of = {i["exercise_id"]: by_id[i["exercise_id"]]["muscle_group"] for i in chosen}
    chosen.sort(key=lambda i: (group_of[i["exercise_id"]] == "cardio", group_of[i["exercise_id"]] == "core",
                               not by_id[i["exercise_id"]]["is_compound"]))
    return chosen, day_minutes(chosen, by_id) if chosen else 0


@dataclass
class PlanDay:
    weekday: int
    focus: str
    is_rest: bool
    exercises: list[dict] = field(default_factory=list)
    estimated_minutes: int = 0
    groups: set[str] = field(default_factory=set)  # primary major muscle groups (for recovery checks)


@dataclass
class GeneratedPlan:
    name: str
    split: list[str]
    days: list[PlanDay]
    notes: list[str]


def generate_plan(*, catalog: list[dict], goal: str, experience: str, env: str, equipment: list[str] | None,
                  injuries: list[str] | None, training_days: int, workout_days: list[int] | None,
                  minutes: int, basic: bool = False) -> GeneratedPlan:
    notes: list[str] = []
    tags, unknown = injury_tags(injuries)
    for u in unknown:
        notes.append(f"We couldn't map '{u}' to a movement restriction, so please check each exercise with a clinician or coach.")
    if tags:
        notes.append("Exercises that conflict with your reported limitations (" + ", ".join(sorted(tags)) + ") were left out.")

    if basic:  # free tier: fixed beginner full-body template, Mon/Wed/Fri
        experience, goal, training_days, workout_days, minutes = "beginner", "general_fitness", 3, [1, 3, 5], min(minutes, 45)
    n = max(1, min(training_days, MAX_STRENGTH_DAYS))
    if training_days > MAX_STRENGTH_DAYS:
        notes.append("To protect recovery, a maximum of 6 strength days is scheduled; the 7th day is active recovery.")
    weekdays = pick_weekdays(workout_days, n)
    split = choose_split(weekdays, experience, goal)
    usable = usable_exercises(catalog, available_equipment(env, equipment), experience, tags)
    if len(usable) < 5:
        raise ValueError("Not enough suitable exercises for your equipment and limitations")

    days: dict[int, PlanDay] = {}
    seen: dict[str, int] = {}
    for wd, tpl in zip(weekdays, split):
        rot = seen.get(tpl, 0)
        seen[tpl] = rot + 1
        items, mins = build_day(tpl, usable, goal, experience, minutes, rot)
        if len(items) < 2:  # e.g. heavy restrictions: fall back to any safe movements so the day is never empty
            items, mins = build_day("full", usable, goal, experience, minutes, rot)
        days[wd] = PlanDay(wd, FOCUS[tpl], False, items, mins, primary_groups(tpl))

    rest_days = [d for d in range(1, 8) if d not in days]
    walk = next((e for e in usable if e["name"] == "Easy walk"), None)
    active: set[int] = set()
    if walk:
        if goal in LOSS_GOALS or goal in ("general_fitness",):
            active = set(rest_days[::2])
        elif len(rest_days) >= 3:
            active = {rest_days[len(rest_days) // 2]}
    for d in rest_days:
        if d in active and walk:
            item = {"exercise_id": walk["id"], **prescribe(walk, goal, "beginner")}
            days[d] = PlanDay(d, "Active recovery", True, [item], round(float(item["reps"].split()[0])))
        else:
            days[d] = PlanDay(d, "Rest & recovery", True, [], 0)

    check_recovery([days[d] for d in sorted(days)])
    name = f"{n}-day {SPLIT_NAME[n]} plan" if not basic else "Starter full-body plan"
    return GeneratedPlan(name, split, [days[d] for d in sorted(days)], notes)


def check_recovery(days: list[PlanDay]) -> None:
    """Raises if two adjacent (cyclic, Sunday->Monday included) training days share a primary major muscle group."""
    by_wd = {d.weekday: d for d in days if not d.is_rest}
    for wd, day in by_wd.items():
        nxt = by_wd.get(wd % 7 + 1)
        if nxt and day.groups & nxt.groups:
            raise AssertionError(f"recovery violation between weekday {wd} and {nxt.weekday}: {day.groups & nxt.groups}")


# ---------- sessions ----------
def epley_1rm(weight_kg: float, reps: int) -> float:
    return weight_kg * (1 + reps / 30.0)


def pr_score(weight_kg: float | None, reps: int | None) -> float:
    """Comparable strength score: Epley estimated 1RM for loaded sets, rep count for bodyweight sets."""
    w, r = float(weight_kg or 0), int(reps or 0)
    if r <= 0:
        return 0.0
    return epley_1rm(w, r) if w > 0 else float(r)


def is_new_pr(prior_scores: list[float], weight_kg: float | None, reps: int | None) -> bool:
    """A PR needs prior history to beat; the very first logged set is a baseline, not a record."""
    score = pr_score(weight_kg, reps)
    return bool(prior_scores) and score > max(prior_scores) + 1e-9


def kcal_estimate(weight_kg: float, minutes: float) -> int:
    """MET x kg x hours. An ESTIMATE only (resistance training, general effort)."""
    return round(LIFT_MET * weight_kg * max(0.0, minutes) / 60.0)


def completion_pct(completed_sets: int, planned_sets: int) -> int:
    if planned_sets <= 0:
        return 0
    return min(100, round(100 * completed_sets / planned_sets))
