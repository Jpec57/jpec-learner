"""typed cards: accepted_answers becomes the complete list of typeable answers

Revision ID: f6b2c8d4e1a9
Revises: e5a1b7c9d3f2
Create Date: 2026-09-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'f6b2c8d4e1a9'
down_revision: Union[str, None] = 'e5a1b7c9d3f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Until now a typed card's back_text was always graded as an answer, with
    # accepted_answers as extras. Now a non-empty accepted_answers is the whole
    # set of typeable answers and back_text is display-only context (markdown).
    # Fold back_text into the list for existing cards with extras so they keep
    # accepting exactly what they accepted before. Cards with an empty list
    # still fall back to back_text and need no change.
    op.execute(
        "UPDATE cards SET accepted_answers = array_prepend(back_text, accepted_answers) "
        "WHERE answer_mode = 'typed' AND cardinality(accepted_answers) > 0 "
        "AND NOT (back_text = ANY(accepted_answers))"
    )


def downgrade() -> None:
    # Not reversible without losing information; the folded-in back_text entry
    # is harmless under the old semantics (it was accepted anyway).
    pass
