import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select

from app.core.deps import get_current_user
from app.core.permissions import assert_owner, assert_visible
from app.db.base import get_db
from app.models.card import Card
from app.models.category import Category
from app.models.hierarchy import HierarchyNode
from app.models.user import User
from app.schemas.card import CardCreate, CardOut, CardPageOut, CardUpdate
from app.services.enrollment import ensure_review_state

router = APIRouter(prefix="/cards", tags=["cards"])


async def _get_category_or_404(db: AsyncSession, category_id: uuid.UUID) -> Category:
    category = await db.get(Category, category_id)
    if category is None or category.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    return category


async def _get_card_or_404(db: AsyncSession, card_id: uuid.UUID) -> Card:
    card = await db.get(Card, card_id, options=[selectinload(Card.images)])
    if card is None or card.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    return card


def _to_out(card: Card) -> CardOut:
    return CardOut.model_validate(card)


def _filtered_cards_query(
    category_id: uuid.UUID,
    lesson_node_id: uuid.UUID | None,
    owner: Literal["me", "public"],
    search: str | None,
    current_user_id: uuid.UUID,
) -> Select:
    query = select(Card).where(Card.category_id == category_id, Card.deleted_at.is_(None))
    if lesson_node_id is not None:
        query = query.where(Card.lesson_node_id == lesson_node_id)
    if owner == "me":
        query = query.where(Card.owner_id == current_user_id)
    else:
        query = query.where(Card.is_public.is_(True), Card.owner_id != current_user_id)
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(Card.front_text.ilike(pattern), Card.back_text.ilike(pattern)))
    return query


@router.get("", response_model=CardPageOut)
async def list_cards(
    category_id: uuid.UUID,
    lesson_node_id: uuid.UUID | None = Query(None),
    owner: Literal["me", "public"] = Query("me"),
    search: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await _get_category_or_404(db, category_id)
    assert_visible(category, current_user.id)

    base_query = _filtered_cards_query(category_id, lesson_node_id, owner, search, current_user.id)

    total = await db.scalar(select(func.count()).select_from(base_query.subquery()))

    page_query = (
        base_query.options(selectinload(Card.images))
        .order_by(Card.created_at)
        .limit(limit)
        .offset(offset)
    )
    cards = (await db.scalars(page_query)).all()
    return CardPageOut(items=[_to_out(c) for c in cards], total=total or 0)


def _build_card(
    payload: CardCreate, *, front_text: str, back_text: str, accepted_answers: list[str], owner_id: uuid.UUID
) -> Card:
    return Card(
        category_id=payload.category_id,
        lesson_node_id=payload.lesson_node_id,
        owner_id=owner_id,
        front_text=front_text,
        back_text=back_text,
        is_public=payload.is_public,
        answer_mode=payload.answer_mode,
        accepted_answers=accepted_answers,
    )


@router.post("", response_model=CardOut, status_code=status.HTTP_201_CREATED)
async def create_card(
    payload: CardCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await _get_category_or_404(db, payload.category_id)
    assert_visible(category, current_user.id)
    assert_owner(category, current_user.id)

    if payload.lesson_node_id is not None:
        node = await db.get(HierarchyNode, payload.lesson_node_id)
        if node is None or node.category_id != payload.category_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Node must belong to the same category")

    card = _build_card(
        payload,
        front_text=payload.front_text,
        back_text=payload.back_text,
        accepted_answers=payload.accepted_answers,
        owner_id=current_user.id,
    )
    db.add(card)
    await db.flush()
    await ensure_review_state(db, user_id=current_user.id, card_id=card.id)

    if payload.create_reverse:
        # The reverse direction starts with no extra accepted answers -- its
        # only exact match is the original front_text (e.g. the kanji form),
        # variants (kana readings, synonyms) get added later via PATCH as the
        # learner hits them during typed review.
        reverse = _build_card(
            payload,
            front_text=payload.back_text,
            back_text=payload.front_text,
            accepted_answers=[],
            owner_id=current_user.id,
        )
        db.add(reverse)
        await db.flush()
        await ensure_review_state(db, user_id=current_user.id, card_id=reverse.id)

    await db.commit()
    await db.refresh(card, attribute_names=["images"])
    return _to_out(card)


@router.get("/{card_id}", response_model=CardOut)
async def get_card(
    card_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_or_404(db, card_id)
    assert_visible(card, current_user.id)
    return _to_out(card)


@router.patch("/{card_id}", response_model=CardOut)
async def update_card(
    card_id: uuid.UUID,
    payload: CardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_or_404(db, card_id)
    assert_visible(card, current_user.id)
    assert_owner(card, current_user.id)

    if payload.front_text is not None:
        card.front_text = payload.front_text
    if payload.back_text is not None:
        card.back_text = payload.back_text
    if payload.is_public is not None:
        card.is_public = payload.is_public
    if payload.answer_mode is not None:
        card.answer_mode = payload.answer_mode
    if payload.accepted_answers is not None:
        card.accepted_answers = payload.accepted_answers
    if "lesson_node_id" in payload.model_fields_set:
        if payload.lesson_node_id is not None:
            node = await db.get(HierarchyNode, payload.lesson_node_id)
            if node is None or node.category_id != card.category_id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Node must belong to the same category")
        card.lesson_node_id = payload.lesson_node_id

    await db.commit()
    await db.refresh(card, attribute_names=["images"])
    return _to_out(card)


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_card(
    card_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_or_404(db, card_id)
    assert_visible(card, current_user.id)
    assert_owner(card, current_user.id)

    card.deleted_at = datetime.now(timezone.utc)
    await db.commit()
