import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.permissions import assert_owner, assert_visible
from app.core.slugify import slugify
from app.db.base import get_db
from app.models.category import Category
from app.models.user import User
from app.schemas.category import CategoryCreate, CategoryOut, CategoryUpdate
from app.services.progression import bulk_due_counts

router = APIRouter(prefix="/categories", tags=["categories"])


async def _get_category_or_404(db: AsyncSession, category_id: uuid.UUID) -> Category:
    category = await db.get(Category, category_id)
    if category is None or category.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


async def _unique_slug(db: AsyncSession, base_slug: str) -> str:
    slug = base_slug
    suffix = 1
    while await db.scalar(select(Category).where(Category.slug == slug)):
        suffix += 1
        slug = f"{base_slug}-{suffix}"
    return slug


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    scope: Literal["mine", "public"] = Query("mine"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Category).where(Category.deleted_at.is_(None))
    if scope == "mine":
        query = query.where(Category.owner_id == current_user.id)
    else:
        query = query.where(Category.is_public.is_(True), Category.owner_id != current_user.id)
    query = query.order_by(Category.created_at)
    categories = (await db.scalars(query)).all()

    due_counts = await bulk_due_counts(db, user_id=current_user.id, category_ids=[c.id for c in categories])
    return [
        CategoryOut.model_validate(c).model_copy(update={"due_count": due_counts.get(c.id, 0)})
        for c in categories
    ]


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: CategoryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base_slug = slugify(payload.slug or payload.name)
    slug = await _unique_slug(db, base_slug)

    category = Category(
        slug=slug,
        name=payload.name,
        icon=payload.icon,
        owner_id=current_user.id,
        is_public=payload.is_public,
        theme_color=payload.theme_color,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


@router.get("/{category_id}", response_model=CategoryOut)
async def get_category(
    category_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await _get_category_or_404(db, category_id)
    assert_visible(category, current_user.id)
    due_counts = await bulk_due_counts(db, user_id=current_user.id, category_ids=[category.id])
    return CategoryOut.model_validate(category).model_copy(update={"due_count": due_counts.get(category.id, 0)})


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: uuid.UUID,
    payload: CategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await _get_category_or_404(db, category_id)
    assert_visible(category, current_user.id)
    assert_owner(category, current_user.id)

    if payload.name is not None:
        category.name = payload.name
    if payload.icon is not None:
        category.icon = payload.icon
    if payload.is_public is not None:
        category.is_public = payload.is_public
    if "theme_color" in payload.model_fields_set:
        category.theme_color = payload.theme_color

    await db.commit()
    await db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await _get_category_or_404(db, category_id)
    assert_visible(category, current_user.id)
    assert_owner(category, current_user.id)

    category.deleted_at = datetime.now(timezone.utc)
    await db.commit()
