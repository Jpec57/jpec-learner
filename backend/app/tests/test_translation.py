import httpx
import pytest

from app.services.translation import providers


async def _register_and_login(client, email: str) -> dict:
    await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "password123", "display_name": email}
    )
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


JISHO_STUDY = {
    "data": [
        {
            "is_common": True,
            "japanese": [{"word": "勉強", "reading": "べんきょう"}],
            "senses": [
                {"english_definitions": ["study"]},
                {"english_definitions": ["diligence", "working hard"]},
            ],
        }
    ]
}


@pytest.fixture
def fake_web(monkeypatch):
    """Routes the providers' HTTP calls to canned responses by host. Returns the
    list of requests made, so tests can assert which services were tried."""
    responses: dict[str, httpx.Response | Exception] = {}
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        outcome = responses.get(request.url.host, httpx.Response(500))
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        providers.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    responses["calls"] = calls  # type: ignore[assignment]
    return responses


async def test_japanese_to_english_uses_jisho_senses(client, fake_web):
    headers = await _register_and_login(client, "tr-ja@example.com")
    fake_web["jisho.org"] = httpx.Response(200, json=JISHO_STUDY)

    resp = await client.post(
        "/api/v1/translate", json={"text": "勉強", "source": "ja", "target": "en"}, headers=headers
    )

    assert resp.status_code == 200
    # Every definition is a valid answer, so each can become its own typed answer.
    assert resp.json() == {
        "translation": "study",
        "answers": ["study", "diligence", "working hard"],
        "alternatives": ["study", "diligence", "working hard"],
        "provider": "jisho",
    }


async def test_english_to_japanese_returns_word_then_reading(client, fake_web):
    headers = await _register_and_login(client, "tr-en-ja@example.com")
    fake_web["jisho.org"] = httpx.Response(200, json=JISHO_STUDY)

    resp = await client.post(
        "/api/v1/translate", json={"text": "study", "source": "en", "target": "ja"}, headers=headers
    )

    assert resp.json()["translation"] == "勉強"
    assert resp.json()["answers"] == ["勉強", "べんきょう"]
    assert resp.json()["alternatives"] == ["勉強", "べんきょう"]


async def test_other_pairs_use_mymemory_and_rank_candidates(client, fake_web):
    headers = await _register_and_login(client, "tr-fr@example.com")
    fake_web["api.mymemory.translated.net"] = httpx.Response(
        200,
        json={
            "responseData": {"translatedText": "closure", "match": 1},
            "responseStatus": 200,
            "quotaFinished": False,
            "matches": [
                {"translation": "closure", "match": 1, "usage-count": 6},
                {"translation": "fast", "match": 0.99, "usage-count": 5},
                {"translation": "search", "match": 0.99, "usage-count": 2},
            ],
        },
    )

    resp = await client.post(
        "/api/v1/translate", json={"text": "rapide", "source": "fr", "target": "en"}, headers=headers
    )

    # Noisy candidates are only suggestions: the sole valid answer is the top one.
    assert resp.json() == {
        "translation": "closure",
        "answers": ["closure"],
        "alternatives": ["closure", "fast", "search"],
        "provider": "mymemory",
    }
    assert [c.url.host for c in fake_web["calls"]] == ["api.mymemory.translated.net"]


async def test_jisho_ignores_entries_that_only_partially_match_a_sentence(client, fake_web):
    headers = await _register_and_login(client, "tr-sentence@example.com")
    fake_web["jisho.org"] = httpx.Response(
        200,
        json={"data": [{"japanese": [{"word": None, "reading": "あの"}], "senses": [{"english_definitions": ["that"]}]}]},
    )
    fake_web["api.mymemory.translated.net"] = httpx.Response(
        200, json={"responseData": {"translatedText": "I really want to see that game"}, "responseStatus": 200}
    )

    resp = await client.post(
        "/api/v1/translate",
        json={"text": "あの試合はどうしても見たい", "source": "ja", "target": "en"},
        headers=headers,
    )

    assert resp.json()["provider"] == "mymemory"
    assert resp.json()["translation"] == "I really want to see that game"


async def test_english_to_japanese_prefers_the_common_word(client, fake_web):
    headers = await _register_and_login(client, "tr-common@example.com")
    fake_web["jisho.org"] = httpx.Response(
        200,
        json={
            "data": [
                {"japanese": [{"word": "書斎", "reading": "しょさい"}], "senses": [{"english_definitions": ["study"]}]},
                *JISHO_STUDY["data"],
            ]
        },
    )

    resp = await client.post(
        "/api/v1/translate", json={"text": "Study", "source": "en", "target": "ja"}, headers=headers
    )

    assert resp.json()["translation"] == "勉強"


async def test_falls_back_to_mymemory_when_jisho_fails_or_finds_nothing(client, fake_web):
    headers = await _register_and_login(client, "tr-fallback@example.com")
    fake_web["jisho.org"] = httpx.ConnectError("down")
    fake_web["api.mymemory.translated.net"] = httpx.Response(
        200,
        json={
            "responseData": {"translatedText": "I want to see that match"},
            "responseStatus": 200,
            "matches": [],
        },
    )

    resp = await client.post(
        "/api/v1/translate",
        json={"text": "あの試合は見たい", "source": "ja", "target": "en"},
        headers=headers,
    )

    assert resp.status_code == 200
    assert resp.json()["provider"] == "mymemory"
    assert resp.json()["translation"] == "I want to see that match"
    assert [c.url.host for c in fake_web["calls"]] == ["jisho.org", "api.mymemory.translated.net"]


async def test_502_when_no_provider_can_translate(client, fake_web):
    headers = await _register_and_login(client, "tr-502@example.com")
    fake_web["api.mymemory.translated.net"] = httpx.Response(429)

    resp = await client.post(
        "/api/v1/translate", json={"text": "rapide", "source": "fr", "target": "en"}, headers=headers
    )

    assert resp.status_code == 502


async def test_translate_validates_input_and_requires_auth(client, fake_web):
    headers = await _register_and_login(client, "tr-validate@example.com")

    same = await client.post(
        "/api/v1/translate", json={"text": "hi", "source": "en", "target": "en"}, headers=headers
    )
    assert same.status_code == 400
    bad_code = await client.post(
        "/api/v1/translate", json={"text": "hi", "source": "english", "target": "fr"}, headers=headers
    )
    assert bad_code.status_code == 422
    anonymous = await client.post("/api/v1/translate", json={"text": "hi", "source": "en", "target": "fr"})
    assert anonymous.status_code in (401, 403)
    assert fake_web["calls"] == []
