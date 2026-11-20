from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.services import nutrition_engine as ne
from app.services import nutrition_insights as ni
from app.services.ai_data import load_prefs, require_profile
from app.services.scanner import nutrients_from_row

router = APIRouter(prefix="/v1/nutrition", tags=["nutrition"])


def _consumed(meals: list[dict]) -> dict:
    n = ne.sum_nutrients([nutrients_from_row(i) for m in meals for i in (m.get("meal_items") or [])])
    return {"kcal": n.kcal, "protein_g": n.protein_g, "carbs_g": n.carbs_g, "fat_g": n.fat_g, "fiber_g": n.fiber_g or 0.0}


@router.get("/insights")
async def nutrition_insights(day: date = Query(alias="date"), hour: int | None = Query(None, ge=0, le=23),
                             user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    p = await require_profile(db, user.id, need_targets=True)
    targets = {"kcal": float(p["target_kcal"]), "protein_g": float(p["target_protein_g"]), "carbs_g": float(p["target_carbs_g"]),
               "fat_g": float(p["target_fat_g"]), "fiber_g": float(p.get("target_fiber_g") or 25)}
    water_target = float(p.get("target_water_ml") or 2000)
    start = day - timedelta(days=6)
    rng = [f"gte.{start.isoformat()}", f"lte.{day.isoformat()}"]
    meals = await db.select("meal_logs", select="id,log_date,meal_items(*)", user_id=f"eq.{user.id}", log_date=rng)
    water = await db.select("hydration_logs", select="amount_ml,log_date,counts_toward_goal", user_id=f"eq.{user.id}", log_date=rng)
    by_meals: dict[str, list[dict]] = {}
    for m in meals:
        by_meals.setdefault(str(m["log_date"])[:10], []).append(m)
    by_water: dict[str, float] = {}
    for w in water:
        if w.get("counts_toward_goal", True):
            k = str(w["log_date"])[:10]
            by_water[k] = by_water.get(k, 0.0) + float(w["amount_ml"])

    def day_score(d: str):
        ms = by_meals.get(d, [])
        logged = any(m.get("meal_items") for m in ms)
        c = _consumed(ms)
        return c, logged, ni.score_day(c, targets, by_water.get(d, 0.0), water_target, logged)

    trend = []
    for i in range(7):
        d = (start + timedelta(days=i)).isoformat()
        c, logged, s = day_score(d)
        trend.append({"date": d, "score": s["score"], "kcal": round(c["kcal"]) if logged else None})
    d0 = day.isoformat()
    c, logged, s = day_score(d0)
    scored = [t["score"] for t in trend if t["score"] is not None]
    water_ml = by_water.get(d0, 0.0)
    if logged:
        diet = (await load_prefs(db, user.id)).get("diet_type") or "non_vegetarian"
        tips = ni.insights(c, targets, water_ml, water_target, diet, hour)
    else:
        tips = [{"key": "empty", "severity": "info", "title": "Nothing logged yet",
                 "body": "Log a meal to see your score and personalised tips."}]
    return {"date": d0, "logged": logged, "score": s["score"], "grade": ni.grade(s["score"]), "subscores": s["subscores"],
            "insights": tips, "consumed": c, "targets": targets, "water_ml": water_ml, "water_target_ml": water_target,
            "trend": trend, "trend_avg": round(sum(scored) / len(scored)) if scored else None}
