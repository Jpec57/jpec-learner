from typing import Protocol
from uuid import UUID

from fastapi import HTTPException, status


class OwnedVisible(Protocol):
    owner_id: UUID
    is_public: bool


def assert_visible(resource: OwnedVisible, user_id: UUID) -> None:
    if resource.owner_id != user_id and not resource.is_public:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def assert_owner(resource: OwnedVisible, user_id: UUID) -> None:
    if resource.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the owner")
