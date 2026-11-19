from datetime import date, datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AfterValidator, BaseModel, Field, field_validator

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db
from app.routers.profile import TargetsResponse
from app.services import account as acct
from app.services import fitness_engine as fe

router = APIRouter(prefix="/v1", tags=["me"])


def _clean_list(v: list[str]) -> list[str]:
    seen, out = set(), []
    for x in v:
        x = x.strip()
        if x and x.lower() not in seen:
            seen.add(x.lower())
            out.append(x)
    return out


Tags = Annotated[list[Annotated[str, Field(min_length=1, max_length=60)]], Field(max_length=30), AfterValidator(_clean_list)]
Experience = Literal["beginner", "intermediate", "advanced"]
Env = Literal["gym", "home", "outdoor", "gym_home"]
DietType = Literal["vegetarian", "vegan", "eggetarian", "non_vegetarian", "pescatarian"]
HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"

PROFILE_FIELDS = ("date_of_birth", "gender", "country", "language", "height_cm", "weight_kg", "target_weight_kg",
                  "body_fat_pct", "waist_cm", "activity_level", "sleep_hours", "workout_env", "experience",
                  "training_days", "workout_minutes", "workout_days", "preferred_workout_time", "equipment", "injuries")
DIET_FIELDS = ("diet_type", "allergies", "intolerances", "restrictions", "liked_foods", "disliked_foods",
               "cuisines", "meals_per_day", "monthly_budget")


class OnboardingIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    date_of_birth: date
    gender: fe.Gender = fe.Gender.unspecified
    country: str | None = Field(default=None, max_length=60)
    language: str = Field(default="en", min_length=2, max_length=10)
    height_cm: float = Field(ge=80, le=250)
    weight_kg: float = Field(ge=25, le=400)
    target_weight_kg: float | None = Field(default=None, ge=25, le=400)
    body_fat_pct: float | None = Field(default=None, ge=2, le=70)
    waist_cm: float | None = Field(default=None, ge=30, le=250)
    goal: fe.Goal
    activity_level: fe.Activity
    sleep_hours: float | None = Field(default=None, ge=2, le=14)
    experience: Experience = "beginner"
    workout_env: Env = "gym"
    training_days: int = Field(ge=1, le=7)
    workout_days: list[Annotated[int, Field(ge=1, le=7)]] = Field(default_factory=list, max_length=7)
    workout_minutes: int = Field(default=45, ge=10, le=180)
    preferred_workout_time: str | None = Field(default=None, pattern=HHMM)
    equipment: Tags = []
    injuries: Tags = []
    diet_type: DietType = "non_vegetarian"
    allergies: Tags = []
    intolerances: Tags = []
    restrictions: Tags = []
    liked_foods: Tags = []
    disliked_foods: Tags = []
    cuisines: Tags = ["indian"]
    meals_per_day: int = Field(default=4, ge=2, le=7)
    monthly_budget: float | None = Field(default=None, ge=0, le=10_000_000)
    privacy_consent: bool
    ai_consent: bool = False
    log_date: date | None = None  # client-local "today" for the first weight log (defaults to server date)

    @field_validator("date_of_birth")
    @classmethod
    def _dob(cls, v: date):
        if v >= date.today():
            raise ValueError("date_of_birth must be in the past")
        return v

    @field_validator("workout_days")
    @classmethod
    def _days(cls, v: list[int]):
        return sorted(set(v))


class ProfileUpdate(BaseModel):
    """Any onboarding field except consents; only provided fields are changed."""
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    date_of_birth: date | None = None
    gender: fe.Gender | None = None
    country: str | None = Field(default=None, max_length=60)
    language: str | None = Field(default=None, min_length=2, max_length=10)
    height_cm: float | None = Field(default=None, ge=80, le=250)
    weight_kg: float | None = Field(default=None, ge=25, le=400)
    target_weight_kg: float | None = Field(default=None, ge=25, le=400)
    body_fat_pct: float | None = Field(default=None, ge=2, le=70)
    waist_cm: float | None = Field(default=None, ge=30, le=250)
    goal: fe.Goal | None = None
    activity_level: fe.Activity | None = None
    sleep_hours: float | None = Field(default=None, ge=2, le=14)
    experience: Experience | None = None
    workout_env: Env | None = None
    training_days: int | None = Field(default=None, ge=1, le=7)
    workout_days: list[Annotated[int, Field(ge=1, le=7)]] | None = Field(default=None, max_length=7)
    workout_minutes: int | None = Field(default=None, ge=10, le=180)
    preferred_workout_time: str | None = Field(default=None, pattern=HHMM)
    equipment: Tags | None = None
    injuries: Tags | None = None
    diet_type: DietType | None = None
    allergies: Tags | None = None
    intolerances: Tags | None = None
    restrictions: Tags | None = None
    liked_foods: Tags | None = None
    disliked_foods: Tags | None = None
    cuisines: Tags | None = None
    meals_per_day: int | None = Field(default=None, ge=2, le=7)
    monthly_budget: float | None = Field(default=None, ge=0, le=10_000_000)

    @field_validator("date_of_birth")
    @classmethod
    def _dob(cls, v):
        if v is not None and v >= date.today():
            raise ValueError("date_of_birth must be in the past")
        return v


