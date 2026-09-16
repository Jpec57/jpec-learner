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
