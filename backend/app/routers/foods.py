from fastapi import APIRouter, Depends, Query

from app.core.auth import CurrentUser, current_user
from app.core.db import Rest, get_db

router = APIRouter(prefix="/v1/foods", tags=["foods"])


@router.get("/search")
async def search_foods(q: str = Query(min_length=2, max_length=60), limit: int = Query(20, ge=1, le=50),
                       _: CurrentUser = Depends(current_user), db: Rest = Depends(get_db)):
    safe = "".join(ch for ch in q if ch.isalnum() or ch in " -")  # strip PostgREST filter metacharacters
    if not safe.strip():
        return {"items": []}
    rows = await db.select("food_items", select="id,name,serving_label,grams_per_unit,default_serving_g,"
                           "allergens,diet_tags,food_nutrition(kcal,protein_g,carbs_g,fat_g,fiber_g)",
                           name=f"ilike.*{safe.strip()}*", order="name", limit=str(limit))
    return {"items": rows}
