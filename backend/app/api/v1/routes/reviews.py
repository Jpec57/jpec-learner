import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.core.permissions import assert_visible
from app.db.base import get_db
from app.models.card import Card
from app.models.hierarchy import HierarchyNode, Lesson
from app.models.review import ReviewLog, ReviewState
from app.models.user import User
from app.schemas.review import (
    DueCountOut,
    DueItemOut,
    EnrollRequest,
    ReviewInsightItemOut,
    ReviewInsightsOut,
    ReviewStateOut,
    SubmitReviewRequest,
    UpcomingBucketOut,
)
from app.services.enrollment import ensure_review_state
from app.services.srs import RATING_TO_QUALITY, apply_review

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("/due-count", response_model=DueCountOut)
async def get_due_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Total due items across every category the user owns -- used for the
    global in-app due banner (see features/notifications on the frontend)."""
    total = await db.scalar(
        select(func.count())
        .select_from(ReviewState)
        .where(ReviewState.user_id == current_user.id, ReviewState.due_at <= func.now())
    )
    return DueCountOut(total_due=total or 0)


ReviewItemType = Literal["card", "lesson"]
ALL_REVIEW_ITEM_TYPES: tuple[ReviewItemType, ...] = ("card", "lesson")


@router.get("/due", response_model=list[DueItemOut])
async def get_due(
    category_id: uuid.UUID,
    types: list[ReviewItemType] = Query(default=list(ALL_REVIEW_ITEM_TYPES)),
    limit: int = Query(20, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """`types` selects which content types to include in the review queue --
    the foundation for future "review decks" filtered by content type. Defaults
    to every known type; pass e.g. `types=card` to review only flashcards."""
    now = datetime.now(timezone.utc)

    card_rows = []
    if "card" in types:
        card_query = (
            select(ReviewState, Card)
            .join(Card, ReviewState.card_id == Card.id)
            .options(selectinload(Card.images))
            .where(
                ReviewState.user_id == current_user.id,
                ReviewState.due_at <= now,
                Card.category_id == category_id,
                Card.deleted_at.is_(None),
            )
        )
        card_rows = (await db.execute(card_query)).all()

    node_rows = []
    if "lesson" in types:
        node_query = (
            select(ReviewState, HierarchyNode)
            .join(HierarchyNode, ReviewState.lesson_node_id == HierarchyNode.id)
            .options(selectinload(HierarchyNode.lesson), selectinload(HierarchyNode.images))
            .where(
                ReviewState.user_id == current_user.id,
                ReviewState.due_at <= now,
                HierarchyNode.category_id == category_id,
            )
        )
        node_rows = (await db.execute(node_query)).all()

    items: list[DueItemOut] = []
    for review_state, card in card_rows:
        items.append(
            DueItemOut(
                review_state_id=review_state.id,
                item_kind="card",
                card_id=card.id,
                lesson_node_id=None,
                front_text=card.front_text,
                back_text=card.back_text,
                answer_mode=card.answer_mode,
                accepted_answers=card.accepted_answers,
                answer_language=card.answer_language,
                hint=card.hint,
                due_at=review_state.due_at,
                current_level=review_state.current_level,
            )
        )
    for review_state, node in node_rows:
        items.append(
            DueItemOut(
                review_state_id=review_state.id,
                item_kind="lesson",
                card_id=None,
                lesson_node_id=node.id,
                title=node.title,
                body_markdown=node.lesson.body_markdown if node.lesson else None,
                due_at=review_state.due_at,
                current_level=review_state.current_level,
            )
        )

    items.sort(key=lambda item: item.due_at)
    return items[:limit]


@router.get("/upcoming", response_model=list[UpcomingBucketOut])
async def get_upcoming(
    category_id: uuid.UUID,
    hours: int = Query(24, ge=1, le=168),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hour-bucketed counts of items becoming due over the next `hours` hours,
    for the "upcoming reviews" bar graph. Already-overdue items are folded
    into the current hour's bucket -- from the learner's perspective they're
    simply due now, same as items that just unlocked this hour."""
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(hours=hours)
    current_hour = now.replace(minute=0, second=0, microsecond=0)
    bucket = func.greatest(func.date_trunc("hour", ReviewState.due_at), current_hour)

    card_query = (
        select(bucket.label("hour"), func.count())
        .select_from(ReviewState)
        .join(Card, ReviewState.card_id == Card.id)
        .where(
            ReviewState.user_id == current_user.id,
            ReviewState.due_at <= horizon,
            Card.category_id == category_id,
            Card.deleted_at.is_(None),
        )
        .group_by(bucket)
    )
    node_query = (
        select(bucket.label("hour"), func.count())
        .select_from(ReviewState)
        .join(HierarchyNode, ReviewState.lesson_node_id == HierarchyNode.id)
        .where(
            ReviewState.user_id == current_user.id,
            ReviewState.due_at <= horizon,
            HierarchyNode.category_id == category_id,
        )
        .group_by(bucket)
    )

    counts: dict[datetime, int] = defaultdict(int)
    for hour, count in (await db.execute(card_query)).all():
        counts[hour] += count
    for hour, count in (await db.execute(node_query)).all():
        counts[hour] += count

    buckets = []
    cursor = current_hour
    while cursor <= horizon:
        buckets.append(UpcomingBucketOut(hour=cursor, count=counts.get(cursor, 0)))
        cursor += timedelta(hours=1)
    return buckets


