"""Deck study plan: parse the user's markdown into sub-goals and measure how
each one is going from existing review data.

The plan is plain markdown (`## Chapter`, `### Topic`, `- [ ]` milestones).
Nothing about it is stored beyond the text itself: sub-goals are re-parsed on
every read and linked to hierarchy groups/lessons by normalized title, so
editing the markdown can never leave the database out of sync."""

import re
import unicodedata
import uuid
from dataclasses import dataclass, field

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import srs_constants as const
from app.services.progression import MAX_LEVEL, category_totals

MAX_SECTION_LEVEL = 3

_HEADING_RE = re.compile(r"^(#{2,3})\s+(.+?)\s*#*\s*$")
_CHECKLIST_RE = re.compile(r"^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$")
_FENCE_RE = re.compile(r"^\s*(```|~~~)")


@dataclass
class ChecklistItem:
    text: str
    done: bool


@dataclass
class Section:
    level: int
    title: str
    checklist: list[ChecklistItem] = field(default_factory=list)


def parse_plan(markdown: str | None) -> list[Section]:
    """`##` and `###` headings become sections (in document order); `- [ ]` /
    `- [x]` lines attach to the nearest heading above them. Everything else
    (the `#` title, deeper headings, prose, fenced code) is ignored."""
    sections: list[Section] = []
    in_fence = False
    for line in (markdown or "").splitlines():
        if _FENCE_RE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        heading = _HEADING_RE.match(line)
        if heading:
            sections.append(Section(level=len(heading.group(1)), title=heading.group(2).strip()))
            continue
        item = _CHECKLIST_RE.match(line)
        if item and sections:
            sections[-1].checklist.append(ChecklistItem(text=item.group(2), done=item.group(1) != " "))
    return sections


def normalize_title(title: str) -> str:
    """Case-, accent- and punctuation-insensitive form used to match plan
    headings to hierarchy titles ("Algèbre linéaire" == "algebre  lineaire")."""
    decomposed = unicodedata.normalize("NFKD", title)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return " ".join(re.sub(r"[^0-9a-z]+", " ", stripped.casefold()).split())


@dataclass
class _Node:
    id: uuid.UUID
    parent_id: uuid.UUID | None
    path: str
    title: str


def _match_nodes(sections: list[Section], nodes: list[_Node]) -> list[_Node | None]:
    """Link each section to a hierarchy node by normalized title. A `###` prefers
    a node inside its `##` parent's subtree (so two chapters may each have a
    topic called "Exercices"); a `##` prefers the shallowest match."""
    by_title: dict[str, list[_Node]] = {}
    for node in nodes:
        by_title.setdefault(normalize_title(node.title), []).append(node)

    def depth(node: _Node) -> int:
        return node.path.count(".")

    matches: list[_Node | None] = []
    current_parent: _Node | None = None
    for section in sections:
        candidates = by_title.get(normalize_title(section.title), [])
        if section.level == 2:
            match = min(candidates, key=depth) if candidates else None
            current_parent = match
        else:
            inside = (
                [n for n in candidates if n.path.startswith(current_parent.path + ".")]
                if current_parent is not None
                else []
            )
            pool = inside or candidates
            match = min(pool, key=depth) if pool else None
        matches.append(match)
    return matches


# "Reviewed" means last_reviewed_at is set, NOT repetitions > 0: an Again/Hard
# rating resets repetitions to 0, so a card failed every time would otherwise
# look untouched -- exactly the card this feature exists to surface.
# Same subtree/target shape as progression._THEME_ROLLUP_SQL, extended with the
# review counts and recent lapse numbers a plan section needs in one round trip.
_SECTION_STATS_SQL = text(
    """
    WITH subtree AS (
        SELECT id FROM hierarchy_nodes WHERE path <@ (:root_path)::ltree
    ),
    states AS (
        SELECT rs.id, rs.current_level, rs.due_at, rs.last_reviewed_at
        FROM review_states rs
        WHERE rs.user_id = :user_id
          AND (
            rs.lesson_node_id IN (SELECT id FROM subtree)
            OR rs.card_id IN (
                SELECT id FROM cards WHERE lesson_node_id IN (SELECT id FROM subtree) AND deleted_at IS NULL
            )
          )
    ),
    recent AS (
        SELECT COUNT(*) AS logs, COUNT(*) FILTER (WHERE rl.rating <= 2) AS lapses
        FROM review_logs rl
        WHERE rl.review_state_id IN (SELECT id FROM states)
          AND rl.reviewed_at >= now() - make_interval(days => :window_days)
    )
    SELECT
        (SELECT COUNT(*) FROM states) AS total_items,
        (SELECT COUNT(*) FROM states WHERE last_reviewed_at IS NOT NULL) AS reviewed_items,
        (SELECT COALESCE(AVG(current_level), 0) FROM states) AS avg_level,
        (SELECT COUNT(*) FROM states WHERE due_at <= now()) AS due_count,
        (SELECT MAX(last_reviewed_at) FROM states) AS last_reviewed_at,
        recent.logs AS recent_logs,
        recent.lapses AS recent_lapses
    FROM recent
    """
)

