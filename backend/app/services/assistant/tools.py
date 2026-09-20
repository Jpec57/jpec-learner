import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.routes import cards as cards_routes
from app.api.v1.routes import categories as categories_routes
from app.api.v1.routes import hierarchy as hierarchy_routes
from app.api.v1.routes import plan as plan_routes
from app.models.category import Category
from app.models.user import User
from app.schemas.card import CardCreate
from app.schemas.category import CategoryCreate
from app.schemas.hierarchy import HierarchyNodeCreate
from app.schemas.plan import PlanUpdate
from app.services.assistant.providers import ToolSpec
from app.services.plan import render_progress_summary

# Cap on how many cards a single create_cards_bulk call can generate, so one
# runaway model response can't try to write thousands of rows in one request.
MAX_BULK_CARDS = 50


@dataclass
class ToolRef:
    kind: str  # "category" | "group" | "lesson" | "card" -- see schemas.assistant.RefKind
    id: uuid.UUID
    category_id: uuid.UUID
    label: str


@dataclass
class ToolExecutionResult:
    ok: bool
    # Text handed back to the model (keeps ids it needs for follow-up calls).
    summary: str
    # Structured references the UI turns into links; never sent to the model.
    refs: list[ToolRef] = field(default_factory=list)


def _uuid(value: Any, field_name: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        raise ToolArgumentError(f"'{field_name}' must be a valid UUID, got: {value!r}") from None


class ToolArgumentError(ValueError):
    pass


_CARD_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "front_text": {"type": "string"},
        "back_text": {
            "type": "string",
            "description": (
                "Answer shown on reveal (markdown). For answer_mode 'typed' with accepted_answers "
                "set, it is display-only context and need not be typed."
            ),
        },
        "answer_mode": {"type": "string", "enum": ["reveal", "typed"]},
        "accepted_answers": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "For 'typed' cards: every answer the learner may type (e.g. synonyms). "
                "If empty, back_text itself must be typed."
            ),
        },
        "answer_language": {"type": "string", "description": "e.g. 'en', 'ja-romaji', 'ja-kanji'"},
        "hint": {"type": "string"},
    },
    "required": ["front_text", "back_text"],
}

