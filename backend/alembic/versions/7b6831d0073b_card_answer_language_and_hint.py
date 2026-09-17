"""card answer language and hint

Revision ID: 7b6831d0073b
Revises: 354ec4bd910f
Create Date: 2026-09-17 14:09:06.124486

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7b6831d0073b'
down_revision: Union[str, None] = '354ec4bd910f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Note: autogenerate misreads the ltree 'path' column and proposes dropping
    # ix_hierarchy_nodes_path -- that index is intentional (see earlier
    # migrations), so that spurious drop is omitted here.
    op.add_column('cards', sa.Column('answer_language', sa.Text(), nullable=True))
    op.add_column('cards', sa.Column('hint', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('cards', 'hint')
    op.drop_column('cards', 'answer_language')
