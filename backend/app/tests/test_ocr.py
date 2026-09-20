import io
import os
import uuid
import time

import pytest
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.v1.routes import ocr as ocr_routes
from app.core.config import settings
from app.models.ocr_scan import OcrScan
from app.services.ocr.cleanup import cleanup_stale_scans
from app.services.ocr.client import OcrServiceError
from app.tests.conftest import TEST_DATABASE_URL
from app.services.ocr.temp_storage import stale_temp_files, temp_path


@pytest.fixture(autouse=True)
def _temp_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "ocr_temp_dir", str(tmp_path / "ocr-temp"))


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


def _patch_ocr_pipeline(monkeypatch, *, text: str = "extracted text", fail: bool = False) -> list[bytes]:
    """Returns the list of photos "uploaded to R2", so tests can assert whether
    an upload happened."""
    uploads: list[bytes] = []

    async def fake_upload(raw, *, owner_id):
        uploads.append(raw)
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
    return uploads


async def test_extract_keeps_photo_local_and_does_not_upload(client, monkeypatch):
    headers = await _register_and_login(client, "ocr-extract@example.com")
    uploads = _patch_ocr_pipeline(monkeypatch, text="bonjour le monde")

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
    assert body["image_url"] is None
    assert uploads == []
    assert temp_path(uuid.UUID(body["id"])).is_file()


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


async def test_extract_works_without_r2_credentials(client, monkeypatch):
    headers = await _register_and_login(client, "ocr-noconfig@example.com")
    _patch_ocr_pipeline(monkeypatch)
    for name in ("r2_account_id", "r2_access_key_id", "r2_secret_access_key"):
        monkeypatch.setattr(settings, name, "")

    resp = await client.post(
        "/api/v1/ocr/extract",
        files={"file": ("scan.jpg", _fake_jpeg_bytes(), "image/jpeg")},
        data={"mode": "general"},
        headers=headers,
    )
    assert resp.status_code == 201


async def _extract(client, headers, mode: str = "general") -> dict:
    resp = await client.post(
        "/api/v1/ocr/extract",
        files={"file": ("scan.jpg", _fake_jpeg_bytes(), "image/jpeg")},
        data={"mode": mode},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


async def _create_card(client, headers) -> dict:
    category_id = (await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)).json()["id"]
    return (
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": "placeholder", "back_text": "placeholder"},
            headers=headers,
        )
    ).json()


async def test_link_without_r2_credentials_returns_503_and_keeps_temp_photo(client, monkeypatch):
    headers = await _register_and_login(client, "ocr-link-noconfig@example.com")

    async def fake_extract(raw, *, mode, content_type):
        return "text"

    monkeypatch.setattr(ocr_routes, "extract_text", fake_extract)  # real uploader stays in place
    for name in ("r2_account_id", "r2_access_key_id", "r2_secret_access_key"):
        monkeypatch.setattr(settings, name, "")
    scan = await _extract(client, headers)
    card = await _create_card(client, headers)

    resp = await client.patch(f"/api/v1/ocr/scans/{scan['id']}/link", json={"card_id": card["id"]}, headers=headers)
    assert resp.status_code == 503
    assert "R2_ACCOUNT_ID" in resp.json()["detail"]
    assert temp_path(uuid.UUID(scan["id"])).is_file()


async def test_link_uploads_photo_and_deletes_temp_file(client, monkeypatch):
    headers = await _register_and_login(client, "ocr-link@example.com")
    uploads = _patch_ocr_pipeline(monkeypatch, text="front text")
    card = await _create_card(client, headers)
    scan = await _extract(client, headers)
    assert uploads == []

    link_resp = await client.patch(
        f"/api/v1/ocr/scans/{scan['id']}/link", json={"card_id": card["id"]}, headers=headers
    )
    assert link_resp.status_code == 200
    assert link_resp.json()["card_id"] == card["id"]
    assert link_resp.json()["image_url"].startswith("https://r2.example.com/")
    assert len(uploads) == 1
    assert not temp_path(uuid.UUID(scan["id"])).exists()

    list_resp = await client.get("/api/v1/ocr/scans", params={"card_id": card["id"]}, headers=headers)
    assert [s["id"] for s in list_resp.json()] == [scan["id"]]


async def test_link_after_temp_photo_is_gone_returns_410(client, monkeypatch):
    headers = await _register_and_login(client, "ocr-gone@example.com")
    _patch_ocr_pipeline(monkeypatch)
    card = await _create_card(client, headers)
    scan = await _extract(client, headers)
    temp_path(uuid.UUID(scan["id"])).unlink()

    resp = await client.patch(f"/api/v1/ocr/scans/{scan['id']}/link", json={"card_id": card["id"]}, headers=headers)
    assert resp.status_code == 410


