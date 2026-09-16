"""hierarchy sibling title uniqueness

Revision ID: 2c22d2fa9283
Revises: 2f315c5d2b84
Create Date: 2026-09-16 19:19:29.617682

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '2c22d2fa9283'
down_revision: Union[str, None] = '2f315c5d2b84'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Data cleanup first: rename any pre-existing duplicate sibling titles (same
    # category + parent, NULL parent meaning "root") so the new constraint can
    # be added without failing. Renames rather than deletes -- some of these
    # nodes may already have real content underneath them.
    op.execute(
        """
        WITH duplicates AS (
            SELECT id, title,
                   row_number() OVER (
                       PARTITION BY category_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'), title
                       ORDER BY created_at
                   ) AS rn
            FROM hierarchy_nodes
        )
        UPDATE hierarchy_nodes h
        SET title = h.title || ' (' || duplicates.rn || ')'
        FROM duplicates
        WHERE h.id = duplicates.id AND duplicates.rn > 1
        """
    )
    op.create_unique_constraint(
        "uq_hierarchy_nodes_sibling_title",
        "hierarchy_nodes",
        ["category_id", "parent_id", "title"],
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    op.drop_constraint("uq_hierarchy_nodes_sibling_title", "hierarchy_nodes", type_="unique")
