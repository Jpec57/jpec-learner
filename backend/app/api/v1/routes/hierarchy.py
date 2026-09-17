import uuid
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.core.permissions import assert_owner, assert_visible
from app.db.base import get_db
from app.models.category import Category
from app.models.hierarchy import SIBLING_TITLE_UNIQUE_CONSTRAINT, UNCLASSIFIED_NODE_TITLE, HierarchyNode, Lesson
from app.models.user import User
from app.schemas.hierarchy import (
    HierarchyNodeCreate,
    HierarchyNodeFlatOut,
    HierarchyNodeMove,
    HierarchyNodeOut,
    HierarchyNodeUpdate,
)
from app.services.enrollment import ensure_review_state
from app.services.hierarchy import child_path, is_descendant_or_self, reparent_subtree

router = APIRouter(prefix="/hierarchy", tags=["hierarchy"])


async def _get_category_or_404(db: AsyncSession, category_id: uuid.UUID) -> Category:
    category = await db.get(Category, category_id)
    if category is None or category.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


async def _get_node_or_404(db: AsyncSession, node_id: uuid.UUID) -> HierarchyNode:
    node = await db.get(
        HierarchyNode,
        node_id,
        options=[selectinload(HierarchyNode.lesson), selectinload(HierarchyNode.images)],
    )
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    return node


@asynccontextmanager
async def _sibling_title_conflict_guard(db: AsyncSession):
    """Wraps a block that ends in a flush/commit, translating the sibling-title
    unique constraint into a 409 with a message the frontend can show directly.
    A context manager (not just a wrapped commit call) because SQLAlchemy can
    autoflush pending changes during an unrelated SELECT anywhere inside the
    block -- the constraint violation doesn't necessarily surface at the final
    explicit commit."""
    try:
        yield
    except IntegrityError as exc:
        await db.rollback()
        if SIBLING_TITLE_UNIQUE_CONSTRAINT in str(exc.orig):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "A group or lesson with this title already exists at this level.",
            ) from exc
        raise


def _assert_title_not_reserved(title: str, parent_id: uuid.UUID | None) -> None:
    """UNCLASSIFIED_NODE_TITLE is reserved for the auto-created bucket cards
    fall back to -- only at the root level, since that's the only scope
    get_or_create_unclassified_node looks in."""
    if parent_id is None and title.casefold() == UNCLASSIFIED_NODE_TITLE.casefold():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f'"{UNCLASSIFIED_NODE_TITLE}" is a reserved name at the top level.'
        )


async def _next_order_index(db: AsyncSession, category_id: uuid.UUID, parent_id: uuid.UUID | None) -> int:
    query = select(func.coalesce(func.max(HierarchyNode.order_index), -1) + 1).where(
        HierarchyNode.category_id == category_id
    )
    query = query.where(HierarchyNode.parent_id == parent_id) if parent_id else query.where(
        HierarchyNode.parent_id.is_(None)
    )
    return await db.scalar(query)


async def _with_has_children(db: AsyncSession, nodes: list[HierarchyNode]) -> list[HierarchyNodeOut]:
    if not nodes:
        return []
    ids = [n.id for n in nodes]
    result = await db.execute(
        select(HierarchyNode.parent_id)
        .where(HierarchyNode.parent_id.in_(ids))
        .distinct()
    )
    parents_with_children = {row[0] for row in result.all()}

    out = []
    for node in nodes:
        item = HierarchyNodeOut.model_validate(node)
        item.has_children = node.id in parents_with_children
        if node.lesson is not None:
            item.body_markdown = node.lesson.body_markdown
        out.append(item)
    return out


