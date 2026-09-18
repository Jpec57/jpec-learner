import io

from PIL import Image


async def _register_and_login(client, email: str) -> dict:
    await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "password123", "display_name": email}
    )
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _fake_jpeg_bytes(orientation: int | None = None) -> bytes:
    img = Image.new("RGB", (40, 20), color=(200, 50, 50))
    buf = io.BytesIO()
    if orientation is not None:
        exif = img.getexif()
        exif[274] = orientation
        img.save(buf, format="JPEG", exif=exif)
    else:
        img.save(buf, format="JPEG")
    return buf.getvalue()


async def test_card_crud_and_visibility(client):
    owner_headers = await _register_and_login(client, "card-owner@example.com")
    other_headers = await _register_and_login(client, "card-other@example.com")

    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=owner_headers)
    ).json()["id"]

    create_resp = await client.post(
        "/api/v1/cards",
        json={"category_id": category_id, "front_text": "2+2", "back_text": "4"},
        headers=owner_headers,
    )
    assert create_resp.status_code == 201
    card = create_resp.json()
    assert card["images"] == []

    # Not owner and not public -> invisible.
    forbidden = await client.get(f"/api/v1/cards/{card['id']}", headers=other_headers)
    assert forbidden.status_code == 404

    patch_resp = await client.patch(
        f"/api/v1/cards/{card['id']}", json={"is_public": True, "back_text": "Four"}, headers=owner_headers
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["back_text"] == "Four"

    now_visible = await client.get(f"/api/v1/cards/{card['id']}", headers=other_headers)
    assert now_visible.status_code == 200

    edit_denied = await client.patch(
        f"/api/v1/cards/{card['id']}", json={"front_text": "hijacked"}, headers=other_headers
    )
    assert edit_denied.status_code == 403

    delete_resp = await client.delete(f"/api/v1/cards/{card['id']}", headers=owner_headers)
    assert delete_resp.status_code == 204
    gone_resp = await client.get(f"/api/v1/cards/{card['id']}", headers=owner_headers)
    assert gone_resp.status_code == 404


async def test_card_without_a_node_falls_back_to_unclassified(client):
    headers = await _register_and_login(client, "card-unclassified@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]

    first = (
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": "q1", "back_text": "a1"},
            headers=headers,
        )
    ).json()
    second = (
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": "q2", "back_text": "a2"},
            headers=headers,
        )
    ).json()

    # Every card lands on the SAME reserved node -- not a fresh one each time.
    assert first["lesson_node_id"] is not None
    assert first["lesson_node_id"] == second["lesson_node_id"]

    node_resp = await client.get(f"/api/v1/hierarchy/{first['lesson_node_id']}", headers=headers)
    assert node_resp.json()["title"] == "Unclassified"

    # Explicitly clearing a card's node (PATCH with lesson_node_id: null) also
    # resolves back to the same reserved node, not a bare NULL.
    group = (
        await client.post(
            "/api/v1/hierarchy",
            json={"category_id": category_id, "node_kind": "group", "title": "Some group"},
            headers=headers,
        )
    ).json()
    await client.patch(
        f"/api/v1/cards/{first['id']}", json={"lesson_node_id": group["id"]}, headers=headers
    )
    cleared_resp = await client.patch(
        f"/api/v1/cards/{first['id']}", json={"lesson_node_id": None}, headers=headers
    )
    assert cleared_resp.json()["lesson_node_id"] == first["lesson_node_id"]


async def test_cards_can_be_searched_and_paginated(client):
    owner_headers = await _register_and_login(client, "card-search-owner@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=owner_headers)
    ).json()["id"]

    for i in range(5):
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": f"Question {i}", "back_text": f"Answer {i}"},
            headers=owner_headers,
        )
    await client.post(
        "/api/v1/cards",
        json={"category_id": category_id, "front_text": "Unrelated", "back_text": "Nope"},
        headers=owner_headers,
    )

    page_resp = await client.get(
        "/api/v1/cards",
        params={"category_id": category_id, "limit": 2, "offset": 0},
        headers=owner_headers,
    )
    assert page_resp.status_code == 200
    page = page_resp.json()
    assert page["total"] == 6
    assert len(page["items"]) == 2

    next_page_resp = await client.get(
        "/api/v1/cards",
        params={"category_id": category_id, "limit": 2, "offset": 2},
        headers=owner_headers,
    )
    next_page = next_page_resp.json()
    assert len(next_page["items"]) == 2
    assert {c["id"] for c in page["items"]}.isdisjoint({c["id"] for c in next_page["items"]})

    search_resp = await client.get(
        "/api/v1/cards",
        params={"category_id": category_id, "search": "Question"},
        headers=owner_headers,
    )
    search_result = search_resp.json()
    assert search_result["total"] == 5
    assert all("Question" in c["front_text"] for c in search_result["items"])


