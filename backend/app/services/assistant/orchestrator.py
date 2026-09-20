import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.user import User
from app.schemas.assistant import ChatMessageIn, ChatMode, LLMProviderName, ToolEventOut, ToolRefOut
from app.services.assistant.providers import ToolResult, build_provider
from app.services.assistant.tools import TOOL_SPECS, execute_tool
from app.services.plan import compute_plan_progress, render_progress_summary


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
# Coaching legitimately chains more calls (read plan, read progress, create a group,
# a lesson, then card batches), so it gets a little more headroom.
MAX_COACH_TOOL_ITERATIONS = 12

SYSTEM_PROMPT = """You are the study-materials assistant embedded in jpeclearner, a spaced-repetition \
flashcard app organized as: categories (decks) > a tree of groups/lessons > flashcards.

You help the user create categories, groups, lessons and flashcards using the tools available to you. \
Prefer using list_categories/list_hierarchy to find existing IDs rather than guessing them. When the user \
asks for several cards on a topic, generate good front/back pairs yourself and use create_cards_bulk. \
Keep replies short: briefly confirm what you created, and ask a clarifying question only when the request \
is genuinely ambiguous (e.g. which category to use).{category_context}"""

COACH_SYSTEM_PROMPT = """You are the personal teacher ("coach") inside jpeclearner, a spaced-repetition app \
organized as: categories (decks) > a tree of groups/lessons > cards. The learner has a long-term GOAL for the \
deck and a markdown PLAN: each '## ' heading is a sub-goal (chapter), '### ' a topic, '- [ ]' lines milestones. \
A sub-goal is linked to the group/lesson with the same title.

Teach like a good tutor, not a content vending machine:
- Ground every recommendation in the learner's real data. Start from the snapshot below (call \
get_plan_progress for a fresh one after they've studied). Never guess how they are doing.
- Put the accent on WEAKNESSES: sub-goals marked weak first, then no_content (nothing to practice yet), then \
not_started, then the weakest cards. Do not spend effort on sections that are solid unless asked.
- Explain what is wrong and why, name the underlying concept, and say what to do next. Be direct and encouraging, \
never vague. Ask one short question when you need to diagnose (e.g. what they find hard).
- When they need practice, generate EXERCISES with create_cards_bulk: the exercise statement in front_text, a \
complete worked solution in back_text (markdown, LaTeX as $...$ / $$...$$ when the subject is scientific), an \
optional hint that nudges without giving the answer, answer_mode "reveal". Vary difficulty (warm-up, standard, \
harder), target the exact weakness, and avoid duplicating what already exists (check list_hierarchy).
- File them under the group whose title matches the sub-goal heading EXACTLY (create_group with that exact \
title if it doesn't exist; use create_lesson for a short lesson recap first when the concept itself is missing).
- The plan belongs to the learner. Change it (update_plan) only when asked or after proposing the change and \
getting a yes; always get_plan first, resend the full text, and keep their wording and headings.
- Keep replies short. End with one concrete next step.{category_context}"""


def _category_context(category_id: str | None) -> str:
    if not category_id:
        return ""
    return f"\n\nThe user currently has category id={category_id} open -- default to it unless they say otherwise."


async def _coach_context(db: AsyncSession, current_user: User, category_id: str | None) -> str:
    """The open deck plus a compact plan-progress snapshot, so the coach starts
    informed instead of spending its first tool calls on discovery."""
    context = _category_context(category_id)
    if not category_id:
        return context + "\n\nNo deck is open: use list_categories and ask which deck to coach."
    try:
        category = await db.get(Category, uuid.UUID(category_id))
    except ValueError:
        return context
    if category is None or category.deleted_at is not None or category.owner_id != current_user.id:
        return context
    progress = await compute_plan_progress(
        db,
        user_id=current_user.id,
        category_id=category.id,
        goal=category.goal,
        plan_markdown=category.plan_markdown,
    )
    return f"{context}\n\nDeck: {category.name} (type={category.deck_type})\n\nSnapshot:\n{render_progress_summary(progress)}"


async def run_chat(
    db: AsyncSession,
    current_user: User,
    credential: ResolvedCredential,
    messages: list[ChatMessageIn],
    category_id: str | None,
    mode: ChatMode = "builder",
) -> tuple[ChatMessageIn, list[ToolEventOut]]:
    provider = build_provider(credential.provider, credential.api_key, credential.model)
    if mode == "coach":
        system = COACH_SYSTEM_PROMPT.format(category_context=await _coach_context(db, current_user, category_id))
        max_iterations = MAX_COACH_TOOL_ITERATIONS
    else:
        system = SYSTEM_PROMPT.format(category_context=_category_context(category_id))
        max_iterations = MAX_TOOL_ITERATIONS

    tool_events: list[ToolEventOut] = []

    result = await provider.start(system=system, history=messages, tools=TOOL_SPECS)

    for _ in range(max_iterations):
        if not result.tool_calls:
            break

        tool_results: list[ToolResult] = []
        for call in result.tool_calls:
            execution = await execute_tool(db, current_user, call.name, call.arguments)
            tool_events.append(
                ToolEventOut(
                    tool=call.name,
                    args=call.arguments,
                    ok=execution.ok,
                    summary=execution.summary,
                    refs=[
                        ToolRefOut(kind=r.kind, id=str(r.id), category_id=str(r.category_id), label=r.label)
                        for r in execution.refs
                    ],
                )
            )
            tool_results.append(ToolResult(id=call.id, name=call.name, content=execution.summary))

        result = await provider.continue_with_tool_results(tool_results)

    final_text = result.text or "Done."
    return ChatMessageIn(role="assistant", content=final_text), tool_events
