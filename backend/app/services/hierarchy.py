import uuid

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hierarchy import UNCLASSIFIED_NODE_TITLE, HierarchyNode


def label_for(node_id: uuid.UUID) -> str:
    """Ltree labels can't contain hyphens, so use the UUID's hex form."""
    return node_id.hex


def child_path(parent_path: str | None, node_id: uuid.UUID) -> str:
    label = label_for(node_id)
    return f"{parent_path}.{label}" if parent_path else label


async def is_descendant_or_self(db: AsyncSession, ancestor_path: str, candidate_path: str) -> bool:
    """True if candidate_path is ancestor_path or lies underneath it."""
    result = await db.execute(
        text("SELECT (:candidate)::ltree <@ (:ancestor)::ltree"),
        {"candidate": candidate_path, "ancestor": ancestor_path},
    )
    return bool(result.scalar())


async def reparent_subtree(
    db: AsyncSession,
    node: HierarchyNode,
    new_parent_path: str | None,
    new_parent_id: uuid.UUID | None,
) -> None:
    """Move `node` (and, via ltree prefix rewrite, its whole subtree) under a new parent."""
    old_path = node.path
    new_path = child_path(new_parent_path, node.id)

    if new_path != old_path:
        # Rewrite every descendant's path prefix first, while their (and the node's own,
        # excluded here) paths still reflect the pre-move tree.
        await db.execute(
            text(
                """
                UPDATE hierarchy_nodes
                SET path = ((:new_path)::ltree || subpath(path, nlevel((:old_path)::ltree)))
                WHERE path <@ (:old_path)::ltree
                  AND id != :node_id
                  AND category_id = :category_id
                """
            ),
            {
                "new_path": new_path,
                "old_path": old_path,
                "node_id": node.id,
                "category_id": node.category_id,
            },
        )
        node.path = new_path

    node.parent_id = new_parent_id


async def get_or_create_unclassified_node(
    db: AsyncSession, *, category_id: uuid.UUID, owner_id: uuid.UUID
) -> HierarchyNode:
    """Get-or-create the reserved root group that cards attach to when the
    learner doesn't pick a specific lesson/group -- so every card always
    belongs to a real, browsable hierarchy node instead of being an
    untethered "independent card". Title is reserved: see
    UNCLASSIFIED_NODE_TITLE and its validation in the hierarchy routes."""
    existing = await db.scalar(
        select(HierarchyNode).where(
            HierarchyNode.category_id == category_id,
            HierarchyNode.parent_id.is_(None),
            HierarchyNode.title == UNCLASSIFIED_NODE_TITLE,
        )
    )
    if existing is not None:
        return existing

    order_index = await db.scalar(
        select(func.coalesce(func.max(HierarchyNode.order_index), -1) + 1).where(
            HierarchyNode.category_id == category_id, HierarchyNode.parent_id.is_(None)
        )
    )
    node = HierarchyNode(
        category_id=category_id,
        parent_id=None,
        path="",
        node_kind="group",
        title=UNCLASSIFIED_NODE_TITLE,
        order_index=order_index,
        owner_id=owner_id,
    )
    node.id = uuid.uuid4()
    node.path = child_path(None, node.id)
    db.add(node)
    await db.flush()
    return node