async def test_cards_can_be_filtered_by_answer_language(client):
    owner_headers = await _register_and_login(client, "card-lang-owner@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Japanese"}, headers=owner_headers)
    ).json()["id"]

    await client.post(
        "/api/v1/cards",
        json={
            "category_id": category_id,
            "front_text": "犬",
            "back_text": "inu",
            "answer_mode": "typed",
            "answer_language": "ja-romaji",
        },
        headers=owner_headers,
    )
    await client.post(
        "/api/v1/cards",
        json={
            "category_id": category_id,
            "front_text": "cat",
            "back_text": "chat",
            "answer_mode": "typed",
            "answer_language": "fr",
        },
        headers=owner_headers,
    )
    await client.post(
        "/api/v1/cards",
        json={"category_id": category_id, "front_text": "no language", "back_text": "n/a"},
        headers=owner_headers,
    )

    filtered_resp = await client.get(
        "/api/v1/cards",
        params={"category_id": category_id, "answer_language": "ja-romaji"},
        headers=owner_headers,
    )
    filtered = filtered_resp.json()
    assert filtered["total"] == 1
    assert filtered["items"][0]["front_text"] == "犬"


async def test_typed_card_with_reverse_and_accepted_answers(client):
    owner_headers = await _register_and_login(client, "card-typed-owner@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Japanese"}, headers=owner_headers)
    ).json()["id"]

    create_resp = await client.post(
        "/api/v1/cards",
        json={
            "category_id": category_id,
            "front_text": "勉強",
            "back_text": "benkyou",
            "answer_mode": "typed",
            "accepted_answers": ["benkyō"],
            "answer_language": "ja-romaji",
            "hint": "Sounds like 'ben+kyo'",
            "create_reverse": True,
            "reverse_answer_language": "ja-kanji",
        },
        headers=owner_headers,
    )
    assert create_resp.status_code == 201
    forward = create_resp.json()
    assert forward["front_text"] == "勉強"
    assert forward["answer_mode"] == "typed"
    assert forward["accepted_answers"] == ["benkyō"]
    assert forward["answer_language"] == "ja-romaji"
    assert forward["hint"] == "Sounds like 'ben+kyo'"

    page_resp = await client.get(
        "/api/v1/cards", params={"category_id": category_id}, headers=owner_headers
    )
    cards = page_resp.json()["items"]
    assert len(cards) == 2
    reverse = next(c for c in cards if c["id"] != forward["id"])
    assert reverse["front_text"] == "benkyou"
    assert reverse["back_text"] == "勉強"
    assert reverse["answer_mode"] == "typed"
    assert reverse["accepted_answers"] == []
    # The reverse direction gets its own expected-answer language, and shares
    # the same hint (a mnemonic for the vocab item, not direction-specific).
    assert reverse["answer_language"] == "ja-kanji"
    assert reverse["hint"] == "Sounds like 'ben+kyo'"

    # A learner's own valid-but-unlisted answer (e.g. a kana reading) can be
    # appended after the fact via PATCH.
    patch_resp = await client.patch(
        f"/api/v1/cards/{forward['id']}",
        json={"accepted_answers": ["benkyō", "べんきょう"]},
        headers=owner_headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["accepted_answers"] == ["benkyō", "べんきょう"]

    # answer_language can be explicitly cleared back to null via PATCH.
    clear_resp = await client.patch(
        f"/api/v1/cards/{forward['id']}", json={"answer_language": None}, headers=owner_headers
    )
    assert clear_resp.status_code == 200
    assert clear_resp.json()["answer_language"] is None


async def test_image_upload_exif_and_ownership(client):
    owner_headers = await _register_and_login(client, "img-owner@example.com")
    other_headers = await _register_and_login(client, "img-other@example.com")

    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=owner_headers)
    ).json()["id"]
    card = (
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": "q", "back_text": "a"},
            headers=owner_headers,
        )
    ).json()

    upload_resp = await client.post(
        "/api/v1/images",
        files={"file": ("photo.jpg", _fake_jpeg_bytes(orientation=6), "image/jpeg")},
        data={"card_id": card["id"]},
        headers=owner_headers,
    )
    assert upload_resp.status_code == 201
    image = upload_resp.json()
    assert image["content_type"] == "image/jpeg"
    assert image["url"].startswith("/media/card/")

    # EXIF orientation=6 is a 90-degree rotation: original 40x20 -> stored 20x40.
    media_resp = await client.get(image["url"])
    assert media_resp.status_code == 200
    stored = Image.open(io.BytesIO(media_resp.content))
    assert stored.size == (20, 40)
    assert 274 not in stored.getexif()

    card_resp = await client.get(f"/api/v1/cards/{card['id']}", headers=owner_headers)
    assert len(card_resp.json()["images"]) == 1

    # Only the owner may attach images to their card.
    denied_resp = await client.post(
        "/api/v1/images",
        files={"file": ("photo.jpg", _fake_jpeg_bytes(), "image/jpeg")},
        data={"card_id": card["id"]},
        headers=other_headers,
    )
    assert denied_resp.status_code in (403, 404)

    # Wrong content type is rejected.
    bad_type_resp = await client.post(
        "/api/v1/images",
        files={"file": ("doc.txt", b"not an image", "text/plain")},
        data={"card_id": card["id"]},
        headers=owner_headers,
    )
    assert bad_type_resp.status_code == 400

    delete_resp = await client.delete(f"/api/v1/images/{image['id']}", headers=owner_headers)
    assert delete_resp.status_code == 204

    gone_media = await client.get(image["url"])
    assert gone_media.status_code == 404
