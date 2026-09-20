import pytest

from app.services.assistant import orchestrator
from app.services.assistant.providers import ProviderResult, ToolCall


async def _register_and_login(client, email="assistant@example.com"):
    await client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    login_resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def test_credential_crud_roundtrip(client):
    headers = await _register_and_login(client)

    empty_resp = await client.get("/api/v1/assistant/credential", headers=headers)
    assert empty_resp.status_code == 200
    assert empty_resp.json() == {"configured": False, "provider": None, "model": None, "updated_at": None}

    set_resp = await client.put(
        "/api/v1/assistant/credential",
        json={"provider": "claude", "api_key": "sk-test-123", "model": "claude-sonnet-4-5"},
        headers=headers,
    )
    assert set_resp.status_code == 200
    body = set_resp.json()
    assert body["configured"] is True
    assert body["provider"] == "claude"
    assert body["model"] == "claude-sonnet-4-5"
    assert "api_key" not in body

    get_resp = await client.get("/api/v1/assistant/credential", headers=headers)
    assert get_resp.json()["provider"] == "claude"

    # overwriting switches provider
    switch_resp = await client.put(
        "/api/v1/assistant/credential",
        json={"provider": "gemini", "api_key": "gm-test-456"},
        headers=headers,
    )
    assert switch_resp.json()["provider"] == "gemini"

    delete_resp = await client.delete("/api/v1/assistant/credential", headers=headers)
    assert delete_resp.status_code == 204

    after_delete = await client.get("/api/v1/assistant/credential", headers=headers)
    assert after_delete.json()["configured"] is False


async def test_chat_requires_configured_credential(client):
    headers = await _register_and_login(client, email="nokey@example.com")
    resp = await client.post(
        "/api/v1/assistant/chat", json={"messages": [{"role": "user", "content": "hi"}]}, headers=headers
    )
    assert resp.status_code == 400


