import httpx

from app.core.config import settings

REQUEST_TIMEOUT_SECONDS = 60.0


class OcrServiceError(RuntimeError):
    """Raised when the self-hosted OCR microservice is unreachable or rejects
    the request, so the route can turn it into a clean 502 instead of a stack
    trace (mirrors services/assistant/providers.py's ProviderError)."""


async def extract_text(raw: bytes, *, mode: str, content_type: str) -> str:
    files = {"file": ("scan.jpg", raw, content_type)}
    data = {"mode": mode}
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(f"{settings.ocr_service_url}/extract", files=files, data=data)
    except httpx.HTTPError as exc:
        raise OcrServiceError(f"OCR service unreachable: {exc}") from exc

    if response.is_error:
        raise OcrServiceError(f"OCR service returned {response.status_code}: {response.text}")

    return response.json()["text"]
