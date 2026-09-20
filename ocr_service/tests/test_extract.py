"""Integration test for the OCR microservice against a real math screenshot.

Needs a running service with the models loaded (~2GB), so it is skipped when
the service is unreachable. Point it at one with OCR_SERVICE_URL, e.g. from the
backend container:

    OCR_SERVICE_URL=http://ocr:8090 pytest ocr_service/tests
"""

import os
import re
from pathlib import Path

import httpx
import pytest

OCR_SERVICE_URL = os.environ.get("OCR_SERVICE_URL", "http://localhost:8090")
FIXTURES = Path(__file__).parent / "fixtures"
# First request per mode is slow on CPU (model warm-up).
REQUEST_TIMEOUT_SECONDS = 300.0


def _service_is_up() -> bool:
    try:
        # FastAPI serves its docs page whenever the app (and its lifespan) is up.
        return httpx.get(f"{OCR_SERVICE_URL}/docs", timeout=3.0).is_success
    except httpx.HTTPError:
        return False


pytestmark = pytest.mark.skipif(not _service_is_up(), reason=f"OCR service not reachable at {OCR_SERVICE_URL}")


def _extract(image_path: Path, mode: str) -> str:
    response = httpx.post(
        f"{OCR_SERVICE_URL}/extract",
        files={"file": (image_path.name, image_path.read_bytes(), "image/png")},
        data={"mode": mode},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    assert response.status_code == 200, response.text
    return response.json()["text"]


def _normalize(text: str) -> str:
    text = text.replace("’", "'")
    return re.sub(r"\s+", " ", text).lower()


def test_dark_mode_math_exercise_statement_is_extracted():
    """math.png is a dark-mode screenshot (light text on a dark background) of a
    French exercise on the ring of matrices (a b; 0 a). Without polarity
    correction the service returned only the two numbered questions and lost
    the statement entirely."""
    text = _normalize(_extract(FIXTURES / "math.png", "general"))

    # Statement (the part that used to be dropped).
    assert "soit a l'ensemble des matrices" in text
    assert "entiers relatifs" in text
    # Both numbered questions.
    assert "démontrer que a est un anneau" in text
    assert "lois d'addition et de produits de matrices" in text
    assert "déterminer les éléments inversibles de a" in text