TOOL_SPECS: list[ToolSpec] = [
    ToolSpec(
        name="list_categories",
        description="List the current user's categories (decks), with their IDs, names and slugs.",
        parameters={"type": "object", "properties": {}, "additionalProperties": False},
    ),
    ToolSpec(
        name="list_hierarchy",
        description=(
            "List the groups/lessons directly under a parent node in a category (or the top level if "
            "parent_id is omitted). Use this to find an existing lesson/group's ID before adding cards to it, "
            "or to check what already exists before creating something new."
        ),
        parameters={
            "type": "object",
            "properties": {
                "category_id": {"type": "string", "description": "Category UUID"},
                "parent_id": {"type": "string", "description": "Parent group UUID; omit for the top level"},
            },
            "required": ["category_id"],
        },
    ),
    ToolSpec(
        name="create_category",
        description="Create a new category (deck) that groups/lessons/cards can be created inside.",
        parameters={
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "icon": {"type": "string", "description": "Optional short icon/emoji label"},
                "theme_color": {"type": "string", "description": "Optional hex color, e.g. #8b5cf6"},
                "is_public": {"type": "boolean"},
            },
            "required": ["name"],
        },
    ),
    ToolSpec(
        name="create_group",
        description="Create a group (folder) node inside a category, optionally nested under another group.",
        parameters={
            "type": "object",
            "properties": {
                "category_id": {"type": "string"},
                "parent_id": {"type": "string", "description": "Optional parent group UUID"},
                "title": {"type": "string"},
                "description": {"type": "string"},
            },
            "required": ["category_id", "title"],
        },
    ),
    ToolSpec(
        name="create_lesson",
        description="Create a lesson node inside a category, optionally nested under a group, with markdown content.",
        parameters={
            "type": "object",
            "properties": {
                "category_id": {"type": "string"},
                "parent_id": {"type": "string", "description": "Optional parent group UUID"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "body_markdown": {"type": "string", "description": "The lesson's content, in markdown"},
            },
            "required": ["category_id", "title"],
        },
    ),
    ToolSpec(
        name="create_card",
        description="Create a single flashcard in a category, optionally attached to a specific lesson.",
        parameters={
            "type": "object",
            "properties": {
                "category_id": {"type": "string"},
                "lesson_node_id": {
                    "type": "string",
                    "description": "Optional lesson UUID; omitted cards go to the category's Unclassified bucket",
                },
                **_CARD_ITEM_SCHEMA["properties"],
                "create_reverse": {
                    "type": "boolean",
                    "description": "Also create a second card with front/back swapped",
                },
            },
            "required": ["category_id", "front_text", "back_text"],
        },
    ),
    ToolSpec(
        name="create_cards_bulk",
        description=(
            f"Create several flashcards at once in a category/lesson (max {MAX_BULK_CARDS} per call). "
            "Prefer this over repeated create_card calls when generating a batch."
        ),
        parameters={
            "type": "object",
            "properties": {
                "category_id": {"type": "string"},
                "lesson_node_id": {"type": "string", "description": "Optional lesson UUID for all the cards"},
                "cards": {"type": "array", "items": _CARD_ITEM_SCHEMA, "maxItems": MAX_BULK_CARDS},
            },
            "required": ["category_id", "cards"],
        },
    ),
    ToolSpec(
        name="get_plan",
        description=(
            "Read a category's main goal and its markdown study plan. In the plan, each '## ' heading is a "
            "sub-goal (chapter), '### ' a topic inside it, and '- [ ]' / '- [x]' lines are milestones. "
            "Sub-goals are linked to the category's groups/lessons by identical title."
        ),
        parameters={
            "type": "object",
            "properties": {"category_id": {"type": "string"}},
            "required": ["category_id"],
        },
    ),
    ToolSpec(
        name="update_plan",
        description=(
            "Overwrite the category's goal and/or markdown plan. The plan is replaced WHOLESALE, so call "
            "get_plan first and send back the full edited text, keeping the user's own wording and headings "
            "(renaming a heading breaks its link to the matching group). Only fields you pass are changed."
        ),
        parameters={
            "type": "object",
            "properties": {
                "category_id": {"type": "string"},
                "goal": {"type": "string", "description": "The deck's main goal"},
                "plan_markdown": {"type": "string", "description": "The complete new plan, in markdown"},
            },
            "required": ["category_id"],
        },
    ),
    ToolSpec(
        name="get_plan_progress",
        description=(
            "How the learner is doing on each plan sub-goal, from their real review history: status "
            "(no_content = no matching group/cards yet, not_started, weak, in_progress, solid), item counts, "
            "average SRS level (1-10), due count, 30-day lapse rate, milestones ticked, plus the weakest "
            "individual cards. Use it to decide what to teach or drill next."
        ),
        parameters={
            "type": "object",
            "properties": {"category_id": {"type": "string"}},
            "required": ["category_id"],
        },
    ),
]


async def _tool_list_categories(db: AsyncSession, current_user: User, args: dict[str, Any]) -> ToolExecutionResult:
    from sqlalchemy import select

    query = select(Category).where(Category.owner_id == current_user.id, Category.deleted_at.is_(None))
    rows = (await db.scalars(query)).all()
    if not rows:
        return ToolExecutionResult(ok=True, summary="No categories exist yet.")
    lines = [f"- {c.name} (id={c.id}, slug={c.slug})" for c in rows]
    refs = [ToolRef("category", c.id, c.id, c.name) for c in rows]
    return ToolExecutionResult(ok=True, summary="\n".join(lines), refs=refs)


