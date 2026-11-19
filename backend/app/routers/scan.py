from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from app.core.auth import CurrentUser, current_user
from app.core.config import Settings, get_settings
from app.core.db import Rest, get_db
from app.core.limits import AI_LIMIT, limiter
from app.services import scanner
from app.services.entitlements import require_feature

router = APIRouter(prefix="/v1", tags=["scan"])

DISCLAIMER = ("Estimates from a photo. Portions and ingredients can't be measured exactly, so please "
              "check and adjust each item before saving.")


def get_vision(s: Settings = Depends(get_settings)) -> scanner.VisionClient:
    if not s.anthropic_api_key:
        raise HTTPException(503, "Food recognition is not configured")
    return scanner.ClaudeVision(s.anthropic_api_key, s.vision_model)


@router.post("/scan")
@limiter.limit(AI_LIMIT)
async def scan_food(request: Request, image: UploadFile = File(...),
                    user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db),
                    vision: scanner.VisionClient = Depends(get_vision),
                    s: Settings = Depends(get_settings)):
    await require_feature(db, user.id, "ai_food_scan")
    me = await db.select("users", select="ai_consent_at", id=f"eq.{user.id}")
    if not me or not me[0]["ai_consent_at"]:
        raise HTTPException(403, "Please accept AI data processing before scanning food")

    data = await image.read(s.max_upload_mb * 1024 * 1024 + 1)  # bounded read
    try:
        media = scanner.validate_image(data, image.content_type, s.max_upload_mb)
    except ValueError as e:
        raise HTTPException(422, str(e))

    try:
        detected = await vision.identify(data, media)
    except ValueError:
        raise HTTPException(502, "Could not understand the recognition result; please retry")
    except Exception:
        raise HTTPException(502, "Food recognition is temporarily unavailable")

    catalog = await db.select("food_items", select="id,name,allergens,food_nutrition(*)", limit="1000")
    prefs = await db.select("dietary_preferences", select="allergens", user_id=f"eq.{user.id}")
    allergens = {a.lower() for a in (prefs[0]["allergens"] if prefs else [])}
    results = scanner.resolve(detected, catalog, allergens)

    row = (await db.insert("food_scans", {"user_id": user.id, "status": "done", "model": s.vision_model,
                                          "raw_result": {"items": [d.model_dump() for d in detected]}}))[0]
    return {"scan_id": row["id"], "items": results, "disclaimer": DISCLAIMER,
            "empty": len(results) == 0}
