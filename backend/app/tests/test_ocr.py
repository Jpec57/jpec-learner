import io

from PIL import Image

from app.api.v1.routes import ocr as ocr_routes
from app.services.ocr.client import OcrServiceError


async def _register_and_login(client, email: str) -> dict:
    await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "password123", "display_name": email}
    )
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _fake_jpeg_bytes() -> bytes:
    img = Image.new("RGB", (40, 20), color=(10, 20, 30))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _patch_ocr_pipeline(monkeypatch, *, text: str = "extracted text", fail: bool = False):
    async def fake_upload(raw, *, owner_id):
        return "fake/object-key.jpg", len(raw)

    async def fake_presign(object_key):
        return f"https://r2.example.com/{object_key}?sig=fake"

    async def fake_extract(raw, *, mode, content_type):
        if fail:
            raise OcrServiceError("ocr service down")
        return text

    monkeypatch.setattr(ocr_routes, "upload_scan_image", fake_upload)
    monkeypatch.setattr(ocr_routes, "presigned_scan_url", fake_presign)
    monkeypatch.setattr(ocr_routes, "extract_text", fake_extract)


async def test_extract_creates_unlinked_scan(client, monkeypatch):
    headers = await _register_and_login(client, "ocr-extract@example.com")
    _patch_ocr_pipeline(monkeypatch, text="bonjour le monde")

    resp = await client.post(
        "/api/v1/ocr/extract",
        files={"file": ("scan.jpg", _fake_jpeg_bytes(), "image/jpeg")},
        data={"mode": "general"},
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["text"] == "bonjour le monde"
    assert body["mode"] == "general"
    assert body["card_id"] is None
    assert body["lesson_node_id"] is None
    assert body["image_url"].startswith("https://r2.example.com/")


async def test_extract_maps_ocr_service_failure_to_502(client, monkeypatch):
    headers = await _register_and_login(client, "ocr-fail@example.com")
    _patch_ocr_pipeline(monkeypatch, fail=True)

    resp = await client.post(
        "/api/v1/ocr/extract",
        files={"file": ("scan.jpg", _fake_jpeg_bytes(), "image/jpeg")},
        data={"mode": "manga"},
        headers=headers,
    )
    assert resp.status_code == 502


async def test_link_scan_to_own_card_succeeds(client, monkeypatch):
    headers = await _register_and_login(client, "ocr-link@example.com")
    _patch_ocr_pipeline(monkeypatch, text="front text")

    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]
    card = (
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": "placeholder", "back_text": "placeholder"},
            headers=headers,
        )
    ).json()

    scan = (
        await client.post(
            "/api/v1/ocr/extract",
            files={"file": ("scan.jpg", _fake_jpeg_bytes(), "image/jpeg")},
            data={"mode": "general"},
            headers=headers,
        )
    ).json()

    link_resp = await client.patch(
        f"/api/v1/ocr/scans/{scan['id']}/link", json={"card_id": card["id"]}, headers=headers
    )
    assert link_resp.status_code == 200
    assert link_resp.json()["card_id"] == card["id"]

    list_resp = await client.get("/api/v1/ocr/scans", params={"card_id": card["id"]}, headers=headers)
    assert [s["id"] for s in list_resp.json()] == [scan["id"]]


async def test_link_scan_to_another_users_card_is_rejected(client, monkeypatch):
    owner_headers = await _register_and_login(client, "ocr-owner@example.com")
    other_headers = await _register_and_login(client, "ocr-other@example.com")
    _patch_ocr_pipeline(monkeypatch)

    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=owner_headers)
    ).json()["id"]
    card = (
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": "placeholder", "back_text": "placeholder"},
            headers=owner_headers,
        )
    ).json()

    scan = (
        await client.post(
            "/api/v1/ocr/extract",
            files={"file": ("scan.jpg", _fake_jpeg_bytes(), "image/jpeg")},
            data={"mode": "general"},
            headers=other_headers,
        )
    ).json()

    resp = await client.patch(
        f"/api/v1/ocr/scans/{scan['id']}/link", json={"card_id": card["id"]}, headers=other_headers
    )
    assert resp.status_code == 404
