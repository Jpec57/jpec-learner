from datetime import datetime, timedelta, timezone

import pytest

from app.services.srs import apply_review, compute_level
from app.services import srs_constants as const


NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def test_first_review_good_sets_interval_to_one_day():
    result = apply_review(rating=3, repetitions=0, ease_factor=2.5, interval_days=0, now=NOW)
    assert result.repetitions == 1
    assert result.interval_days == 1
    assert result.due_at == NOW + timedelta(days=1)


def test_due_at_rounds_up_to_the_next_hour():
    misaligned = datetime(2026, 1, 1, 14, 23, 7, tzinfo=timezone.utc)
    result = apply_review(rating=3, repetitions=0, ease_factor=2.5, interval_days=1, now=misaligned)
    assert result.due_at == datetime(2026, 1, 2, 15, 0, 0, tzinfo=timezone.utc)


def test_due_at_left_alone_when_already_on_the_hour():
    result = apply_review(rating=3, repetitions=0, ease_factor=2.5, interval_days=0, now=NOW)
    assert result.due_at == NOW + timedelta(days=1)


def test_second_review_good_sets_interval_to_six_days():
    result = apply_review(rating=3, repetitions=1, ease_factor=2.5, interval_days=1, now=NOW)
    assert result.repetitions == 2
    assert result.interval_days == 6


def test_third_review_good_multiplies_by_ease_factor():
    result = apply_review(rating=3, repetitions=2, ease_factor=2.5, interval_days=6, now=NOW)
    assert result.repetitions == 3
    assert result.interval_days == round(6 * 2.5)


def test_perfect_rating_grows_ease_factor():
    result = apply_review(rating=5, repetitions=2, ease_factor=2.5, interval_days=6, now=NOW)
    assert result.ease_factor > 2.5


def test_easy_rating_grows_ease_less_than_perfect():
    perfect = apply_review(rating=5, repetitions=2, ease_factor=2.5, interval_days=6, now=NOW)
    easy = apply_review(rating=4, repetitions=2, ease_factor=2.5, interval_days=6, now=NOW)
    assert easy.ease_factor < perfect.ease_factor


def test_hard_rating_does_not_reset_repetitions():
    result = apply_review(rating=2, repetitions=4, ease_factor=2.5, interval_days=30, now=NOW)
    assert result.repetitions == 4
    assert result.interval_days == round(30 * const.HARD_INTERVAL_MULTIPLIER)
    assert result.ease_factor == pytest.approx(2.5 - const.HARD_EASE_PENALTY, abs=0.001)


def test_again_rating_resets_repetitions_and_interval():
    result = apply_review(rating=1, repetitions=6, ease_factor=2.8, interval_days=90, now=NOW)
    assert result.repetitions == 0
    assert result.interval_days == 1
    assert result.ease_factor == pytest.approx(2.8 - const.AGAIN_EASE_PENALTY, abs=0.001)


def test_ease_factor_floored_at_minimum():
    result = apply_review(rating=1, repetitions=0, ease_factor=const.MIN_EASE_FACTOR, interval_days=1, now=NOW)
    assert result.ease_factor == const.MIN_EASE_FACTOR


def test_interval_capped_at_maximum():
    result = apply_review(rating=5, repetitions=10, ease_factor=3.0, interval_days=300, now=NOW)
    assert result.interval_days == const.MAX_INTERVAL_DAYS


def test_invalid_rating_raises():
    with pytest.raises(ValueError):
        apply_review(rating=0, repetitions=0, ease_factor=2.5, interval_days=0, now=NOW)
    with pytest.raises(ValueError):
        apply_review(rating=6, repetitions=0, ease_factor=2.5, interval_days=0, now=NOW)


@pytest.mark.parametrize(
    "interval_days,expected_level",
    [(0, 1), (1, 2), (2, 2), (3, 3), (6, 3), (7, 4), (13, 4), (14, 5), (29, 5), (30, 6), (364, 9), (365, 10), (1000, 10)],
)
def test_compute_level_thresholds(interval_days, expected_level):
    assert compute_level(interval_days) == expected_level