async def _insight_items(
    db: AsyncSession,
    *,
    category_id: uuid.UUID,
    user_id: uuid.UUID,
    order_col,
    limit: int,
    only_reviewed: bool,
) -> list[ReviewInsightItemOut]:
    card_query = (
        select(ReviewState, Card)
        .join(Card, ReviewState.card_id == Card.id)
        .where(
            ReviewState.user_id == user_id,
            Card.category_id == category_id,
            Card.deleted_at.is_(None),
        )
    )
    node_query = (
        select(ReviewState, HierarchyNode)
        .join(HierarchyNode, ReviewState.lesson_node_id == HierarchyNode.id)
        .where(ReviewState.user_id == user_id, HierarchyNode.category_id == category_id)
    )
    if only_reviewed:
        card_query = card_query.where(ReviewState.repetitions > 0)
        node_query = node_query.where(ReviewState.repetitions > 0)
    card_query = card_query.order_by(order_col).limit(limit)
    node_query = node_query.order_by(order_col).limit(limit)

    items: list[ReviewInsightItemOut] = []
    for review_state, card in (await db.execute(card_query)).all():
        items.append(
            ReviewInsightItemOut(
                review_state_id=review_state.id,
                item_kind="card",
                card_id=card.id,
                lesson_node_id=None,
                front_text=card.front_text,
                ease_factor=float(review_state.ease_factor),
                repetitions=review_state.repetitions,
                last_reviewed_at=review_state.last_reviewed_at,
                current_level=review_state.current_level,
            )
        )
    for review_state, node in (await db.execute(node_query)).all():
        items.append(
            ReviewInsightItemOut(
                review_state_id=review_state.id,
                item_kind="lesson",
                card_id=None,
                lesson_node_id=node.id,
                title=node.title,
                ease_factor=float(review_state.ease_factor),
                repetitions=review_state.repetitions,
                last_reviewed_at=review_state.last_reviewed_at,
                current_level=review_state.current_level,
            )
        )
    return items


@router.get("/insights", response_model=ReviewInsightsOut)
async def get_insights(
    category_id: uuid.UUID,
    limit: int = Query(5, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Small "needs attention" lists for the category dashboard -- a nudge,
    not a substitute for the due queue. "struggling" is the lowest ease
    factor among items reviewed at least once; "stale" is the oldest
    last_reviewed_at (never-reviewed items sort first)."""
    struggling = await _insight_items(
        db,
        category_id=category_id,
        user_id=current_user.id,
        order_col=ReviewState.ease_factor.asc(),
        limit=limit,
        only_reviewed=True,
    )
    struggling.sort(key=lambda item: item.ease_factor)

    stale = await _insight_items(
        db,
        category_id=category_id,
        user_id=current_user.id,
        order_col=ReviewState.last_reviewed_at.asc().nulls_first(),
        limit=limit,
        only_reviewed=False,
    )
    stale.sort(key=lambda item: (item.last_reviewed_at is not None, item.last_reviewed_at))

    return ReviewInsightsOut(struggling=struggling[:limit], stale=stale[:limit])


@router.post("/enroll", response_model=ReviewStateOut, status_code=status.HTTP_201_CREATED)
async def enroll(
    payload: EnrollRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.card_id is not None:
        card = await db.get(Card, payload.card_id)
        if card is None or card.deleted_at is not None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
        assert_visible(card, current_user.id)
    else:
        node = await db.get(HierarchyNode, payload.lesson_node_id)
        if node is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")
        assert_visible(node, current_user.id)
        if node.node_kind == "lesson":
            lesson = await db.get(Lesson, node.id)
            if lesson is not None and lesson.exclude_from_review:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lesson is excluded from review")

    state = await ensure_review_state(
        db, user_id=current_user.id, card_id=payload.card_id, lesson_node_id=payload.lesson_node_id
    )
    await db.commit()
    await db.refresh(state)
    return state


@router.get("/state", response_model=ReviewStateOut)
async def get_state(
    card_id: uuid.UUID | None = Query(None),
    lesson_node_id: uuid.UUID | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if (card_id is None) == (lesson_node_id is None):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provide exactly one of card_id or lesson_node_id")

    query = select(ReviewState).where(ReviewState.user_id == current_user.id)
    query = query.where(
        ReviewState.card_id == card_id if card_id is not None else ReviewState.lesson_node_id == lesson_node_id
    )
    state = await db.scalar(query)
    if state is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not enrolled")
    return state


@router.post("/{review_state_id}/submit", response_model=ReviewStateOut)
async def submit_review(
    review_state_id: uuid.UUID,
    payload: SubmitReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    state = await db.get(ReviewState, review_state_id)
    if state is None or state.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found")

    interval_before = state.interval_days
    ease_before = float(state.ease_factor)
    now = datetime.now(timezone.utc)

    result = apply_review(
        rating=payload.rating,
        repetitions=state.repetitions,
        ease_factor=ease_before,
        interval_days=interval_before,
        now=now,
    )

    db.add(
        ReviewLog(
            review_state_id=state.id,
            user_id=current_user.id,
            rating=payload.rating,
            quality=RATING_TO_QUALITY[payload.rating],
            interval_before=interval_before,
            interval_after=result.interval_days,
            ease_before=ease_before,
            ease_after=result.ease_factor,
            reviewed_at=now,
        )
    )

    state.repetitions = result.repetitions
    state.ease_factor = result.ease_factor
    state.interval_days = result.interval_days
    state.due_at = result.due_at
    state.last_reviewed_at = now
    state.last_rating = payload.rating
    state.current_level = result.current_level

    await db.commit()
    await db.refresh(state)
    return state
