import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DueItem } from "@/features/reviews/api";
import { useReviewSessionQueue } from "@/features/reviews/useReviewSessionQueue";

function makeItem(id: string): DueItem {
  return {
    review_state_id: id,
    item_kind: "card",
    card_id: id,
    lesson_node_id: null,
    front_text: `front-${id}`,
    back_text: `back-${id}`,
    title: null,
    body_markdown: null,
    answer_mode: "reveal",
    accepted_answers: [],
    answer_language: null,
    hint: null,
    due_at: new Date().toISOString(),
    current_level: 1,
  };
}

describe("useReviewSessionQueue", () => {
  it("seeds the queue from fetched items and exposes the first as current", () => {
    const items = [makeItem("a"), makeItem("b"), makeItem("c")];
    const { result } = renderHook(() => useReviewSessionQueue(items));

    expect(result.current.remainingCount).toBe(3);
    expect(items.map((i) => i.review_state_id)).toContain(result.current.currentItem?.review_state_id);
  });

  it("removes the current item from the queue on a passing rating (>= 3)", () => {
    const items = [makeItem("a")];
    const { result } = renderHook(() => useReviewSessionQueue(items));

    act(() => result.current.submitResult(4));

    expect(result.current.remainingCount).toBe(0);
    expect(result.current.currentItem).toBeUndefined();
  });

  it("keeps a failing item (rating < 3) in the queue instead of removing it", () => {
    const items = [makeItem("a"), makeItem("b")];
    const { result } = renderHook(() => useReviewSessionQueue(items));

    act(() => result.current.submitResult(1));

    // Still 2 items: "a" was requeued, not dropped.
    expect(result.current.remainingCount).toBe(2);
    const ids = new Set<string>();
    // Can't observe internal order directly, but the failed item must still be
    // reachable: keep submitting passes until the queue drains and assert "a"
    // was seen again at some point.
    for (let i = 0; i < 10 && result.current.currentItem; i++) {
      ids.add(result.current.currentItem.review_state_id);
      act(() => result.current.submitResult(5));
    }
    expect(ids.has("a")).toBe(true);
  });

  it("counts every submission (pass or fail) as a session attempt", () => {
    const items = [makeItem("a")];
    const { result } = renderHook(() => useReviewSessionQueue(items));

    act(() => result.current.submitResult(1)); // fail, requeued
    act(() => result.current.submitResult(4)); // pass, removed

    expect(result.current.sessionAttempts).toBe(2);
  });

  it("splits attempts into correct and incorrect counts", () => {
    const items = [makeItem("a")];
    const { result } = renderHook(() => useReviewSessionQueue(items));

    act(() => result.current.submitResult(2)); // fail (Hard, below threshold), requeued
    act(() => result.current.submitResult(3)); // pass (Good, at threshold), removed

    expect(result.current.correctCount).toBe(1);
    expect(result.current.incorrectCount).toBe(1);
  });

  it("resets correct/incorrect counts when a new batch of fetched items arrives", () => {
    const initial = [makeItem("a")];
    const { result, rerender } = renderHook(({ fetched }) => useReviewSessionQueue(fetched), {
      initialProps: { fetched: initial as DueItem[] | undefined },
    });
    act(() => result.current.submitResult(4));
    expect(result.current.correctCount).toBe(1);

    rerender({ fetched: [makeItem("x")] });

    expect(result.current.correctCount).toBe(0);
    expect(result.current.incorrectCount).toBe(0);
  });

  it("never re-shows the just-failed item as the very next card when others remain", () => {
    const items = [makeItem("a"), makeItem("b"), makeItem("c")];
    const { result } = renderHook(() => useReviewSessionQueue(items));

    // Drive "a" to the front deterministically isn't possible without seeing
    // internal order, so instead assert the general contract across many
    // trials: immediately after a fail, the *current* item is never the one
    // that just failed (it must be reinserted behind at least one other item).
    for (let trial = 0; trial < 20; trial++) {
      const failed = result.current.currentItem!.review_state_id;
      act(() => result.current.submitResult(1));
      if (result.current.remainingCount > 1) {
        expect(result.current.currentItem?.review_state_id).not.toBe(failed);
      }
    }
  });

  it("resets the queue when a new batch of fetched items arrives (e.g. type filter changed)", () => {
    const initial = [makeItem("a")];
    const { result, rerender } = renderHook(({ fetched }) => useReviewSessionQueue(fetched), {
      initialProps: { fetched: initial as DueItem[] | undefined },
    });
    act(() => result.current.submitResult(4));
    expect(result.current.remainingCount).toBe(0);

    const nextBatch = [makeItem("x"), makeItem("y")];
    rerender({ fetched: nextBatch });

    expect(result.current.remainingCount).toBe(2);
    expect(result.current.sessionAttempts).toBe(0);
  });

  it("updateCurrentItem patches only the item at the front of the queue", () => {
    const items = [makeItem("a"), makeItem("b")];
    const { result } = renderHook(() => useReviewSessionQueue(items));

    act(() => result.current.updateCurrentItem({ front_text: "edited" }));

    expect(result.current.currentItem?.front_text).toBe("edited");
  });

  it("marks an item as having failed this session once it gets a failing rating", () => {
    const items = [makeItem("a")];
    const { result } = renderHook(() => useReviewSessionQueue(items));

    expect(result.current.hasFailedThisSession).toBe(false);
    act(() => result.current.submitResult(1));
    expect(result.current.hasFailedThisSession).toBe(true);
  });

  it("confirmRetry removes the current item without affecting attempt counts", () => {
    const items = [makeItem("a")];
    const { result } = renderHook(() => useReviewSessionQueue(items));

    act(() => result.current.submitResult(1)); // fail, requeued, sessionAttempts=1
    expect(result.current.sessionAttempts).toBe(1);

    act(() => result.current.confirmRetry());

    expect(result.current.remainingCount).toBe(0);
    expect(result.current.correctCount).toBe(1);
    // confirmRetry is not a real submission -- it never touches sessionAttempts.
    expect(result.current.sessionAttempts).toBe(1);
  });

  it("clears failedIds when a new batch of fetched items arrives", () => {
    const initial = [makeItem("a")];
    const { result, rerender } = renderHook(({ fetched }) => useReviewSessionQueue(fetched), {
      initialProps: { fetched: initial as DueItem[] | undefined },
    });
    act(() => result.current.submitResult(1));
    expect(result.current.hasFailedThisSession).toBe(true);

    rerender({ fetched: [makeItem("a")] });

    expect(result.current.hasFailedThisSession).toBe(false);
  });

  it("removeCurrentItem drops the current item without counting an attempt", () => {
    const items = [makeItem("a"), makeItem("b")];
    const { result } = renderHook(() => useReviewSessionQueue(items));
    const first = result.current.currentItem!.review_state_id;

    act(() => result.current.removeCurrentItem());

    expect(result.current.remainingCount).toBe(1);
    expect(result.current.currentItem!.review_state_id).not.toBe(first);
    expect(result.current.correctCount).toBe(0);
    expect(result.current.incorrectCount).toBe(0);
  });
});