async def test_discard_deletes_temp_file_and_row_without_uploading(client, monkeypatch):
    headers = await _register_and_login(client, "ocr-discard@example.com")
    uploads = _patch_ocr_pipeline(monkeypatch)
    scan = await _extract(client, headers)

    resp = await client.delete(f"/api/v1/ocr/scans/{scan['id']}", headers=headers)
    assert resp.status_code == 204
    assert uploads == []
    assert not temp_path(uuid.UUID(scan["id"])).exists()

    again = await client.delete(f"/api/v1/ocr/scans/{scan['id']}", headers=headers)
    assert again.status_code == 404


async def test_discard_refuses_a_scan_that_was_kept(client, monkeypatch):
    headers = await _register_and_login(client, "ocr-discard-kept@example.com")
    _patch_ocr_pipeline(monkeypatch)
    card = await _create_card(client, headers)
    scan = await _extract(client, headers)
    await client.patch(f"/api/v1/ocr/scans/{scan['id']}/link", json={"card_id": card["id"]}, headers=headers)

    resp = await client.delete(f"/api/v1/ocr/scans/{scan['id']}", headers=headers)
    assert resp.status_code == 409


async def test_link_scan_to_another_users_card_is_rejected(client, monkeypatch):
    owner_headers = await _register_and_login(client, "ocr-owner@example.com")
    other_headers = await _register_and_login(client, "ocr-other@example.com")
    uploads = _patch_ocr_pipeline(monkeypatch)
    card = await _create_card(client, owner_headers)
    scan = await _extract(client, other_headers)

    resp = await client.patch(
        f"/api/v1/ocr/scans/{scan['id']}/link", json={"card_id": card["id"]}, headers=other_headers
    )
    assert resp.status_code == 404
    assert uploads == []


async def test_cleanup_script_removes_stale_photos_and_pending_rows_only(client, monkeypatch):
    engine = create_async_engine(TEST_DATABASE_URL)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def pending_rows() -> int:
        async with session_factory() as session:
            return await session.scalar(select(func.count()).select_from(OcrScan).where(OcrScan.r2_object_key.is_(None)))

    async def total_rows() -> int:
        async with session_factory() as session:
            return await session.scalar(select(func.count()).select_from(OcrScan))

    headers = await _register_and_login(client, "ocr-cleanup@example.com")
    _patch_ocr_pipeline(monkeypatch)
    card = await _create_card(client, headers)
    kept = await _extract(client, headers)
    await client.patch(f"/api/v1/ocr/scans/{kept['id']}/link", json={"card_id": card["id"]}, headers=headers)
    stale = await _extract(client, headers)
    fresh = await _extract(client, headers)

    old = time.time() - 3 * 3600
    os.utime(temp_path(uuid.UUID(stale["id"])), (old, old))

    assert [p.name for p in stale_temp_files(3600)] == [temp_path(uuid.UUID(stale["id"])).name]
    files, rows = await cleanup_stale_scans(max_age_minutes=60, dry_run=True, session_factory=session_factory)
    assert (files, rows) == (1, 0)  # only the photo is old; pending rows are timestamped just now
    assert temp_path(uuid.UUID(stale["id"])).exists()
    assert await pending_rows() == 2

    files, _ = await cleanup_stale_scans(max_age_minutes=60, dry_run=False, session_factory=session_factory)
    assert files == 1
    assert not temp_path(uuid.UUID(stale["id"])).exists()
    assert temp_path(uuid.UUID(fresh["id"])).exists()

    files, rows = await cleanup_stale_scans(max_age_minutes=0, dry_run=False, session_factory=session_factory)
    assert (files, rows) == (1, 2)
    assert not temp_path(uuid.UUID(fresh["id"])).exists()
    assert await pending_rows() == 0
    assert await total_rows() == 1  # the kept scan survives
    await engine.dispose()


async def test_extract_sweeps_old_abandoned_photos_in_background(client, monkeypatch):
    headers = await _register_and_login(client, "ocr-sweep@example.com")
    _patch_ocr_pipeline(monkeypatch)
    abandoned = await _extract(client, headers)
    abandoned_path = temp_path(uuid.UUID(abandoned["id"]))
    old = time.time() - 3 * 3600
    os.utime(abandoned_path, (old, old))

    recent = await _extract(client, headers)  # this request's background task purges the old one

    assert not abandoned_path.exists()
    assert temp_path(uuid.UUID(recent["id"])).exists()
