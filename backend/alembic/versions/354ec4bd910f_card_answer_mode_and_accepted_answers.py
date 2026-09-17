"""card answer mode and accepted answers

Revision ID: 354ec4bd910f
Revises: 2c22d2fa9283
Create Date: 2026-09-17 12:50:02.727975

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '354ec4bd910f'
down_revision: Union[str, None] = '2c22d2fa9283'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Note: autogenerate misreads the ltree 'path' column and proposes dropping
    # ix_hierarchy_nodes_path -- that index is intentional (see earlier
    # migrations), so that spurious drop is omitted here.
    op.add_column('cards', sa.Column('answer_mode', sa.Text(), server_default='reveal', nullable=False))
    op.add_column('cards', sa.Column('accepted_answers', sa.ARRAY(sa.Text()), server_default='{}', nullable=False))
    op.create_check_constraint('ck_cards_answer_mode', 'cards', "answer_mode IN ('reveal', 'typed')")


def downgrade() -> None:
    op.drop_constraint('ck_cards_answer_mode', 'cards', type_='check')
    op.drop_column('cards', 'accepted_answers')
    op.drop_column('cards', 'answer_mode')