async def _tool_list_hierarchy(db: AsyncSession, current_user: User, args: dict[str, Any]) -> ToolExecutionResult:
    category_id = _uuid(args["category_id"], "category_id")
    parent_id = _uuid(args["parent_id"], "parent_id") if args.get("parent_id") else None
    nodes = await hierarchy_routes.list_children(
        category_id=category_id, parent_id=parent_id, current_user=current_user, db=db
    )
    if not nodes:
        return ToolExecutionResult(ok=True, summary="This level is empty.")
    lines = [f"- [{n.node_kind}] {n.title} (id={n.id})" for n in nodes]
    refs = [ToolRef(n.node_kind, n.id, n.category_id, n.title) for n in nodes]
    return ToolExecutionResult(ok=True, summary="\n".join(lines), refs=refs)


async def _tool_create_category(db: AsyncSession, current_user: User, args: dict[str, Any]) -> ToolExecutionResult:
    payload = CategoryCreate(
        name=args["name"],
        icon=args.get("icon"),
        theme_color=args.get("theme_color"),
        is_public=bool(args.get("is_public", False)),
    )
    category = await categories_routes.create_category(payload=payload, current_user=current_user, db=db)
    return ToolExecutionResult(
        ok=True,
        summary=f"Created category '{category.name}' (id={category.id}, slug={category.slug}).",
        refs=[ToolRef("category", category.id, category.id, category.name)],
    )


async def _tool_create_node(
    db: AsyncSession, current_user: User, args: dict[str, Any], *, node_kind: str
) -> ToolExecutionResult:
    payload = HierarchyNodeCreate(
        category_id=_uuid(args["category_id"], "category_id"),
        parent_id=_uuid(args["parent_id"], "parent_id") if args.get("parent_id") else None,
        node_kind=node_kind,
        title=args["title"],
        description=args.get("description"),
        body_markdown=args.get("body_markdown") if node_kind == "lesson" else None,
    )
    node = await hierarchy_routes.create_node(payload=payload, current_user=current_user, db=db)
    return ToolExecutionResult(
        ok=True,
        summary=f"Created {node_kind} '{node.title}' (id={node.id}).",
        refs=[ToolRef(node_kind, node.id, node.category_id, node.title)],
    )


def _card_payload(category_id: uuid.UUID, lesson_node_id: uuid.UUID | None, item: dict[str, Any]) -> CardCreate:
    return CardCreate(
        category_id=category_id,
        lesson_node_id=lesson_node_id,
        front_text=item["front_text"],
        back_text=item["back_text"],
        answer_mode=item.get("answer_mode", "reveal"),
        accepted_answers=item.get("accepted_answers", []),
        answer_language=item.get("answer_language"),
        hint=item.get("hint"),
        create_reverse=bool(item.get("create_reverse", False)),
    )


async def _tool_create_card(db: AsyncSession, current_user: User, args: dict[str, Any]) -> ToolExecutionResult:
    category_id = _uuid(args["category_id"], "category_id")
    lesson_node_id = _uuid(args["lesson_node_id"], "lesson_node_id") if args.get("lesson_node_id") else None
    payload = _card_payload(category_id, lesson_node_id, args)
    card = await cards_routes.create_card(payload=payload, current_user=current_user, db=db)
    return ToolExecutionResult(
        ok=True,
        summary=f"Created card '{card.front_text}' -> '{card.back_text}' (id={card.id}).",
        refs=[ToolRef("card", card.id, card.category_id, card.front_text)],
    )


async def _tool_create_cards_bulk(db: AsyncSession, current_user: User, args: dict[str, Any]) -> ToolExecutionResult:
    category_id = _uuid(args["category_id"], "category_id")
    lesson_node_id = _uuid(args["lesson_node_id"], "lesson_node_id") if args.get("lesson_node_id") else None
    items = args.get("cards") or []
    if not items:
        raise ToolArgumentError("'cards' must be a non-empty list")
    if len(items) > MAX_BULK_CARDS:
        raise ToolArgumentError(f"Cannot create more than {MAX_BULK_CARDS} cards in one call")

    created = []
    for item in items:
        payload = _card_payload(category_id, lesson_node_id, item)
        card = await cards_routes.create_card(payload=payload, current_user=current_user, db=db)
        created.append(card)

    preview = "\n".join(f"- {c.front_text} -> {c.back_text}" for c in created[:10])
    more = f"\n(+{len(created) - 10} more)" if len(created) > 10 else ""
    refs = [ToolRef("card", c.id, c.category_id, c.front_text) for c in created]
    return ToolExecutionResult(ok=True, summary=f"Created {len(created)} card(s):\n{preview}{more}", refs=refs)


