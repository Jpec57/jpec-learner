"""lesson exclude_from_review

Revision ID: e5a1b7c9d3f2
Revises: d4e9f7a2b5c8
Create Date: 2026-09-20 16:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5a1b7c9d3f2'
down_revision: Union[str, None] = 'd4e9f7a2b5c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'lessons',
        sa.Column('exclude_from_review', sa.Boolean(), server_default='false', nullable=False),
    )


def downgrade() -> None:
    op.drop_column('lessons', 'exclude_from_review')
