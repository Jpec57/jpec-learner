import uuid
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.core.permissions import assert_owner, assert_visible
from app.db.base import get_db
from app.models.card import Card
from app.models.category import Category
from app.models.hierarchy import SIBLING_TITLE_UNIQUE_CONSTRAINT, UNCLASSIFIED_NODE_TITLE, HierarchyNode, Lesson
from app.models.review import ReviewState
from app.models.user import User
from app.schemas.hierarchy import (
    AncestorOut,
    ChildCountsOut,
    HierarchyNodeCreate,
    HierarchyNodeFlatOut,
    HierarchyNodeMove,
    HierarchyNodeOut,
    HierarchyNodePageOut,
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

    child_kind_rows = await db.execute(
        select(HierarchyNode.parent_id, HierarchyNode.node_kind, func.count())
        .where(HierarchyNode.parent_id.in_(ids))
        .group_by(HierarchyNode.parent_id, HierarchyNode.node_kind)
    )
    counts_by_parent: dict[uuid.UUID, ChildCountsOut] = {}
    for parent_id, node_kind, count in child_kind_rows.all():
        counts = counts_by_parent.setdefault(parent_id, ChildCountsOut())
        if node_kind == "group":
            counts.groups = count
        else:
            counts.lessons = count

    card_count_rows = await db.execute(
        select(Card.lesson_node_id, func.count())
        .where(Card.lesson_node_id.in_(ids), Card.deleted_at.is_(None))
        .group_by(Card.lesson_node_id)
    )
    for node_id, count in card_count_rows.all():
        counts_by_parent.setdefault(node_id, ChildCountsOut()).cards = count

    out = []
    for node in nodes:
        item = HierarchyNodeOut.model_validate(node)
        node_counts = counts_by_parent.get(node.id, ChildCountsOut())
        item.has_children = node_counts.groups > 0 or node_counts.lessons > 0
        item.child_counts = node_counts
        if node.lesson is not None:
            item.body_markdown = node.lesson.body_markdown
            item.exclude_from_review = node.lesson.exclude_from_review
        out.append(item)
    return out


def _labels_to_uuids(path: str) -> list[uuid.UUID]:
    return [uuid.UUID(hex=label) for label in path.split(".")]


async def _ancestors_for(db: AsyncSession, node: HierarchyNode) -> list[AncestorOut]:
    """Derived from the ltree path (dot-separated hex UUID labels, see
    services/hierarchy.child_path) rather than walking parent_id repeatedly --
    one query regardless of depth."""
    ancestor_ids = _labels_to_uuids(node.path)[:-1]
    if not ancestor_ids:
        return []
    rows = await db.execute(select(HierarchyNode.id, HierarchyNode.title).where(HierarchyNode.id.in_(ancestor_ids)))
    titles_by_id = {row.id: row.title for row in rows.all()}
    return [AncestorOut(id=aid, title=titles_by_id[aid]) for aid in ancestor_ids if aid in titles_by_id]


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


@router.get("/search", response_model=HierarchyNodePageOut)
async def search_lessons(
    category_id: uuid.UUID,
    search: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Search lesson nodes (title/description/content) across the whole
    category -- the search-page counterpart to /cards for "find any lesson in
    this deck", kept to node_kind='lesson' since groups are just
    organizational folders, not content someone would search the text of."""
    category = await _get_category_or_404(db, category_id)
    assert_visible(category, current_user.id)

    query = (
        select(HierarchyNode)
        .join(Lesson, Lesson.id == HierarchyNode.id)
        .where(HierarchyNode.category_id == category_id, HierarchyNode.node_kind == "lesson")
    )
    if category.owner_id != current_user.id:
        query = query.where(HierarchyNode.is_public.is_(True))
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                HierarchyNode.title.ilike(pattern),
                HierarchyNode.description.ilike(pattern),
                Lesson.body_markdown.ilike(pattern),
            )
        )

    total = await db.scalar(select(func.count()).select_from(query.subquery()))

    page_query = (
        query.options(selectinload(HierarchyNode.lesson), selectinload(HierarchyNode.images))
        .order_by(HierarchyNode.title)
        .limit(limit)
        .offset(offset)
    )
    nodes = (await db.scalars(page_query)).all()
    items = await _with_has_children(db, list(nodes))
    for item, node in zip(items, nodes):
        item.ancestors = await _ancestors_for(db, node)
    return HierarchyNodePageOut(items=items, total=total or 0)


@router.get("/{node_id}", response_model=HierarchyNodeOut)
async def get_node(
    node_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = await _get_node_or_404(db, node_id)
    assert_visible(node, current_user.id)
    out = (await _with_has_children(db, [node]))[0]
    out.ancestors = await _ancestors_for(db, node)
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
            db.add(
                Lesson(
                    id=node.id,
                    body_markdown=payload.body_markdown,
                    exclude_from_review=payload.exclude_from_review,
                )
            )
            await db.flush()
            if not payload.exclude_from_review:
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
    if payload.exclude_from_review is not None:
        if node.lesson is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Node is not a lesson")
        node.lesson.exclude_from_review = payload.exclude_from_review
        if payload.exclude_from_review:
            # Drop everyone's review state for it so it leaves the due queue,
            # upcoming/insights lists and progression counts in one go.
            await db.execute(delete(ReviewState).where(ReviewState.lesson_node_id == node.id))
        else:
            await ensure_review_state(db, user_id=current_user.id, lesson_node_id=node.id)

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
