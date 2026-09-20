import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.routes.categories import _get_category_or_404
from app.core.deps import get_current_user
from app.core.permissions import assert_owner, assert_visible
from app.db.base import get_db
from app.models.user import User
from app.schemas.plan import PlanOut, PlanProgressOut, PlanUpdate
from app.services.plan import compute_plan_progress

router = APIRouter(prefix="/categories", tags=["plan"])


@router.get("/{category_id}/plan", response_model=PlanOut)
async def get_plan(
    category_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await _get_category_or_404(db, category_id)
    assert_visible(category, current_user.id)
    return PlanOut(goal=category.goal, plan_markdown=category.plan_markdown)


@router.put("/{category_id}/plan", response_model=PlanOut)
async def update_plan(
    category_id: uuid.UUID,
    payload: PlanUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await _get_category_or_404(db, category_id)
    assert_visible(category, current_user.id)
    assert_owner(category, current_user.id)

    # Nullable and independently editable: only fields that were sent change,
    # and an explicit null (or blank text) clears one.
    if "goal" in payload.model_fields_set:
        category.goal = (payload.goal or "").strip() or None
    if "plan_markdown" in payload.model_fields_set:
        category.plan_markdown = payload.plan_markdown if (payload.plan_markdown or "").strip() else None

    await db.commit()
    await db.refresh(category)
    return PlanOut(goal=category.goal, plan_markdown=category.plan_markdown)


@router.get("/{category_id}/plan/progress", response_model=PlanProgressOut)
async def get_plan_progress(
    category_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await _get_category_or_404(db, category_id)
    assert_visible(category, current_user.id)
    return await compute_plan_progress(
        db,
        user_id=current_user.id,
        category_id=category.id,
        goal=category.goal,
        plan_markdown=category.plan_markdown,
    )