@router.get("", response_model=list[HierarchyNodeOut])
async def list_children(
    category_id: uuid.UUID,
    parent_id: uuid.UUID | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await _get_category_or_404(db, category_id)
    assert_visible(category, current_user.id)

    query = (
        select(HierarchyNode)
        .options(selectinload(HierarchyNode.lesson), selectinload(HierarchyNode.images))
        .where(HierarchyNode.category_id == category_id)
    )
    query = query.where(HierarchyNode.parent_id == parent_id) if parent_id else query.where(
        HierarchyNode.parent_id.is_(None)
    )

    if category.owner_id != current_user.id:
        query = query.where(HierarchyNode.is_public.is_(True))

    query = query.order_by(HierarchyNode.order_index)
    nodes = (await db.scalars(query)).all()
    return await _with_has_children(db, list(nodes))


@router.get("/flat", response_model=list[HierarchyNodeFlatOut])
async def list_flat(
    category_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Every node in the category, unnested -- for a "move to..." picker
    rather than the recursive expand/collapse Explorer tree."""
    category = await _get_category_or_404(db, category_id)
    assert_visible(category, current_user.id)

    query = select(HierarchyNode).where(HierarchyNode.category_id == category_id)
    if category.owner_id != current_user.id:
        query = query.where(HierarchyNode.is_public.is_(True))
    nodes = (await db.scalars(query.order_by(HierarchyNode.title))).all()
    return list(nodes)


@router.get("/{node_id}", response_model=HierarchyNodeOut)
async def get_node(
    node_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = await _get_node_or_404(db, node_id)
    assert_visible(node, current_user.id)
    out = (await _with_has_children(db, [node]))[0]
    return out


@router.post("", response_model=HierarchyNodeOut, status_code=status.HTTP_201_CREATED)
async def create_node(
    payload: HierarchyNodeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await _get_category_or_404(db, payload.category_id)
    assert_visible(category, current_user.id)
    assert_owner(category, current_user.id)

    parent: HierarchyNode | None = None
    if payload.parent_id is not None:
        parent = await _get_node_or_404(db, payload.parent_id)
        if parent.category_id != payload.category_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Parent must belong to the same category")
        if parent.node_kind != "group":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only group nodes can have children")

    _assert_title_not_reserved(payload.title, payload.parent_id)

    order_index = payload.order_index
    if order_index is None:
        order_index = await _next_order_index(db, payload.category_id, payload.parent_id)

    node = HierarchyNode(
        category_id=payload.category_id,
        parent_id=payload.parent_id,
        path="",  # placeholder, set below once we have node.id
        node_kind=payload.node_kind,
        title=payload.title,
        description=payload.description,
        order_index=order_index,
        owner_id=current_user.id,
        is_public=payload.is_public,
    )
    node.id = uuid.uuid4()
    node.path = child_path(parent.path if parent else None, node.id)
    db.add(node)

    async with _sibling_title_conflict_guard(db):
        if payload.node_kind == "lesson":
            db.add(Lesson(id=node.id, body_markdown=payload.body_markdown))
            await db.flush()
            await ensure_review_state(db, user_id=current_user.id, lesson_node_id=node.id)
        await db.commit()
    await db.refresh(node, attribute_names=["lesson", "images"])
    return (await _with_has_children(db, [node]))[0]


@router.patch("/{node_id}", response_model=HierarchyNodeOut)
async def update_node(
    node_id: uuid.UUID,
    payload: HierarchyNodeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = await _get_node_or_404(db, node_id)
    assert_visible(node, current_user.id)
    assert_owner(node, current_user.id)

    if payload.title is not None:
        _assert_title_not_reserved(payload.title, node.parent_id)
        node.title = payload.title
    if payload.description is not None:
        node.description = payload.description
    if payload.is_public is not None:
        node.is_public = payload.is_public
    if payload.body_markdown is not None:
        if node.lesson is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Node is not a lesson")
        node.lesson.body_markdown = payload.body_markdown

    async with _sibling_title_conflict_guard(db):
        await db.commit()
    await db.refresh(node, attribute_names=["lesson", "images"])
    return (await _with_has_children(db, [node]))[0]


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node(
    node_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = await _get_node_or_404(db, node_id)
    assert_visible(node, current_user.id)
    assert_owner(node, current_user.id)

    await db.delete(node)
    await db.commit()


@router.post("/{node_id}/move", response_model=HierarchyNodeOut)
async def move_node(
    node_id: uuid.UUID,
    payload: HierarchyNodeMove,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = await _get_node_or_404(db, node_id)
    assert_visible(node, current_user.id)
    assert_owner(node, current_user.id)

    new_parent: HierarchyNode | None = None
    if payload.new_parent_id is not None:
        if payload.new_parent_id == node.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A node cannot be its own parent")
        new_parent = await _get_node_or_404(db, payload.new_parent_id)
        if new_parent.category_id != node.category_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Parent must belong to the same category")
        if new_parent.node_kind != "group":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only group nodes can have children")
        if await is_descendant_or_self(db, node.path, new_parent.path):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot move a node under its own descendant")

    _assert_title_not_reserved(node.title, payload.new_parent_id)

    # Resolved before mutating `node` -- once its title/parent change, this SELECT
    # would trigger an autoflush that raises the conflict outside our try/except.
    new_order_index = payload.new_order_index
    if new_order_index is None:
        new_order_index = await _next_order_index(db, node.category_id, payload.new_parent_id)

    await reparent_subtree(
        db, node, new_parent.path if new_parent else None, payload.new_parent_id
    )
    node.order_index = new_order_index

    async with _sibling_title_conflict_guard(db):
        await db.commit()
    await db.refresh(node, attribute_names=["lesson", "images"])
    return (await _with_has_children(db, [node]))[0]
