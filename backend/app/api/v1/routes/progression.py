import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.permissions import assert_visible
from app.db.base import get_db
from app.models.category import Category
from app.models.hierarchy import HierarchyNode
from app.models.level import LevelDefinition
from app.models.user import User
from app.schemas.progression import ProgressionOut, ThemeProgressOut
from app.schemas.review import LevelDefinitionOut
from app.services.progression import category_totals, compute_streak, level_distribution, theme_rollup

router = APIRouter(prefix="/progression", tags=["progression"])


@router.get("/levels", response_model=list[LevelDefinitionOut])
async def list_levels(db: AsyncSession = Depends(get_db)):
    result = await db.scalars(select(LevelDefinition).order_by(LevelDefinition.level))
    return result.all()


@router.get("/categories/{category_id}", response_model=ProgressionOut)
async def get_category_progression(
    category_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await db.get(Category, category_id)
    if category is None or category.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    assert_visible(category, current_user.id)

    roots_query = select(HierarchyNode).where(
        HierarchyNode.category_id == category_id, HierarchyNode.parent_id.is_(None)
    )
    if category.owner_id != current_user.id:
        roots_query = roots_query.where(HierarchyNode.is_public.is_(True))
    roots = (await db.scalars(roots_query.order_by(HierarchyNode.order_index))).all()

    themes = []
    for root in roots:
        rollup = await theme_rollup(
            db, user_id=current_user.id, root_node_id=root.id, root_path=root.path
        )
        themes.append(
            ThemeProgressOut(
                node_id=root.id,
                title=root.title,
                total_items=rollup["total_items"],
                avg_level=rollup["avg_level"],
                due_count=rollup["due_count"],
            )
        )

    totals = await category_totals(db, user_id=current_user.id, category_id=category_id)
    streak_days = await compute_streak(db, user_id=current_user.id)
    levels = await level_distribution(db, user_id=current_user.id, category_id=category_id)

    return ProgressionOut(
        category_id=category_id,
        streak_days=streak_days,
        total_items=totals["total_items"],
        total_due=totals["total_due"],
        themes=themes,
        level_distribution=levels,
    )


@router.get("/nodes/{node_id}", response_model=ThemeProgressOut)
async def get_node_progression(
    node_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Same rollup as a category's root-level themes, but for any node --
    lets the frontend mirror the Explorer tree and show progress per group,
    fetched lazily as each node is expanded."""
    node = await db.get(HierarchyNode, node_id)
    if node is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")
    assert_visible(node, current_user.id)

    rollup = await theme_rollup(db, user_id=current_user.id, root_node_id=node.id, root_path=node.path)
    return ThemeProgressOut(
        node_id=node.id,
        title=node.title,
        total_items=rollup["total_items"],
        avg_level=rollup["avg_level"],
        due_count=rollup["due_count"],
    )
