from fastapi import APIRouter, Depends, status
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.chess import ChessLineProgress
from app.models.user import User
from app.schemas.chess import LineProgressImport, LineProgressOut, LineResultIn

router = APIRouter(prefix="/chess", tags=["chess"])


async def _list(db: AsyncSession, user: User) -> list[ChessLineProgress]:
    rows = await db.scalars(
        select(ChessLineProgress)
        .where(ChessLineProgress.user_id == user.id)
        .order_by(ChessLineProgress.course_id, ChessLineProgress.line_id)
    )
    return list(rows)


async def _add(db: AsyncSession, user: User, course_id: str, line_id: str, completed: int, flawless: int):
    """Adds to a line's counters, creating the row on first completion."""
    stmt = insert(ChessLineProgress).values(
        user_id=user.id, course_id=course_id, line_id=line_id, completed=completed, flawless=flawless
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_chess_line_progress_user_line",
        set_={
            "completed": ChessLineProgress.completed + stmt.excluded.completed,
            "flawless": ChessLineProgress.flawless + stmt.excluded.flawless,
            "last_completed_at": func.now(),
        },
    )
    await db.execute(stmt)


@router.get("/progress", response_model=list[LineProgressOut])
async def list_progress(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _list(db, current_user)


@router.post("/progress", response_model=list[LineProgressOut])
async def record_line_result(
    payload: LineResultIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Records one finished run of a line. Returns the user's full progress."""
    await _add(db, current_user, payload.course_id, payload.line_id, 1, 1 if payload.flawless else 0)
    await db.commit()
    return await _list(db, current_user)


@router.post("/progress/import", response_model=list[LineProgressOut])
async def import_progress(
    payload: LineProgressImport,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Merges progress that was kept in the browser into the account."""
    for line in payload.lines:
        if line.completed > 0:
            await _add(db, current_user, line.course_id, line.line_id, line.completed, min(line.flawless, line.completed))
    await db.commit()
    return await _list(db, current_user)


@router.delete("/progress", status_code=status.HTTP_204_NO_CONTENT)
async def reset_progress(
    course_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resets one course's progress, or everything when no course is given."""
    stmt = delete(ChessLineProgress).where(ChessLineProgress.user_id == current_user.id)
    if course_id is not None:
        stmt = stmt.where(ChessLineProgress.course_id == course_id)
    await db.execute(stmt)
    await db.commit()
