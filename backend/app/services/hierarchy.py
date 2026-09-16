import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hierarchy import HierarchyNode


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
