"""ocr scans

Revision ID: c3d8e6f1a4b7
Revises: 8a1f0c9d2b3e
Create Date: 2026-09-18 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c3d8e6f1a4b7'
down_revision: Union[str, None] = '8a1f0c9d2b3e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ocr_scans',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('owner_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('card_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('lesson_node_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('r2_object_key', sa.Text(), nullable=False),
        sa.Column('mode', sa.String(length=20), nullable=False),
        sa.Column('extracted_text', sa.Text(), nullable=False),
        sa.Column('content_type', sa.String(length=80), nullable=True),
        sa.Column('size_bytes', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("mode IN ('general', 'manga')", name='ck_ocr_scans_mode'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['lesson_node_id'], ['hierarchy_nodes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ocr_scans_owner_id', 'ocr_scans', ['owner_id'])
    op.create_index('ix_ocr_scans_card_id', 'ocr_scans', ['card_id'])
    op.create_index('ix_ocr_scans_lesson_node_id', 'ocr_scans', ['lesson_node_id'])


def downgrade() -> None:
    op.drop_index('ix_ocr_scans_lesson_node_id', table_name='ocr_scans')
    op.drop_index('ix_ocr_scans_card_id', table_name='ocr_scans')
    op.drop_index('ix_ocr_scans_owner_id', table_name='ocr_scans')
    op.drop_table('ocr_scans')
