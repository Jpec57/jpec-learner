"""chess line progress

Revision ID: c3d5e7f9a1b2
Revises: 1a2b3c4d5e6f
Create Date: 2026-10-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d5e7f9a1b2'
down_revision: Union[str, None] = '1a2b3c4d5e6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('chess_line_progress',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('course_id', sa.String(length=64), nullable=False),
    sa.Column('line_id', sa.String(length=64), nullable=False),
    sa.Column('completed', sa.Integer(), nullable=False),
    sa.Column('flawless', sa.Integer(), nullable=False),
    sa.Column('last_completed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'course_id', 'line_id', name='uq_chess_line_progress_user_line')
    )
    op.create_index(op.f('ix_chess_line_progress_user_id'), 'chess_line_progress', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_chess_line_progress_user_id'), table_name='chess_line_progress')
    op.drop_table('chess_line_progress')
