from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, current_user
from app.services import fitness_engine as fe

router = APIRouter(prefix="/v1/profile", tags=["profile"])


class TargetsRequest(BaseModel):
    date_of_birth: date
    gender: fe.Gender = fe.Gender.unspecified
    weight_kg: float = Field(ge=25, le=400)
    height_cm: float = Field(ge=80, le=250)
    target_weight_kg: float | None = Field(default=None, ge=25, le=400)
    activity_level: fe.Activity
    goal: fe.Goal
    training_days: int = Field(default=3, ge=0, le=7)


class TargetsResponse(BaseModel):
    bmi: float
    bmi_category: str
    bmr_kcal: int
    tdee_kcal: int
    target_kcal: int
    protein_g: int
    carbs_g: int
    fat_g: int
    fiber_g: int
    water_ml: int
    suggested_activity: fe.Activity
    notes: list[str]
    disclaimer: str = (
        "Estimates for healthy adults based on standard formulas. "
        "Not medical advice; consult a professional for health conditions."
    )


@router.post("/targets", response_model=TargetsResponse)
def calculate_targets(body: TargetsRequest, _: CurrentUser = Depends(current_user)):
    """Onboarding step 7: personalised summary. Pure calculation, nothing stored yet."""
    try:
        t = fe.compute_targets(
            weight_kg=body.weight_kg,
            height_cm=body.height_cm,
            age=fe.age_from_dob(body.date_of_birth),
            gender=body.gender,
            activity=body.activity_level,
            goal=body.goal,
            training_days=body.training_days,
            target_weight_kg=body.target_weight_kg,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))
    return TargetsResponse(
        bmi=t.bmi, bmi_category=t.bmi_category, bmr_kcal=t.bmr_kcal, tdee_kcal=t.tdee_kcal,
        target_kcal=t.target_kcal, protein_g=t.protein_g, carbs_g=t.carbs_g, fat_g=t.fat_g,
        fiber_g=t.fiber_g, water_ml=t.water_ml, suggested_activity=t.suggested_activity,
        notes=t.notes,
    )
