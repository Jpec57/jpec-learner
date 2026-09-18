from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.services import srs_constants as const

RATING_TO_QUALITY = {1: 0, 2: 2, 3: 3, 4: 4, 5: 5}


@dataclass
class ReviewResult:
    repetitions: int
    ease_factor: float
    interval_days: int
    due_at: datetime
    current_level: int


def _round_up_to_hour(dt: datetime) -> datetime:
    """Reviews are only ever due exactly on the hour, so a whole batch of cards
    unlocks together instead of trickling in one-by-one across a review
    session."""
    floor = dt.replace(minute=0, second=0, microsecond=0)
    return floor if floor == dt else floor + timedelta(hours=1)


def compute_level(interval_days: int) -> int:
    level = 1
    for i, threshold in enumerate(const.LEVEL_INTERVAL_THRESHOLDS, start=1):
        if interval_days >= threshold:
            level = i
    return level


def apply_review(
    *,
    rating: int,
    repetitions: int,
    ease_factor: float,
    interval_days: int,
    now: datetime | None = None,
) -> ReviewResult:
    """Pure function implementing the SM-2 variant described in the project plan.
    Takes the review_state's current fields plus a 1-5 self-rating, returns the
    next state. Callers (the /reviews/{id}/submit route) persist the result and
    log the transition to review_logs."""
    if rating not in RATING_TO_QUALITY:
        raise ValueError(f"rating must be 1-5, got {rating}")
    now = now or datetime.now(timezone.utc)
    quality = RATING_TO_QUALITY[rating]
    level_before = compute_level(interval_days)

    if quality >= 3:
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = round(interval_days * ease_factor)
        new_repetitions = repetitions + 1
        new_ease = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    elif quality == 2:
        # Hard: soft fail, doesn't reset repetitions (concept isn't fully forgotten).
        new_interval = max(1, round(interval_days * const.HARD_INTERVAL_MULTIPLIER))
        new_repetitions = repetitions
        new_ease = ease_factor - const.HARD_EASE_PENALTY
    else:
        # Again (quality == 0): hard fail.
        new_interval = 1
        new_repetitions = 0
        new_ease = ease_factor - const.AGAIN_EASE_PENALTY

    new_ease = max(const.MIN_EASE_FACTOR, new_ease)
    new_interval = min(new_interval, const.MAX_INTERVAL_DAYS)

    if quality >= 3:
        new_level = compute_level(new_interval)
    else:
        # Hard/Again are failing ratings -- never real progress, even though
        # the reset/softened interval can land past the next threshold (e.g.
        # Again's 1-day reset also happens to be level 2's own floor). Capping
        # at level_before still lets a forgotten, previously-mastered item
        # drop levels; it just can never count as leveling *up*.
        new_level = min(compute_level(new_interval), level_before)

    return ReviewResult(
        repetitions=new_repetitions,
        ease_factor=round(new_ease, 2),
        interval_days=new_interval,
        due_at=_round_up_to_hour(now + timedelta(days=new_interval)),
        current_level=new_level,
    )