def _json(v):
    return v.isoformat() if isinstance(v, date) else (v.value if hasattr(v, "value") else v)


def _targets_response(t: fe.Targets) -> dict:
    return TargetsResponse(
        bmi=t.bmi, bmi_category=t.bmi_category, bmr_kcal=t.bmr_kcal, tdee_kcal=t.tdee_kcal,
        target_kcal=t.target_kcal, protein_g=t.protein_g, carbs_g=t.carbs_g, fat_g=t.fat_g,
        fiber_g=t.fiber_g, water_ml=t.water_ml, suggested_activity=t.suggested_activity, notes=t.notes,
    ).model_dump(mode="json")


@router.get("/me")
async def get_me(user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    uid = user.id
    users = await db.select("users", select="id,email,full_name,avatar_path,privacy_consent_at,ai_consent_at", id=f"eq.{uid}")
    prof = await db.select("user_profiles", select="*", user_id=f"eq.{uid}")
    diet = await db.select("dietary_preferences", select="*", user_id=f"eq.{uid}")
    sub = await acct.effective_subscription(db, uid)
    u = users[0] if users else {"id": uid, "email": user.email, "full_name": None, "avatar_path": None,
                                "privacy_consent_at": None, "ai_consent_at": None}
    profile = prof[0] if prof else None
    return {
        "user": u,
        "onboarded": bool(profile and profile.get("target_kcal") is not None),
        "profile": profile,
        "goal": await acct.primary_goal(db, uid),
        "diet": diet[0] if diet else None,
        "tier": sub["tier"],
        "entitlements": sub["entitlements"],
    }


@router.post("/onboarding")
async def onboarding(body: OnboardingIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    if not body.privacy_consent:
        raise HTTPException(422, "Privacy consent is required to use the app")
    uid = user.id
    data = body.model_dump(mode="json")
    profile_row = {k: data[k] for k in PROFILE_FIELDS}
    try:
        t = acct.targets_for(profile_row, body.goal.value)
    except ValueError as e:
        raise HTTPException(422, str(e))

    now = datetime.now(timezone.utc).isoformat()
    updated = await db.update("users", {"full_name": body.full_name, "privacy_consent_at": now,
                                        "ai_consent_at": now if body.ai_consent else None}, id=f"eq.{uid}")
    if not updated:
        raise HTTPException(409, "Account is not ready yet; please try again in a moment")

    await db.upsert("user_profiles", {"user_id": uid, **profile_row, **acct.target_columns(t),
                                      "water_target_custom": False}, on_conflict="user_id")
    await acct.set_primary_goal(db, uid, body.goal.value)
    await db.upsert("dietary_preferences", {"user_id": uid, **{k: data[k] for k in DIET_FIELDS}}, on_conflict="user_id")
    await db.upsert("weight_logs", {"user_id": uid, "weight_kg": body.weight_kg,
                                    "log_date": (body.log_date or date.today()).isoformat()}, on_conflict="user_id,log_date")
    return {"targets": _targets_response(t)}


@router.put("/profile")
async def update_profile(body: ProfileUpdate, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    uid = user.id
    changes = body.model_dump(mode="json", exclude_unset=True)
    prof = await db.select("user_profiles", select="*", user_id=f"eq.{uid}")
    if not prof:
        raise HTTPException(409, "Complete onboarding first")
    if not changes:
        raise HTTPException(422, "No fields to update")
    for k in ("date_of_birth", "gender", "height_cm", "weight_kg", "activity_level", "goal", "training_days"):
        if k in changes and changes[k] is None:
            raise HTTPException(422, f"{k} cannot be cleared")

    merged = {**prof[0], **{k: v for k, v in changes.items() if k in PROFILE_FIELDS}}
    goal = changes.get("goal") or await acct.primary_goal(db, uid)
    try:
        t = acct.targets_for(merged, goal)
    except ValueError as e:
        raise HTTPException(422, str(e))

    keep = prof[0].get("target_water_ml") if prof[0].get("water_target_custom") else None
    cols = {k: v for k, v in changes.items() if k in PROFILE_FIELDS}
    await db.update("user_profiles", {**cols, **acct.target_columns(t, keep_water_ml=keep)}, user_id=f"eq.{uid}")

    if "full_name" in changes:
        await db.update("users", {"full_name": changes["full_name"]}, id=f"eq.{uid}")
    if "goal" in changes:
        await acct.set_primary_goal(db, uid, changes["goal"])
    diet_cols = {k: v for k, v in changes.items() if k in DIET_FIELDS}
    if diet_cols:
        await db.upsert("dietary_preferences", {"user_id": uid, **diet_cols}, on_conflict="user_id")
    return {"targets": _targets_response(t)}


class ConsentIn(BaseModel):
    ai: bool


@router.post("/consent")
async def set_consent(body: ConsentIn, user: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    ts = datetime.now(timezone.utc).isoformat() if body.ai else None
    rows = await db.update("users", {"ai_consent_at": ts}, id=f"eq.{user.id}")
    if not rows:
        raise HTTPException(409, "Account is not ready yet; please try again in a moment")
    return {"ai_consent_at": ts}