async def test_chat_runs_tool_calls_and_creates_a_category_and_card(client, monkeypatch):
    headers = await _register_and_login(client, email="chat@example.com")

    await client.put(
        "/api/v1/assistant/credential",
        json={"provider": "claude", "api_key": "sk-fake"},
        headers=headers,
    )

    call_log = []

    class FakeProvider:
        def __init__(self, *args, **kwargs):
            self._step = 0

        async def start(self, *, system, history, tools):
            call_log.append(("start", history[-1].content))
            self._step = 1
            return ProviderResult(
                text=None,
                tool_calls=[ToolCall(id="call-1", name="create_category", arguments={"name": "Spanish"})],
            )

        async def continue_with_tool_results(self, results):
            call_log.append(("continue", self._step, [r.content for r in results]))
            if self._step == 1:
                self._step = 2
                category_id = _extract_category_id(results[0].content)
                return ProviderResult(
                    text=None,
                    tool_calls=[
                        ToolCall(
                            id="call-2",
                            name="create_card",
                            arguments={
                                "category_id": category_id,
                                "front_text": "hola",
                                "back_text": "hello",
                            },
                        )
                    ],
                )
            return ProviderResult(text="Created the Spanish category with one card.", tool_calls=[])

    def _extract_category_id(summary: str) -> str:
        # summary looks like "Created category 'Spanish' (id=<uuid>, slug=...)."
        return summary.split("id=")[1].split(",")[0]

    monkeypatch.setattr(orchestrator, "build_provider", lambda provider, api_key, model: FakeProvider())

    resp = await client.post(
        "/api/v1/assistant/chat",
        json={"messages": [{"role": "user", "content": "Create a Spanish category with one card: hola/hello"}]},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["message"]["content"] == "Created the Spanish category with one card."
    assert [e["tool"] for e in body["tool_events"]] == ["create_category", "create_card"]
    assert all(e["ok"] for e in body["tool_events"])

    categories_resp = await client.get("/api/v1/categories", headers=headers)
    names = [c["name"] for c in categories_resp.json()]
    assert "Spanish" in names


async def test_chat_reports_tool_failure_without_crashing(client, monkeypatch):
    headers = await _register_and_login(client, email="fail@example.com")
    await client.put(
        "/api/v1/assistant/credential", json={"provider": "chatgpt", "api_key": "sk-fake"}, headers=headers
    )

    class FakeProvider:
        def __init__(self, *args, **kwargs):
            self._done = False

        async def start(self, *, system, history, tools):
            return ProviderResult(
                text=None,
                tool_calls=[ToolCall(id="call-1", name="create_card", arguments={"front_text": "only front"})],
            )

        async def continue_with_tool_results(self, results):
            assert results[0].content.startswith("Missing required argument")
            return ProviderResult(text="I need a back_text and category_id to make that card.", tool_calls=[])

    monkeypatch.setattr(orchestrator, "build_provider", lambda provider, api_key, model: FakeProvider())

    resp = await client.post(
        "/api/v1/assistant/chat",
        json={"messages": [{"role": "user", "content": "make a card"}]},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["tool_events"][0]["ok"] is False


def _walk_schema_keys(node):
    """Every JSON-Schema keyword used anywhere in a schema (property names excluded)."""
    if isinstance(node, dict):
        for key, value in node.items():
            yield key
            if key == "properties":
                for sub in value.values():
                    yield from _walk_schema_keys(sub)
            else:
                yield from _walk_schema_keys(value)
    elif isinstance(node, list):
        for item in node:
            yield from _walk_schema_keys(item)


def test_gemini_function_declarations_only_use_supported_schema_keywords():
    from app.services.assistant.providers import _GEMINI_SCHEMA_KEYS, to_gemini_function_declaration
    from app.services.assistant.tools import TOOL_SPECS

    for tool in TOOL_SPECS:
        declaration = to_gemini_function_declaration(tool)
        assert set(_walk_schema_keys(declaration.get("parameters", {}))) <= _GEMINI_SCHEMA_KEYS, tool.name

    # additionalProperties is what Gemini rejected in production (400 Unknown name)
    assert any("additionalProperties" in tool.parameters for tool in TOOL_SPECS)


def test_gemini_omits_parameters_for_parameterless_tools_and_keeps_property_names():
    from app.services.assistant.providers import to_gemini_function_declaration
    from app.services.assistant.tools import TOOL_SPECS

    by_name = {t.name: to_gemini_function_declaration(t) for t in TOOL_SPECS}
    assert "parameters" not in by_name["list_categories"]

    bulk = by_name["create_cards_bulk"]["parameters"]
    assert set(bulk["properties"]) == {"category_id", "lesson_node_id", "cards"}
    assert bulk["properties"]["cards"]["items"]["properties"]["front_text"] == {"type": "string"}
    assert bulk["properties"]["cards"]["maxItems"] == 50
    assert bulk["required"] == ["category_id", "cards"]


async def test_gemini_tool_round_trip_uses_only_roles_the_api_accepts(monkeypatch):
    """Gemini rejected role "function" (400) when returning tool results."""
    import httpx

    from app.schemas.assistant import ChatMessageIn
    from app.services.assistant import providers
    from app.services.assistant.tools import TOOL_SPECS

    requests: list[dict] = []
    replies = [
        {"candidates": [{"content": {"parts": [{"functionCall": {"name": "list_categories", "args": {}}}]}}]},
        {"candidates": [{"content": {"parts": [{"text": "You have no decks."}]}}]},
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        requests.append(json.loads(request.content))
        return httpx.Response(200, json=replies[len(requests) - 1])

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        providers.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)
    )

    provider = providers.GeminiProvider("key", "gemini-test")
    first = await provider.start(
        system="sys", history=[ChatMessageIn(role="user", content="list my decks")], tools=TOOL_SPECS
    )
    assert [c.name for c in first.tool_calls] == ["list_categories"]

    second = await provider.continue_with_tool_results(
        [providers.ToolResult(id=first.tool_calls[0].id, name="list_categories", content="No categories exist yet.")]
    )
    assert second.text == "You have no decks."

    roles = [c["role"] for c in requests[1]["contents"]]
    assert roles == ["user", "model", "user"]
    assert requests[1]["contents"][-1]["parts"][0]["functionResponse"]["name"] == "list_categories"
