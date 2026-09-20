import { useEffect, useState } from "react";

import type { DueItem } from "@/features/reviews/api";

/** SM-2 quality >= 3 ("Good" and above) is a pass; anything below means the
 * item goes back into the local queue instead of leaving the session. */
const PASSING_RATING_THRESHOLD = 3;

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Reinserts `item` at a random position among the *other* remaining items,
 * never at the very front (so the same card can't reappear immediately). */
function requeueRandomly<T>(remaining: T[], item: T): T[] {
  const index = remaining.length === 0 ? 0 : 1 + Math.floor(Math.random() * remaining.length);
  const next = [...remaining];
  next.splice(index, 0, item);
  return next;
}

/**
 * Owns the in-session review queue, independent from the server's due list:
 * a failing rating (< "Good") keeps the item in this session, reappearing
 * later at a random position, until it's confirmed OK. Passing items just
 * leave the queue. Server-side SRS scheduling (interval/due_at) is
 * unaffected by the requeue itself -- that happens on every real submit via
 * the normal API call, this only controls what the *current session* shows
 * next.
 *
 * Once an item has failed once this session, its retry can only ever be
 * "OK" (confirmRetry, no further API call -- the earlier failing submit
 * already set the real SRS state) or "Not OK" (another failing submit,
 * still handled by submitResult). Either way it can never level up further
 * within the same session -- see failedIds and srs.py's own level cap.
 */
export function useReviewSessionQueue(fetchedItems: DueItem[] | undefined) {
  const [queue, setQueue] = useState<DueItem[]>([]);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [sessionAttempts, setSessionAttempts] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);

  useEffect(() => {
    if (fetchedItems) {
      setQueue(shuffled(fetchedItems));
      setFailedIds(new Set());
      setSessionAttempts(0);
      setCorrectCount(0);
      setIncorrectCount(0);
    }
  }, [fetchedItems]);

  function submitResult(rating: number) {
    const passed = rating >= PASSING_RATING_THRESHOLD;
    setSessionAttempts((n) => n + 1);
    if (passed) {
      setCorrectCount((n) => n + 1);
    } else {
      setIncorrectCount((n) => n + 1);
    }
    setQueue((current) => {
      const [current_item, ...rest] = current;
      if (!current_item) return current;
      if (!passed) {
        setFailedIds((prev) => new Set(prev).add(current_item.review_state_id));
        return requeueRandomly(rest, current_item);
      }
      return rest;
    });
  }

  /** The "OK" outcome on a forced redo after a fail: leaves the session
   * queue without a further backend submission -- the earlier failing
   * submitResult already recorded the real SRS state (and its capped
   * level), so this confirmation is for the learner's benefit only. */
  function confirmRetry() {
    setCorrectCount((n) => n + 1);
    setQueue((current) => current.slice(1));
  }

  function updateCurrentItem(patch: Partial<DueItem>) {
    setQueue((current) =>
      current.map((item, index) => (index === 0 ? { ...item, ...patch } : item))
    );
  }

  /** Drops the current item from the session without counting it as an
   * attempt (used when its card gets deleted mid-review). */
  function removeCurrentItem() {
    setQueue((current) => current.slice(1));
  }

  const currentItem = queue[0] as DueItem | undefined;

  return {
    currentItem,
    remainingCount: queue.length,
    hasFailedThisSession: !!currentItem && failedIds.has(currentItem.review_state_id),
    sessionAttempts,
    correctCount,
    incorrectCount,
    submitResult,
    confirmRetry,
    updateCurrentItem,
    removeCurrentItem,
  };
}