async def _tool_get_plan(db: AsyncSession, current_user: User, args: dict[str, Any]) -> ToolExecutionResult:
    plan = await plan_routes.get_plan(
        category_id=_uuid(args["category_id"], "category_id"), current_user=current_user, db=db
    )
    if not plan.goal and not plan.plan_markdown:
        return ToolExecutionResult(ok=True, summary="No goal or plan has been written for this category yet.")
    return ToolExecutionResult(
        ok=True,
        summary=f"Goal: {plan.goal or '(not set)'}\n\nPlan (markdown):\n{plan.plan_markdown or '(empty)'}",
    )


async def _tool_update_plan(db: AsyncSession, current_user: User, args: dict[str, Any]) -> ToolExecutionResult:
    fields = {key: args[key] for key in ("goal", "plan_markdown") if key in args}
    if not fields:
        raise ToolArgumentError("Provide 'goal' and/or 'plan_markdown'")
    # Built from only the keys the model sent, so the route's model_fields_set
    # check leaves the other field untouched.
    await plan_routes.update_plan(
        category_id=_uuid(args["category_id"], "category_id"),
        payload=PlanUpdate(**fields),
        current_user=current_user,
        db=db,
    )
    return ToolExecutionResult(ok=True, summary=f"Updated the {' and '.join(fields)}.")


async def _tool_get_plan_progress(db: AsyncSession, current_user: User, args: dict[str, Any]) -> ToolExecutionResult:
    progress = await plan_routes.get_plan_progress(
        category_id=_uuid(args["category_id"], "category_id"), current_user=current_user, db=db
    )
    category_id = _uuid(args["category_id"], "category_id")
    refs = [ToolRef("card", c["card_id"], category_id, c["front_text"]) for c in progress["weakest_cards"]]
    return ToolExecutionResult(ok=True, summary=render_progress_summary(progress), refs=refs)


_HANDLERS: dict[str, Callable[[AsyncSession, User, dict[str, Any]], Awaitable[ToolExecutionResult]]] = {
    "list_categories": _tool_list_categories,
    "list_hierarchy": _tool_list_hierarchy,
    "create_category": _tool_create_category,
    "create_group": lambda db, user, args: _tool_create_node(db, user, args, node_kind="group"),
    "create_lesson": lambda db, user, args: _tool_create_node(db, user, args, node_kind="lesson"),
    "create_card": _tool_create_card,
    "create_cards_bulk": _tool_create_cards_bulk,
    "get_plan": _tool_get_plan,
    "update_plan": _tool_update_plan,
    "get_plan_progress": _tool_get_plan_progress,
}


async def _rollback(db: AsyncSession, current_user: User) -> None:
    # Rolling back expires every loaded instance, including current_user, and an
    # async session can't lazy-reload it on the next attribute access. The model
    # recovers from a tool error by calling another tool, so reload it here.
    await db.rollback()
    await db.refresh(current_user)


async def execute_tool(db: AsyncSession, current_user: User, name: str, arguments: dict[str, Any]) -> ToolExecutionResult:
    handler = _HANDLERS.get(name)
    if handler is None:
        return ToolExecutionResult(ok=False, summary=f"Unknown tool: {name}")
    try:
        return await handler(db, current_user, arguments)
    except (ToolArgumentError, ValidationError) as exc:
        await _rollback(db, current_user)
        return ToolExecutionResult(ok=False, summary=f"Invalid arguments: {exc}")
    except KeyError as exc:
        await _rollback(db, current_user)
        return ToolExecutionResult(ok=False, summary=f"Missing required argument: {exc}")
    except HTTPException as exc:
        await _rollback(db, current_user)
        return ToolExecutionResult(ok=False, summary=f"Could not complete: {exc.detail}")
