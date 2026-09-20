"""deck goal and plan

Revision ID: b8d4e0f6a2c3
Revises: a7c3d9e2f4b1
Create Date: 2026-09-20 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8d4e0f6a2c3'
down_revision: Union[str, None] = 'a7c3d9e2f4b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('categories', sa.Column('goal', sa.Text(), nullable=True))
    op.add_column('categories', sa.Column('plan_markdown', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('categories', 'plan_markdown')
    op.drop_column('categories', 'goal')
