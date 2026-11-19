"""Weekly report. Stats and recommendations are computed deterministically from the user's data;
an LLM (optional) only rephrases the summary. Template text is used if no LLM / on any LLM failure."""
from __future__ import annotations

import json
from datetime import date, timedelta

from app.services import nutrition_engine as ne
from app.services.coach import LLM
from app.services.scanner import nutrients_from_row

ON_TARGET_KCAL = 0.10   # within +-10% of the calorie target
PROTEIN_OK = 0.85       # >= 85% of the protein target


def week_days(end: date) -> list[str]:
    return [(end - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]


def compute_week_stats(*, end: date, targets: dict, meals: list[dict], hydration: list[dict], weights: list[dict],
                       sessions: list[dict], planned_workouts: int, goal: str | None) -> dict:
    """meals: meal_logs rows with embedded meal_items; hydration: hydration_logs; weights: weight_logs;
    sessions: workout_sessions (finished_at set = completed)."""
    days = week_days(end)
    per_day: dict[str, ne.Nutrients] = {}
    for d in days:
        its = [nutrients_from_row(i) for m in meals if m["log_date"] == d for i in m.get("meal_items", [])]
        if its:
            per_day[d] = ne.sum_nutrients(its)
    logged = list(per_day.values())
    n = len(logged)
    avg = lambda f: round(sum(f(x) for x in logged) / n, 1) if n else None  # noqa: E731
    kt, pt = float(targets["kcal"]), float(targets["protein_g"])
    on_target = sum(1 for x in logged if abs(x.kcal - kt) / kt <= ON_TARGET_KCAL and x.protein_g >= PROTEIN_OK * pt)
    protein_days = sum(1 for x in logged if x.protein_g >= PROTEIN_OK * pt)

    wt = sorted([w for w in weights if days[0] <= w["log_date"] <= days[-1]], key=lambda w: w["log_date"])
    change = round(float(wt[-1]["weight_kg"]) - float(wt[0]["weight_kg"]), 1) if len(wt) >= 2 else None

    water_by_day: dict[str, int] = {}
    for h in hydration:
        if h["log_date"] in days and h.get("counts_toward_goal", True):
            water_by_day[h["log_date"]] = water_by_day.get(h["log_date"], 0) + int(h["amount_ml"])
    wtarget = float(targets.get("water_ml") or 0)
    water_days = sum(1 for v in water_by_day.values() if wtarget and v >= 0.9 * wtarget)

    done = sum(1 for s in sessions if s.get("finished_at") and days[0] <= s["log_date"] <= days[-1])
    return {
        "week": {"start": days[0], "end": days[-1]}, "goal": goal,
        "nutrition": {
            "days_logged": n, "avg_kcal": avg(lambda x: x.kcal), "avg_protein_g": avg(lambda x: x.protein_g),
            "avg_carbs_g": avg(lambda x: x.carbs_g), "avg_fat_g": avg(lambda x: x.fat_g),
            "target_kcal": kt, "target_protein_g": pt, "days_on_target": on_target, "protein_days": protein_days,
            "adherence_pct": round(100 * on_target / 7),
        },
        "workouts": {"completed": done, "planned": planned_workouts,
                     "completion_pct": min(100, round(100 * done / planned_workouts)) if planned_workouts else None},
        "weight": {"change_kg": change, "start_kg": float(wt[0]["weight_kg"]) if wt else None, "end_kg": float(wt[-1]["weight_kg"]) if wt else None,
                   "entries": len(wt)},
        "hydration": {"days_goal_met": water_days, "consistency_pct": round(100 * water_days / 7) if wtarget else None,
                      "avg_ml": round(sum(water_by_day.values()) / len(water_by_day)) if water_by_day else None},
    }


def recommendations(s: dict) -> list[str]:
    n, w, h, wt = s["nutrition"], s["workouts"], s["hydration"], s["weight"]
    out: list[str] = []
    if n["days_logged"] == 0:
        out.append("No meals were logged this week. Log even a few meals so next week's report can give you real insights.")
    else:
        if n["days_logged"] < 5:
            out.append(f"You logged food on {n['days_logged']} of 7 days. Aim for at least 5 so your averages are reliable.")
        if n["avg_protein_g"] is not None and n["avg_protein_g"] < PROTEIN_OK * n["target_protein_g"]:
            out.append(f"Protein averaged {n['avg_protein_g']:.0f} g against a {n['target_protein_g']:.0f} g target. Add a protein source to your lowest-protein meal (e.g. eggs, dal, paneer, tofu, yogurt).")
        if n["avg_kcal"] is not None and n["avg_kcal"] > 1.10 * n["target_kcal"]:
            out.append(f"You averaged {n['avg_kcal']:.0f} kcal, above your {n['target_kcal']:.0f} kcal target. Try slightly smaller portions of calorie-dense foods rather than skipping meals.")
        elif n["avg_kcal"] is not None and n["avg_kcal"] < 0.85 * n["target_kcal"]:
            out.append(f"You averaged {n['avg_kcal']:.0f} kcal, well below your {n['target_kcal']:.0f} kcal target. Make sure you're eating enough to fuel training and recovery; if you're restricting on purpose, please talk to a healthcare professional.")
    if w["planned"]:
        if w["completed"] < w["planned"]:
            out.append(f"You completed {w['completed']} of {w['planned']} planned workouts. Put your next sessions in your calendar at fixed times to make them easier to keep.")
        else:
            out.append("You completed every planned workout. Keep sleep and protein consistent so you recover well.")
    if h["consistency_pct"] is not None and h["consistency_pct"] < 50:
        out.append(f"You reached your water goal on {h['days_goal_met']} of 7 days. Keep a bottle nearby and use the reminders.")
    if wt["change_kg"] is not None:
        out.append(f"Your logged weight changed by {wt['change_kg']:+.1f} kg this week. Day-to-day weight is noisy, so judge progress by the 3-4 week trend.")
    elif wt["entries"] < 2:
        out.append("Log your weight at least twice a week (same time of day) so we can show a trend.")
    return out[:6]


def template_summary(s: dict) -> str:
    n, w = s["nutrition"], s["workouts"]
    parts = []
    if n["days_logged"]:
        parts.append(f"You logged meals on {n['days_logged']} of 7 days, averaging {n['avg_kcal']:.0f} kcal and {n['avg_protein_g']:.0f} g protein "
                     f"(targets {n['target_kcal']:.0f} kcal / {n['target_protein_g']:.0f} g).")
    else:
        parts.append("No meals were logged this week.")
    if w["planned"]:
        parts.append(f"You completed {w['completed']} of {w['planned']} planned workouts.")
    elif w["completed"]:
        parts.append(f"You completed {w['completed']} workouts.")
    if s["weight"]["change_kg"] is not None:
        parts.append(f"Weight changed {s['weight']['change_kg']:+.1f} kg.")
    return " ".join(parts)


async def phrase_summary(llm: LLM | None, stats: dict) -> tuple[str, bool]:
    """Returns (summary, used_llm). Falls back to the template on no LLM or any failure."""
    fallback = template_summary(stats)
    if llm is None:
        return fallback, False
    system = ("You write a short, upbeat weekly fitness summary (3-4 sentences, plain text) for a user. Use ONLY the numbers in the JSON provided; "
              "do not invent data, do not give medical advice, and do not recommend extreme dieting.")
    try:
        text = await llm.complete(system, [{"role": "user", "content": json.dumps(stats, default=str)}])
    except Exception:
        return fallback, False
    text = (text or "").strip()
    return (text, True) if text else (fallback, False)
