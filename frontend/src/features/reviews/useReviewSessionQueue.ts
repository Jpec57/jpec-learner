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
 * later at a random position, until it's rated "Good" or better. Passing
 * items just leave the queue. Server-side SRS scheduling (interval/due_at)
 * is unaffected -- that still happens on every submit via the normal API call,
 * this only controls what the *current session* shows next.
 */
export function useReviewSessionQueue(fetchedItems: DueItem[] | undefined) {
  const [queue, setQueue] = useState<DueItem[]>([]);
  const [sessionAttempts, setSessionAttempts] = useState(0);

  useEffect(() => {
    if (fetchedItems) {
      setQueue(shuffled(fetchedItems));
      setSessionAttempts(0);
    }
  }, [fetchedItems]);

  function submitResult(rating: number) {
    setSessionAttempts((n) => n + 1);
    setQueue((current) => {
      const [current_item, ...rest] = current;
      if (!current_item) return current;
      return rating >= PASSING_RATING_THRESHOLD ? rest : requeueRandomly(rest, current_item);
    });
  }

  function updateCurrentItem(patch: Partial<DueItem>) {
    setQueue((current) =>
      current.map((item, index) => (index === 0 ? { ...item, ...patch } : item))
    );
  }

  return {
    currentItem: queue[0] as DueItem | undefined,
    remainingCount: queue.length,
    sessionAttempts,
    submitResult,
    updateCurrentItem,
  };
}
