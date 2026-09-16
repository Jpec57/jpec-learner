import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.core.permissions import assert_owner, assert_visible
from app.db.base import get_db
from app.models.category import Category
from app.models.hierarchy import HierarchyNode, Lesson
from app.models.user import User
from app.schemas.hierarchy import (
    HierarchyNodeCreate,
    HierarchyNodeMove,
    HierarchyNodeOut,
    HierarchyNodeUpdate,
)
from app.services.hierarchy import child_path, is_descendant_or_self, reparent_subtree

router = APIRouter(prefix="/hierarchy", tags=["hierarchy"])


async def _get_category_or_404(db: AsyncSession, category_id: uuid.UUID) -> Category:
    category = await db.get(Category, category_id)
    if category is None or category.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


async def _get_node_or_404(db: AsyncSession, node_id: uuid.UUID) -> HierarchyNode:
    node = await db.get(HierarchyNode, node_id, options=[selectinload(HierarchyNode.lesson)])
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    return node


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
        .options(selectinload(HierarchyNode.lesson))
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

    if payload.node_kind == "lesson":
        db.add(Lesson(id=node.id, body_markdown=payload.body_markdown))

    await db.commit()
    await db.refresh(node, attribute_names=["lesson"])
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
        node.title = payload.title
    if payload.description is not None:
        node.description = payload.description
    if payload.is_public is not None:
        node.is_public = payload.is_public
    if payload.body_markdown is not None:
        if node.lesson is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Node is not a lesson")
        node.lesson.body_markdown = payload.body_markdown

    await db.commit()
    await db.refresh(node, attribute_names=["lesson"])
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

    await reparent_subtree(
        db, node, new_parent.path if new_parent else None, payload.new_parent_id
    )

    if payload.new_order_index is not None:
        node.order_index = payload.new_order_index
    else:
        node.order_index = await _next_order_index(db, node.category_id, payload.new_parent_id)

    await db.commit()
    await db.refresh(node, attribute_names=["lesson"])
    return (await _with_has_children(db, [node]))[0]
