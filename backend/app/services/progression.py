import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_THEME_ROLLUP_SQL = text(
    """
    WITH subtree AS (
        SELECT id FROM hierarchy_nodes WHERE path <@ (:root_path)::ltree
    ),
    targets AS (
        SELECT rs.current_level, rs.due_at
        FROM review_states rs
        WHERE rs.user_id = :user_id
          AND (
            rs.lesson_node_id IN (SELECT id FROM subtree)
            OR rs.card_id IN (SELECT id FROM cards WHERE lesson_node_id IN (SELECT id FROM subtree))
          )
    )
    SELECT
        COUNT(*) AS total_items,
        COALESCE(AVG(current_level), 0) AS avg_level,
        COUNT(*) FILTER (WHERE due_at <= now()) AS due_count
    FROM targets
    """
)

_CATEGORY_TOTALS_SQL = text(
    """
    SELECT
        COUNT(*) AS total_items,
        COUNT(*) FILTER (WHERE rs.due_at <= now()) AS total_due
    FROM review_states rs
    LEFT JOIN cards c ON c.id = rs.card_id
    LEFT JOIN hierarchy_nodes hn ON hn.id = rs.lesson_node_id
    WHERE rs.user_id = :user_id
      AND (c.category_id = :category_id OR hn.category_id = :category_id)
    """
)

_LEVEL_DISTRIBUTION_SQL = text(
    """
    SELECT rs.current_level AS level, COUNT(*) AS count
    FROM review_states rs
    LEFT JOIN cards c ON c.id = rs.card_id
    LEFT JOIN hierarchy_nodes hn ON hn.id = rs.lesson_node_id
    WHERE rs.user_id = :user_id
      AND (c.category_id = :category_id OR hn.category_id = :category_id)
    GROUP BY rs.current_level
    """
)


async def theme_rollup(
    db: AsyncSession, *, user_id: uuid.UUID, root_node_id: uuid.UUID, root_path: str
) -> dict:
    row = (
        await db.execute(_THEME_ROLLUP_SQL, {"root_path": root_path, "user_id": user_id})
    ).one()
    return {
        "node_id": root_node_id,
        "total_items": row.total_items,
        "avg_level": round(float(row.avg_level), 2),
        "due_count": row.due_count,
    }


async def category_totals(db: AsyncSession, *, user_id: uuid.UUID, category_id: uuid.UUID) -> dict:
    row = (
        await db.execute(_CATEGORY_TOTALS_SQL, {"user_id": user_id, "category_id": category_id})
    ).one()
    return {"total_items": row.total_items, "total_due": row.total_due}


MAX_LEVEL = 10


async def level_distribution(db: AsyncSession, *, user_id: uuid.UUID, category_id: uuid.UUID) -> list[dict]:
    """Count of tracked items at each SRS level (1-10), zero-filled so the
    frontend can render a full mastery breakdown without gap-filling itself."""
    rows = await db.execute(_LEVEL_DISTRIBUTION_SQL, {"user_id": user_id, "category_id": category_id})
    counts = {row.level: row.count for row in rows.all()}
    return [{"level": level, "count": counts.get(level, 0)} for level in range(1, MAX_LEVEL + 1)]


async def compute_streak(db: AsyncSession, *, user_id: uuid.UUID) -> int:
    """Consecutive days (ending today or yesterday) with at least one review_logs
    entry. Streak stays "alive" until a full day is skipped, matching common
    habit-tracker semantics rather than requiring today's review to count."""
    result = await db.execute(
        text(
            "SELECT DISTINCT date_trunc('day', reviewed_at)::date AS d "
            "FROM review_logs WHERE user_id = :user_id ORDER BY d DESC"
        ),
        {"user_id": user_id},
    )
    days = [row.d for row in result.all()]
    if not days:
        return 0

    today = datetime.now(timezone.utc).date()
    if days[0] < today - timedelta(days=1):
        return 0

    streak = 0
    expected = days[0]
    for day in days:
        if day == expected:
            streak += 1
            expected = expected - timedelta(days=1)
        else:
            break
    return streak
