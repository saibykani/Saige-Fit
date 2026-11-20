from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.routers.exercises import full as full_exercise
from app.routers.workouts import IdPath, active_plan, sets_for
from app.services import streaks as sk
from app.services import workout_engine as we
from app.services import workout_extras as wx
from app.services.ai_data import exercise_catalog, load_goal, require_profile, utc_today

router = APIRouter(prefix="/v1/workouts", tags=["workouts"])


class QuickIn(BaseModel):
    minutes: int = Field(ge=15, le=60)
    muscle: str | None = Field(default=None, max_length=30)
    equipment: list[str] | None = Field(default=None, max_length=12)


@router.post("/quick")
async def quick(body: QuickIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    """One-off session plan from the library. Nothing is stored: start it with POST /sessions (day_id null)."""
    if body.minutes not in wx.QUICK_MINUTES:
        raise HTTPException(422, "minutes must be 15, 30, 45 or 60")
    prof = await require_profile(db, user.id)
    catalog = await exercise_catalog(db)
    try:
        items, notes = wx.quick_session(catalog=catalog, goal=await load_goal(db, user.id), experience=prof.get("experience") or "beginner",
                                        env=prof.get("workout_env") or "gym", profile_equipment=prof.get("equipment") or [],
                                        injuries=prof.get("injuries") or [], minutes=body.minutes, muscle=body.muscle, equipment=body.equipment)
    except ValueError as e:
        raise HTTPException(422, str(e))
    by_id = {e["id"]: e for e in catalog}
    label = (body.muscle or "full body").replace("_", " ").capitalize()
    day = {"id": "quick", "weekday": utc_today().isoweekday(), "focus": f"Quick {body.minutes} min - {label}", "is_rest": False,
           "estimated_minutes": wx.plan_minutes(items, by_id),
           "exercises": [{"exercise": full_exercise(by_id[i["exercise_id"]]), "sets": i["sets"], "reps": i["reps"], "rest_s": i["rest_s"]} for i in items]}
    return {"day": day, "notes": notes, "is_quick": True,
            "disclaimer": "General guidance, not medical advice. Choose loads you can control with good form and stop if something hurts."}


@router.get("/exercises/{exercise_id}/history")
async def exercise_history(exercise_id: IdPath, limit: int = Query(5, ge=1, le=30), target_reps: int = Query(10, ge=1, le=50),
                           user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    ex = next((e for e in await exercise_catalog(db) if e["id"] == exercise_id), None)
    if not ex:
        raise HTTPException(404, "Exercise not found")
    sessions = await db.select("workout_sessions", select="id,log_date", user_id=f"eq.{user.id}", limit="2000")
    date_of = {s["id"]: str(s["log_date"])[:10] for s in sessions}
    sets = [s for s in await db.select("workout_sets", select="*", exercise_id=f"eq.{exercise_id}", limit="20000") if s["session_id"] in date_of]
    sessions_out = wx.history_by_session(sets, date_of, limit)
    all_done = wx.done_sets(sets)
    best = max(all_done, key=lambda s: we.pr_score(s.get("weight_kg"), s.get("reps")), default=None)
    last_sets = [s for s in all_done if sessions_out and s["session_id"] == sessions_out[0]["session_id"]]
    compound = bool(ex.get("is_compound"))
    sug = wx.suggest_next(last_sets, compound, target_reps)
    return {"exercise_id": exercise_id, "name": ex["name"], "sessions": sessions_out,
            "best": {"weight_kg": best.get("weight_kg"), "reps": best.get("reps"), "e1rm": round(we.pr_score(best.get("weight_kg"), best.get("reps")), 1),
                     "achieved_on": date_of[best["session_id"]]} if best else None,
            "e1rm": sessions_out[0]["top_e1rm"] if sessions_out else None,
            "suggestion": sug, "warmup": wx.warmup_sets(sug.get("weight_kg"), compound)}


@router.get("/overview")
async def overview(today_: date | None = Query(None, alias="today"), user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    today = today_ or utc_today()
    monday = wx.week_start(today)
    prev = monday - timedelta(weeks=1)
    sessions = [s for s in await db.select("workout_sessions", select="*", user_id=f"eq.{user.id}", limit="2000") if s.get("finished_at")]
    date_of = {s["id"]: str(s["log_date"])[:10] for s in sessions}
    this_ids = [i for i, d in date_of.items() if monday.isoformat() <= d <= today.isoformat()]
    prev_ids = [i for i, d in date_of.items() if prev.isoformat() <= d < monday.isoformat()]
    catalog = {e["id"]: e for e in await exercise_catalog(db)}
    muscles: dict[str, dict] = {}
    for ids, key in ((this_ids, "sets"), (prev_ids, "prev_sets")):
        for s in wx.done_sets(await sets_for(db, ids)):
            m = (catalog.get(s["exercise_id"]) or {}).get("muscle_group")
            if not m:
                continue
            row = muscles.setdefault(m, {"muscle_group": m, "sets": 0, "prev_sets": 0, "volume_kg": 0.0})
            row[key] += 1
            if key == "sets":
                row["volume_kg"] = round(row["volume_kg"] + float(s.get("weight_kg") or 0) * int(s["reps"]), 1)
    plan = await active_plan(db, user.id)
    planned = 0
    if plan:
        planned = sum(1 for d in await db.select("workout_days", select="is_rest", plan_id=f"eq.{plan['id']}") if not d["is_rest"])
    pr_sets = [s for s in await sets_for(db, list(date_of)) if s.get("is_pr") and s.get("completed") and not s.get("skipped")]
    last_pr = None
    if pr_sets:
        s = max(pr_sets, key=lambda s: (date_of[s["session_id"]], we.pr_score(s.get("weight_kg"), s.get("reps"))))
        last_pr = {"exercise_id": s["exercise_id"], "name": (catalog.get(s["exercise_id"]) or {}).get("name"), "weight_kg": s.get("weight_kg"),
                   "reps": s.get("reps"), "e1rm": round(we.pr_score(s.get("weight_kg"), s.get("reps")), 1), "achieved_on": date_of[s["session_id"]]}
    return {"week_start": monday.isoformat(),
            "muscles": sorted(muscles.values(), key=lambda m: (-m["volume_kg"], -m["sets"], m["muscle_group"])),
            "sessions_this_week": len(this_ids), "planned_sessions": planned,
            "streak": sk.streak(sk.finished_workout_days(sessions), today), "last_pr": last_pr}
