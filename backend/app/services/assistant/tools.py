import uuid
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.routes import cards as cards_routes
from app.api.v1.routes import categories as categories_routes
from app.api.v1.routes import hierarchy as hierarchy_routes
from app.models.category import Category
from app.models.user import User
from app.schemas.card import CardCreate
from app.schemas.category import CategoryCreate
from app.schemas.hierarchy import HierarchyNodeCreate
from app.services.assistant.providers import ToolSpec

# Cap on how many cards a single create_cards_bulk call can generate, so one
# runaway model response can't try to write thousands of rows in one request.
MAX_BULK_CARDS = 50


@dataclass
class ToolExecutionResult:
    ok: bool
    summary: str


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
        "back_text": {"type": "string"},
        "answer_mode": {"type": "string", "enum": ["reveal", "typed"]},
        "accepted_answers": {"type": "array", "items": {"type": "string"}},
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
]


async def _tool_list_categories(db: AsyncSession, current_user: User, args: dict[str, Any]) -> ToolExecutionResult:
    from sqlalchemy import select

    query = select(Category).where(Category.owner_id == current_user.id, Category.deleted_at.is_(None))
    rows = (await db.scalars(query)).all()
    if not rows:
        return ToolExecutionResult(ok=True, summary="No categories exist yet.")
    lines = [f"- {c.name} (id={c.id}, slug={c.slug})" for c in rows]
    return ToolExecutionResult(ok=True, summary="\n".join(lines))


async def _tool_list_hierarchy(db: AsyncSession, current_user: User, args: dict[str, Any]) -> ToolExecutionResult:
    category_id = _uuid(args["category_id"], "category_id")
    parent_id = _uuid(args["parent_id"], "parent_id") if args.get("parent_id") else None
    nodes = await hierarchy_routes.list_children(
        category_id=category_id, parent_id=parent_id, current_user=current_user, db=db
    )
    if not nodes:
        return ToolExecutionResult(ok=True, summary="This level is empty.")
    lines = [f"- [{n.node_kind}] {n.title} (id={n.id})" for n in nodes]
    return ToolExecutionResult(ok=True, summary="\n".join(lines))


async def _tool_create_category(db: AsyncSession, current_user: User, args: dict[str, Any]) -> ToolExecutionResult:
    payload = CategoryCreate(
        name=args["name"],
        icon=args.get("icon"),
        theme_color=args.get("theme_color"),
        is_public=bool(args.get("is_public", False)),
    )
    category = await categories_routes.create_category(payload=payload, current_user=current_user, db=db)
    return ToolExecutionResult(
        ok=True, summary=f"Created category '{category.name}' (id={category.id}, slug={category.slug})."
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
    return ToolExecutionResult(ok=True, summary=f"Created {node_kind} '{node.title}' (id={node.id}).")


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
    return ToolExecutionResult(ok=True, summary=f"Created card '{card.front_text}' -> '{card.back_text}' (id={card.id}).")


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
    return ToolExecutionResult(ok=True, summary=f"Created {len(created)} card(s):\n{preview}{more}")


_HANDLERS: dict[str, Callable[[AsyncSession, User, dict[str, Any]], Awaitable[ToolExecutionResult]]] = {
    "list_categories": _tool_list_categories,
    "list_hierarchy": _tool_list_hierarchy,
    "create_category": _tool_create_category,
    "create_group": lambda db, user, args: _tool_create_node(db, user, args, node_kind="group"),
    "create_lesson": lambda db, user, args: _tool_create_node(db, user, args, node_kind="lesson"),
    "create_card": _tool_create_card,
    "create_cards_bulk": _tool_create_cards_bulk,
}


async def execute_tool(db: AsyncSession, current_user: User, name: str, arguments: dict[str, Any]) -> ToolExecutionResult:
    handler = _HANDLERS.get(name)
    if handler is None:
        return ToolExecutionResult(ok=False, summary=f"Unknown tool: {name}")
    try:
        return await handler(db, current_user, arguments)
    except (ToolArgumentError, ValidationError) as exc:
        await db.rollback()
        return ToolExecutionResult(ok=False, summary=f"Invalid arguments: {exc}")
    except KeyError as exc:
        await db.rollback()
        return ToolExecutionResult(ok=False, summary=f"Missing required argument: {exc}")
    except HTTPException as exc:
        await db.rollback()
        return ToolExecutionResult(ok=False, summary=f"Could not complete: {exc.detail}")