_WEAKEST_CARDS_SQL = text(
    """
    WITH lapses AS (
        SELECT review_state_id, COUNT(*) AS lapses
        FROM review_logs
        WHERE user_id = :user_id AND rating <= 2
        GROUP BY review_state_id
    )
    SELECT c.id AS card_id, c.front_text, c.lesson_node_id,
           rs.current_level, rs.ease_factor, COALESCE(l.lapses, 0) AS lapses
    FROM review_states rs
    JOIN cards c ON c.id = rs.card_id AND c.deleted_at IS NULL
    LEFT JOIN lapses l ON l.review_state_id = rs.id
    WHERE rs.user_id = :user_id
      AND c.category_id = :category_id
      AND rs.last_reviewed_at IS NOT NULL
      AND (
        NOT :scoped
        OR c.lesson_node_id IN (SELECT id FROM hierarchy_nodes WHERE path <@ (:root_path)::ltree)
      )
    ORDER BY COALESCE(l.lapses, 0) DESC, rs.ease_factor ASC
    LIMIT :limit
    """
)


def _lapse_rate(recent_logs: int, recent_lapses: int) -> float | None:
    if recent_logs < const.PLAN_MIN_LOGS_FOR_LAPSE_RATE:
        return None
    return recent_lapses / recent_logs


def classify_section(
    *, has_content: bool, reviewed_items: int, avg_level: float, lapse_rate: float | None
) -> str:
    if not has_content:
        return "no_content"
    if reviewed_items == 0:
        return "not_started"
    if lapse_rate is not None and lapse_rate >= const.PLAN_WEAK_LAPSE_RATE:
        return "weak"
    if avg_level >= const.PLAN_SOLID_AVG_LEVEL and (lapse_rate or 0.0) < const.PLAN_SOLID_MAX_LAPSE_RATE:
        return "solid"
    return "in_progress"


def weakness_score(
    *, status: str, total_items: int, due_count: int, avg_level: float, lapse_rate: float | None
) -> float:
    """0 (fine) .. 1 (needs work now), used only to rank sections for the coach
    and the dashboard. Bands, most urgent first: weak (0.7-1.0, the learner is
    failing it), no content (0.6, nothing to practice yet), not started (0.5),
    then everything else (0-0.49) by how shaky it is."""
    if status == "no_content":
        return 0.6
    if status == "not_started":
        return 0.5
    level_deficit = 1 - (avg_level - 1) / (MAX_LEVEL - 1)
    overdue = due_count / total_items if total_items else 0.0
    raw = min(max(0.5 * (lapse_rate or 0.0) + 0.3 * level_deficit + 0.2 * overdue, 0.0), 1.0)
    if status == "weak":
        return round(0.7 + 0.3 * raw, 3)
    return round(0.49 * raw, 3)


async def load_nodes(db: AsyncSession, category_id: uuid.UUID) -> list[_Node]:
    rows = await db.execute(
        text("SELECT id, parent_id, path::text AS path, title FROM hierarchy_nodes WHERE category_id = :cid"),
        {"cid": category_id},
    )
    return [_Node(id=r.id, parent_id=r.parent_id, path=r.path, title=r.title) for r in rows.all()]


