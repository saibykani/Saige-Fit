"""Food scan pipeline: vision model IDENTIFIES foods + estimates grams; nutrition values come
exclusively from database records via nutrition_engine. Nothing here invents calories."""
from __future__ import annotations

import base64
import difflib
import json
import re
from typing import Protocol

from pydantic import BaseModel, Field, ValidationError

from app.services.nutrition_engine import Nutrients

ALLOWED_TYPES = {"image/jpeg": b"\xff\xd8\xff", "image/png": b"\x89PNG", "image/webp": b"RIFF"}
MATCH_THRESHOLD = 0.55

PROMPT = (
    "You are a food identification assistant. Look at the photo and list every distinct food item "
    "visible. For each, estimate the portion in grams (a rough visual estimate), note the likely cooking "
    "method, and give a confidence from 0 to 1. Set ambiguous=true if you cannot tell what the item is "
    "or it could be one of several different foods. Do NOT give calories or nutrition values. "
    'Respond with JSON only: {"items":[{"name":str,"estimated_grams":number,"confidence":number,'
    '"ambiguous":bool,"cooking_method":str|null,"notes":str|null}]}. If there is no food, return {"items":[]}.'
)


class DetectedItem(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    estimated_grams: float = Field(gt=0, le=3000)
    confidence: float = Field(ge=0, le=1)
    ambiguous: bool = False
    cooking_method: str | None = None
    notes: str | None = None


class VisionClient(Protocol):
    async def identify(self, image: bytes, media_type: str) -> list[DetectedItem]: ...


def validate_image(data: bytes, content_type: str | None, max_mb: int) -> str:
    """Return the verified media type or raise ValueError. Checks size and magic bytes,
    not just the client-supplied content type."""
    if not content_type or content_type not in ALLOWED_TYPES:
        raise ValueError("Unsupported image type (use JPEG, PNG or WebP)")
    if not data:
        raise ValueError("Empty file")
    if len(data) > max_mb * 1024 * 1024:
        raise ValueError(f"Image larger than {max_mb} MB")
    if not data.startswith(ALLOWED_TYPES[content_type]):
        raise ValueError("File content does not match its declared type")
    if content_type == "image/webp" and data[8:12] != b"WEBP":
        raise ValueError("File content does not match its declared type")
    return content_type


def parse_items(text: str) -> list[DetectedItem]:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        raw = json.loads(text)["items"]
    except (ValueError, KeyError, TypeError):
        raise ValueError("Model returned an unreadable response")
    items = []
    for r in raw[:20]:
        try:
            items.append(DetectedItem.model_validate(r))
        except ValidationError:
            continue  # drop malformed/implausible entries rather than trusting them
    return items


class ClaudeVision:
    def __init__(self, api_key: str, model: str):
        from anthropic import AsyncAnthropic
        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model

    async def identify(self, image: bytes, media_type: str) -> list[DetectedItem]:
        msg = await self._client.messages.create(
            model=self._model, max_tokens=1024,
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                              "data": base64.b64encode(image).decode()}},
                {"type": "text", "text": PROMPT}]}],
        )
        return parse_items("".join(b.text for b in msg.content if b.type == "text"))


# ---------- matching to the food database ----------
_STOP = {"cooked", "boiled", "fried", "plain", "with", "and", "of", "the", "a", "curry"}


def _tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z]+", s.lower()) if t not in _STOP}


def match_score(query: str, candidate: str) -> float:
    q, c = _tokens(query), _tokens(candidate)
    if q and q <= c:
        # every word the model named appears in the DB name ("dal" -> "Dal (toor...)")
        return 0.8 + 0.2 * len(q) / len(c)
    overlap = len(q & c) / len(q | c) if q and c else 0.0
    ratio = difflib.SequenceMatcher(None, query.lower(), candidate.lower()).ratio()
    return 0.5 * overlap + 0.5 * ratio if overlap else ratio * 0.8


def best_match(name: str, catalog: list[dict]) -> tuple[dict | None, float]:
    best, score = None, 0.0
    for f in catalog:
        sc = match_score(name, f["name"])
        if sc > score:
            best, score = f, sc
    return (best, score) if score >= MATCH_THRESHOLD else (None, score)


def nutrients_from_row(row: dict) -> Nutrients:
    def opt(k):
        return None if row.get(k) is None else float(row[k])
    return Nutrients(kcal=float(row["kcal"]), protein_g=float(row["protein_g"]),
                     carbs_g=float(row["carbs_g"]), fat_g=float(row["fat_g"]),
                     sat_fat_g=opt("sat_fat_g"), fiber_g=opt("fiber_g"),
                     sugar_g=opt("sugar_g"), sodium_mg=opt("sodium_mg"))


def resolve(items: list[DetectedItem], catalog: list[dict], allergens: set[str]) -> list[dict]:
    """catalog rows: food_items fields + nested food_nutrition (dict). Returns editable results."""
    out = []
    for it in items:
        food, score = best_match(it.name, catalog)
        entry = {
            "detected_name": it.name, "grams": it.estimated_grams, "confidence": it.confidence,
            "cooking_method": it.cooking_method, "is_estimate": True,
            "needs_confirmation": it.ambiguous or it.confidence < 0.6 or food is None or score < 0.75,
            "food_id": None, "name": it.name, "nutrition": None, "allergen_warnings": [],
        }
        if food is not None:
            nut = food["food_nutrition"]
            nut = nut[0] if isinstance(nut, list) else nut
            n = nutrients_from_row(nut).scaled(it.estimated_grams)
            entry.update(food_id=food["id"], name=food["name"], nutrition=n.__dict__,
                         allergen_warnings=sorted(allergens & set(food.get("allergens") or [])))
        out.append(entry)
    return out
