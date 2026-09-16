import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.review import ReviewState


async def ensure_review_state(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    card_id: uuid.UUID | None = None,
    lesson_node_id: uuid.UUID | None = None,
) -> ReviewState:
    """Idempotently get-or-create a review_state row for (user, target). Used both
    for auto-enrolling an owner into their own new content and for the explicit
    /reviews/enroll action on someone else's public content."""
    query = select(ReviewState).where(ReviewState.user_id == user_id)
    query = query.where(
        ReviewState.card_id == card_id if card_id is not None else ReviewState.lesson_node_id == lesson_node_id
    )
    existing = await db.scalar(query)
    if existing is not None:
        return existing

    state = ReviewState(user_id=user_id, card_id=card_id, lesson_node_id=lesson_node_id)
    db.add(state)
    await db.flush()
    return state
