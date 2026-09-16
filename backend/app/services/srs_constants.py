"""Tunable SM-2-variant constants — see the project plan's SRS section for the
rationale behind the Hard/Again asymmetry. These are product-feel defaults, not
fixed; adjust freely against real usage without touching srs.py's logic."""

MIN_EASE_FACTOR = 1.3
DEFAULT_EASE_FACTOR = 2.5

HARD_INTERVAL_MULTIPLIER = 1.2
HARD_EASE_PENALTY = 0.15

AGAIN_EASE_PENALTY = 0.2

MAX_INTERVAL_DAYS = 365

# Interval (days) thresholds that map to progression levels 1-10 (level 1 = just
# started / just failed, level 10 = long-matured). Level N is reached once
# interval_days >= LEVEL_INTERVAL_THRESHOLDS[N-1].
LEVEL_INTERVAL_THRESHOLDS = [0, 1, 3, 7, 14, 30, 60, 120, 180, 365]
