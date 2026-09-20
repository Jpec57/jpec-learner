"""ocr scans: r2_object_key nullable (photo only uploaded when kept)

Revision ID: d4e9f7a2b5c8
Revises: c3d8e6f1a4b7
Create Date: 2026-09-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e9f7a2b5c8'
down_revision: Union[str, None] = 'c3d8e6f1a4b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('ocr_scans', 'r2_object_key', existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    # Pending scans have no uploaded photo, so they can't satisfy NOT NULL.
    op.execute("DELETE FROM ocr_scans WHERE r2_object_key IS NULL")
    op.alter_column('ocr_scans', 'r2_object_key', existing_type=sa.Text(), nullable=False)