async def compute_plan_progress(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    category_id: uuid.UUID,
    goal: str | None,
    plan_markdown: str | None,
    weakest_limit: int = 5,
) -> dict:
    sections = parse_plan(plan_markdown)
    nodes = await load_nodes(db, category_id)
    matches = _match_nodes(sections, nodes)

    out_sections: list[dict] = []
    for section, node in zip(sections, matches):
        stats = None
        if node is not None:
            stats = (
                await db.execute(
                    _SECTION_STATS_SQL,
                    {
                        "root_path": node.path,
                        "user_id": user_id,
                        "window_days": const.PLAN_LAPSE_WINDOW_DAYS,
                    },
                )
            ).one()

        total = stats.total_items if stats else 0
        reviewed = stats.reviewed_items if stats else 0
        avg_level = round(float(stats.avg_level), 2) if stats else 0.0
        due = stats.due_count if stats else 0
        lapse = _lapse_rate(stats.recent_logs, stats.recent_lapses) if stats else None

        status = classify_section(
            has_content=total > 0, reviewed_items=reviewed, avg_level=avg_level, lapse_rate=lapse
        )
        out_sections.append(
            {
                "level": section.level,
                "title": section.title,
                "node_id": node.id if node else None,
                "status": status,
                "total_items": total,
                "reviewed_items": reviewed,
                "avg_level": avg_level,
                "due_count": due,
                "lapse_rate": round(lapse, 3) if lapse is not None else None,
                "weakness_score": weakness_score(
                    status=status, total_items=total, due_count=due, avg_level=avg_level, lapse_rate=lapse
                ),
                "last_reviewed_at": stats.last_reviewed_at if stats else None,
                "checklist": [{"text": i.text, "done": i.done} for i in section.checklist],
            }
        )

    totals = await category_totals(db, user_id=user_id, category_id=category_id)
    return {
        "goal": goal,
        "sections": out_sections,
        "weakest_cards": await weakest_cards(db, user_id=user_id, category_id=category_id, limit=weakest_limit),
        "total_due": totals["total_due"],
    }


async def weakest_cards(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    category_id: uuid.UUID,
    root_path: str | None = None,
    limit: int = 5,
) -> list[dict]:
    """Reviewed cards ranked by lifetime Again/Hard count, then lowest ease factor,
    optionally restricted to the subtree at `root_path`."""
    rows = await db.execute(
        _WEAKEST_CARDS_SQL,
        {
            "user_id": user_id,
            "category_id": category_id,
            "scoped": root_path is not None,
            "root_path": root_path or "",
            "limit": limit,
        },
    )
    return [
        {
            "card_id": r.card_id,
            "front_text": r.front_text,
            "lesson_node_id": r.lesson_node_id,
            "current_level": r.current_level,
            "ease_factor": float(r.ease_factor),
            "lapses": r.lapses,
        }
        for r in rows.all()
    ]


def render_progress_summary(progress: dict) -> str:
    """Compact plain-text rendering shared by the coach's tool result and its
    pre-injected system-prompt snapshot."""
    lines = [f"Goal: {progress['goal'] or '(not set)'}", f"Items due now: {progress['total_due']}"]
    if not progress["sections"]:
        lines.append("Plan: (empty -- no ## sections yet)")
    for s in progress["sections"]:
        indent = "  " * (s["level"] - 2)
        lapse = f"{round(s['lapse_rate'] * 100)}%" if s["lapse_rate"] is not None else "n/a"
        ticked = sum(1 for i in s["checklist"] if i["done"])
        milestones = f", milestones {ticked}/{len(s['checklist'])}" if s["checklist"] else ""
        lines.append(
            f"{indent}- {s['title']} [{s['status']}] items={s['total_items']} reviewed={s['reviewed_items']} "
            f"avg_level={s['avg_level']} due={s['due_count']} lapse_rate_30d={lapse}"
            f"{milestones} (group_id={s['node_id'] or 'none'})"
        )
    if progress["weakest_cards"]:
        lines.append("Weakest cards:")
        for c in progress["weakest_cards"]:
            front = c["front_text"].replace("\n", " ")[:80]
            lines.append(f"- {front} (lapses={c['lapses']}, level={c['current_level']})")
    return "\n".join(lines)


__all__ = [
    "ChecklistItem",
    "Section",
    "classify_section",
    "compute_plan_progress",
    "normalize_title",
    "parse_plan",
    "render_progress_summary",
    "weakest_cards",
    "weakness_score",
]
