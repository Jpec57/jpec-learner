"""notification state

Revision ID: 1a2b3c4d5e6f
Revises: b8d4e0f6a2c3
Create Date: 2026-09-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '1a2b3c4d5e6f'
down_revision: Union[str, None] = 'b8d4e0f6a2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('notification_states',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('last_notified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', name='uq_notification_states_user_id')
    )
    op.create_index(op.f('ix_notification_states_user_id'), 'notification_states', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_notification_states_user_id'), table_name='notification_states')
    op.drop_table('notification_states')
