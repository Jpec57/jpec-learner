"""category theme color

Revision ID: 5df54f51c7c8
Revises: fbdf3e1aebf3
Create Date: 2026-09-17 18:04:56.076116

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5df54f51c7c8'
down_revision: Union[str, None] = 'fbdf3e1aebf3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Note: autogenerate misreads the ltree 'path' column and proposes dropping
    # ix_hierarchy_nodes_path -- that index is intentional (see earlier
    # migrations), so that spurious drop is omitted here.
    op.add_column('categories', sa.Column('theme_color', sa.String(length=7), nullable=True))


def downgrade() -> None:
    op.drop_column('categories', 'theme_color')
