import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from app.schemas.assistant import ChatMessageIn, LLMProviderName

REQUEST_TIMEOUT_SECONDS = 60.0

DEFAULT_MODELS: dict[LLMProviderName, str] = {
    "claude": "claude-sonnet-4-5",
    "chatgpt": "gpt-4o",
    "gemini": "gemini-2.0-flash",
}


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ToolResult:
    id: str
    name: str
    content: str


@dataclass
class ProviderResult:
    text: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)


class LLMProvider(Protocol):
    async def start(
        self, *, system: str, history: list[ChatMessageIn], tools: list[ToolSpec]
    ) -> ProviderResult: ...

    async def continue_with_tool_results(self, results: list[ToolResult]) -> ProviderResult: ...


class ProviderError(RuntimeError):
    """Raised when the provider's API rejects the request (bad key, quota, etc.)
    so the route can turn it into a clean 502 instead of a stack trace."""


def _raise_for_status(response: httpx.Response, provider: str) -> None:
    if response.is_error:
        raise ProviderError(f"{provider} API error ({response.status_code}): {response.text[:500]}")


class AnthropicProvider:
    _API_URL = "https://api.anthropic.com/v1/messages"

    def __init__(self, api_key: str, model: str):
        self._api_key = api_key
        self._model = model
        self._messages: list[dict[str, Any]] = []
        self._system = ""
        self._tools: list[dict[str, Any]] = []

    async def start(self, *, system: str, history: list[ChatMessageIn], tools: list[ToolSpec]) -> ProviderResult:
        self._system = system
        self._tools = [
            {"name": t.name, "description": t.description, "input_schema": t.parameters} for t in tools
        ]
        self._messages = [{"role": m.role, "content": m.content} for m in history]
        return await self._send()

    async def continue_with_tool_results(self, results: list[ToolResult]) -> ProviderResult:
        self._messages.append(
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": r.id, "content": r.content} for r in results
                ],
            }
        )
        return await self._send()

    async def _send(self) -> ProviderResult:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                self._API_URL,
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self._model,
                    "max_tokens": 4096,
                    "system": self._system,
                    "messages": self._messages,
                    "tools": self._tools,
                },
            )
        _raise_for_status(response, "Anthropic")
        data = response.json()
        content_blocks = data.get("content", [])
        self._messages.append({"role": "assistant", "content": content_blocks})

        text_parts = [b["text"] for b in content_blocks if b.get("type") == "text"]
        tool_calls = [
            ToolCall(id=b["id"], name=b["name"], arguments=b.get("input", {}))
            for b in content_blocks
            if b.get("type") == "tool_use"
        ]
        return ProviderResult(text="\n".join(text_parts) or None, tool_calls=tool_calls)


class OpenAIProvider:
    """Used for the "chatgpt" provider choice."""

    _API_URL = "https://api.openai.com/v1/chat/completions"

    def __init__(self, api_key: str, model: str):
        self._api_key = api_key
        self._model = model
        self._messages: list[dict[str, Any]] = []
        self._tools: list[dict[str, Any]] = []

    async def start(self, *, system: str, history: list[ChatMessageIn], tools: list[ToolSpec]) -> ProviderResult:
        self._tools = [
            {"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.parameters}}
            for t in tools
        ]
        self._messages = [{"role": "system", "content": system}] + [
            {"role": m.role, "content": m.content} for m in history
        ]
        return await self._send()

    async def continue_with_tool_results(self, results: list[ToolResult]) -> ProviderResult:
        for r in results:
            self._messages.append({"role": "tool", "tool_call_id": r.id, "content": r.content})
        return await self._send()

    async def _send(self) -> ProviderResult:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                self._API_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": self._model,
                    "messages": self._messages,
                    "tools": self._tools,
                    "tool_choice": "auto",
                },
            )
        _raise_for_status(response, "OpenAI")
        data = response.json()
        message = data["choices"][0]["message"]
        self._messages.append(message)

        raw_tool_calls = message.get("tool_calls") or []
        tool_calls = [
            ToolCall(id=tc["id"], name=tc["function"]["name"], arguments=json.loads(tc["function"]["arguments"] or "{}"))
            for tc in raw_tool_calls
        ]
        return ProviderResult(text=message.get("content"), tool_calls=tool_calls)


class GeminiProvider:
    _API_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def __init__(self, api_key: str, model: str):
        self._api_key = api_key
        self._model = model
        self._contents: list[dict[str, Any]] = []
        self._system = ""
        self._function_declarations: list[dict[str, Any]] = []

    async def start(self, *, system: str, history: list[ChatMessageIn], tools: list[ToolSpec]) -> ProviderResult:
        self._system = system
        self._function_declarations = [
            {"name": t.name, "description": t.description, "parameters": t.parameters} for t in tools
        ]
        self._contents = [
            {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]} for m in history
        ]
        return await self._send()

    async def continue_with_tool_results(self, results: list[ToolResult]) -> ProviderResult:
        self._contents.append(
            {
                "role": "function",
                "parts": [
                    {"functionResponse": {"name": r.name, "response": {"result": r.content}}} for r in results
                ],
            }
        )
        return await self._send()

    async def _send(self) -> ProviderResult:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                self._API_URL_TEMPLATE.format(model=self._model),
                params={"key": self._api_key},
                json={
                    "system_instruction": {"parts": [{"text": self._system}]},
                    "contents": self._contents,
                    "tools": [{"function_declarations": self._function_declarations}]
                    if self._function_declarations
                    else [],
                },
            )
        _raise_for_status(response, "Gemini")
        data = response.json()
        candidates = data.get("candidates") or []
        parts = candidates[0]["content"]["parts"] if candidates else []
        self._contents.append({"role": "model", "parts": parts})

        text_parts = [p["text"] for p in parts if "text" in p]
        tool_calls = [
            ToolCall(id=f"{p['functionCall']['name']}-{uuid.uuid4().hex[:8]}", name=p["functionCall"]["name"], arguments=p["functionCall"].get("args", {}))
            for p in parts
            if "functionCall" in p
        ]
        return ProviderResult(text="\n".join(text_parts) or None, tool_calls=tool_calls)


def build_provider(provider: LLMProviderName, api_key: str, model: str | None) -> LLMProvider:
    resolved_model = model or DEFAULT_MODELS[provider]
    if provider == "claude":
        return AnthropicProvider(api_key, resolved_model)
    if provider == "chatgpt":
        return OpenAIProvider(api_key, resolved_model)
    if provider == "gemini":
        return GeminiProvider(api_key, resolved_model)
    raise ValueError(f"Unsupported provider: {provider}")
