"""backfill unclassified node for independent cards

Revision ID: fbdf3e1aebf3
Revises: 7b6831d0073b
Create Date: 2026-09-17 14:42:33.171815

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'fbdf3e1aebf3'
down_revision: Union[str, None] = '7b6831d0073b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Every card must belong to a real hierarchy node going forward (see
    # get_or_create_unclassified_node) -- create one "Unclassified" root
    # group per affected category and reassign that category's previously
    # independent (lesson_node_id IS NULL) cards to it.
    op.execute(
        """
        INSERT INTO hierarchy_nodes
            (id, category_id, parent_id, path, node_kind, title, order_index, owner_id, is_public, created_at, updated_at)
        SELECT gen_id, category_id, NULL, replace(gen_id::text, '-', '')::ltree,
               'group', 'Unclassified', next_order, owner_id, false, now(), now()
        FROM (
            SELECT gen_random_uuid() AS gen_id, cn.category_id, cat.owner_id,
                   COALESCE(
                       (SELECT MAX(order_index) + 1 FROM hierarchy_nodes hn
                        WHERE hn.category_id = cn.category_id AND hn.parent_id IS NULL),
                       0
                   ) AS next_order
            FROM (SELECT DISTINCT category_id FROM cards WHERE lesson_node_id IS NULL) cn
            JOIN categories cat ON cat.id = cn.category_id
        ) sub
        """
    )
    op.execute(
        """
        UPDATE cards c
        SET lesson_node_id = hn.id
        FROM hierarchy_nodes hn
        WHERE hn.category_id = c.category_id
          AND hn.parent_id IS NULL
          AND hn.title = 'Unclassified'
          AND c.lesson_node_id IS NULL
        """
    )


def downgrade() -> None:
    # Not reversible: which cards were reassigned from NULL vs. genuinely
    # created under "Unclassified" afterward can no longer be distinguished.
    pass
