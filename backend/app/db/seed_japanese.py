"""One-off seed script: creates a "Japanese" category with a handful of
WaniKani-style vocab cards (typed-answer mode, furigana, forward+reverse
pairs) for the given user. Reuses an existing "Japanese" category owned by
that user rather than duplicating it, but does not de-duplicate individual
cards -- re-running adds a second copy of each vocab pair.

Looks the user up by email and mints an access token directly (no password
needed) -- this is a trusted local dev script run inside the backend
container, not an HTTP-exposed flow.

Usage (inside the backend container):
    python -m app.db.seed_japanese user@example.com
"""
import asyncio
import sys

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.db.base import AsyncSessionLocal
from app.main import app
from app.models.user import User


async def _access_token_for(email: str) -> str:
    async with AsyncSessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            raise SystemExit(f"No user with email {email!r} -- register that account first.")
        return create_access_token(str(user.id))

# (front with inline furigana, primary romaji answer, extra accepted answers, hint)
VOCAB: list[tuple[str, str, list[str], str | None]] = [
    ("勉強[べんきょう]", "benkyou", ["benkyō"], "Sounds like 'ben' + 'kyo'"),
    ("先生[せんせい]", "sensei", ["sensē"], None),
    ("学校[がっこう]", "gakkou", ["gakkō"], None),
    ("日本語[にほんご]", "nihongo", [], "日本 (Japan) + 語 (language)"),
    ("水[みず]", "mizu", [], None),
    ("食[た]べる", "taberu", [], None),
    ("飲[の]む", "nomu", [], None),
    ("友達[ともだち]", "tomodachi", [], None),
]


async def _get_or_create_category(client: AsyncClient, headers: dict) -> str:
    existing = await client.get("/api/v1/categories", headers=headers)
    existing.raise_for_status()
    for category in existing.json():
        if category["name"] == "Japanese":
            return category["id"]
    created = await client.post("/api/v1/categories", json={"name": "Japanese", "icon": "🗾"}, headers=headers)
    created.raise_for_status()
    return created.json()["id"]


async def seed(email: str) -> None:
    access_token = await _access_token_for(email)
    headers = {"Authorization": f"Bearer {access_token}"}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://seed") as client:
        category_id = await _get_or_create_category(client, headers)

        for front, back, extra_answers, hint in VOCAB:
            resp = await client.post(
                "/api/v1/cards",
                json={
                    "category_id": category_id,
                    "front_text": front,
                    "back_text": back,
                    "answer_mode": "typed",
                    "accepted_answers": [back, *extra_answers] if extra_answers else [],
                    "answer_language": "ja-romaji",
                    "hint": hint,
                    "create_reverse": True,
                    "reverse_answer_language": "ja-kanji",
                },
                headers=headers,
            )
            resp.raise_for_status()
            print(f"Created {front} <-> {back}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m app.db.seed_japanese <email>")
        sys.exit(1)
    asyncio.run(seed(sys.argv[1]))
