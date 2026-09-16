import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.core.media import image_to_out
from app.core.permissions import assert_owner, assert_visible
from app.db.base import get_db
from app.models.card import Card
from app.models.hierarchy import HierarchyNode
from app.models.image import Image
from app.models.user import User
from app.schemas.card import ImageOut
from app.services.image_storage import delete_file, save_upload

router = APIRouter(prefix="/images", tags=["images"])


@router.post("", response_model=ImageOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile,
    card_id: uuid.UUID | None = Form(None),
    lesson_node_id: uuid.UUID | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if (card_id is None) == (lesson_node_id is None):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provide exactly one of card_id or lesson_node_id")

    if card_id is not None:
        card = await db.get(Card, card_id, options=[selectinload(Card.images)])
        if card is None or card.deleted_at is not None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
        assert_visible(card, current_user.id)
        assert_owner(card, current_user.id)
        kind = "card"
    else:
        node = await db.get(HierarchyNode, lesson_node_id)
        if node is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")
        assert_visible(node, current_user.id)
        assert_owner(node, current_user.id)
        kind = "lesson"

    relative_path, content_type, size_bytes = await save_upload(file, owner_id=current_user.id, kind=kind)

    image = Image(
        owner_id=current_user.id,
        card_id=card_id,
        lesson_node_id=lesson_node_id,
        file_path=relative_path,
        content_type=content_type,
        size_bytes=size_bytes,
    )
    db.add(image)
    await db.commit()
    await db.refresh(image)
    return image_to_out(image)


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(
    image_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    image = await db.get(Image, image_id)
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
    if image.owner_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not the owner")

    delete_file(image.file_path)
    await db.delete(image)
    await db.commit()
