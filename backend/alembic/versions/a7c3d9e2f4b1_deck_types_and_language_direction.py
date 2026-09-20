"""deck types and language direction

Revision ID: a7c3d9e2f4b1
Revises: f6b2c8d4e1a9
Create Date: 2026-09-20 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7c3d9e2f4b1'
down_revision: Union[str, None] = 'f6b2c8d4e1a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('categories', sa.Column('deck_type', sa.String(length=20), server_default='general', nullable=False))
    op.add_column('categories', sa.Column('source_language', sa.String(length=10), nullable=True))
    op.add_column('categories', sa.Column('target_language', sa.String(length=10), nullable=True))
    op.create_check_constraint(
        'ck_categories_deck_type', 'categories', "deck_type IN ('general', 'language', 'scientific')"
    )


def downgrade() -> None:
    op.drop_constraint('ck_categories_deck_type', 'categories', type_='check')
    op.drop_column('categories', 'target_language')
    op.drop_column('categories', 'source_language')
    op.drop_column('categories', 'deck_type')
