from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.assistant import ChatMessageIn, LLMProviderName, ToolEventOut
from app.services.assistant.providers import ToolResult, build_provider
from app.services.assistant.tools import TOOL_SPECS, execute_tool


@dataclass
class ResolvedCredential:
    """A decrypted, non-persisted stand-in for LLMCredential -- kept separate from
    the ORM entity so the plaintext key can never be flushed to the database."""

    provider: LLMProviderName
    api_key: str
    model: str | None

# Safety valve against a model that keeps calling tools without ever settling
# on a final answer -- each iteration is one round trip to the provider.
MAX_TOOL_ITERATIONS = 8

SYSTEM_PROMPT = """You are the study-materials assistant embedded in jpeclearner, a spaced-repetition \
flashcard app organized as: categories (decks) > a tree of groups/lessons > flashcards.

You help the user create categories, groups, lessons and flashcards using the tools available to you. \
Prefer using list_categories/list_hierarchy to find existing IDs rather than guessing them. When the user \
asks for several cards on a topic, generate good front/back pairs yourself and use create_cards_bulk. \
Keep replies short: briefly confirm what you created, and ask a clarifying question only when the request \
is genuinely ambiguous (e.g. which category to use).{category_context}"""


def _category_context(category_id: str | None) -> str:
    if not category_id:
        return ""
    return f"\n\nThe user currently has category id={category_id} open -- default to it unless they say otherwise."


async def run_chat(
    db: AsyncSession,
    current_user: User,
    credential: ResolvedCredential,
    messages: list[ChatMessageIn],
    category_id: str | None,
) -> tuple[ChatMessageIn, list[ToolEventOut]]:
    provider = build_provider(credential.provider, credential.api_key, credential.model)
    system = SYSTEM_PROMPT.format(category_context=_category_context(category_id))

    tool_events: list[ToolEventOut] = []

    result = await provider.start(system=system, history=messages, tools=TOOL_SPECS)

    for _ in range(MAX_TOOL_ITERATIONS):
        if not result.tool_calls:
            break

        tool_results: list[ToolResult] = []
        for call in result.tool_calls:
            execution = await execute_tool(db, current_user, call.name, call.arguments)
            tool_events.append(
                ToolEventOut(tool=call.name, args=call.arguments, ok=execution.ok, summary=execution.summary)
            )
            tool_results.append(ToolResult(id=call.id, name=call.name, content=execution.summary))

        result = await provider.continue_with_tool_results(tool_results)

    final_text = result.text or "Done."
    return ChatMessageIn(role="assistant", content=final_text), tool_events
