import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { updateCard } from "@/features/cards/api";
import { getCategory } from "@/features/categories/api";
import { ALL_REVIEW_ITEM_TYPES, getDue, submitReview, type ReviewItemType } from "@/features/reviews/api";
import { EditCardForm } from "@/features/reviews/EditCardForm";
import { Flashcard } from "@/features/reviews/Flashcard";
import { RatingButtons } from "@/features/reviews/RatingButtons";
import { RetryConfirmButtons } from "@/features/reviews/RetryConfirmButtons";
import { TypedAnswerCard } from "@/features/reviews/TypedAnswerCard";
import { TypeFilter } from "@/features/reviews/TypeFilter";
import { useReviewSessionQueue } from "@/features/reviews/useReviewSessionQueue";
import { getErrorMessage } from "@/lib/errors";

export function ReviewSessionPage() {
  const { t } = useTranslation(["review", "common"]);
  const { categoryId } = useParams<{ categoryId: string }>();
  const [types, setTypes] = useState<ReviewItemType[]>(ALL_REVIEW_ITEM_TYPES);
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: () => getCategory(categoryId!),
    enabled: !!categoryId,
  });

  // Fetched once per (category, type filter) -- NOT invalidated after each
  // submit. The local session queue (below) governs what's shown next; a
  // failing rating keeps an item in *this session* even though its new
  // server-side due_at has moved into the future.
  const { data: fetchedDue, isLoading } = useQuery({
    queryKey: ["reviewsDue", categoryId, types.join(",")],
    queryFn: () => getDue(categoryId!, types),
    enabled: !!categoryId,
  });

  const {
    currentItem,
    remainingCount,
    hasFailedThisSession,
    correctCount,
    incorrectCount,
    submitResult,
    confirmRetry,
    updateCurrentItem,
  } = useReviewSessionQueue(fetchedDue);

  const addAcceptedAnswer = useMutation({
    mutationFn: (answer: string) => {
      const existing = currentItem?.accepted_answers ?? [];
      return updateCard(currentItem!.card_id!, { accepted_answers: [...existing, answer] });
    },
    onSuccess: (updated) => updateCurrentItem({ accepted_answers: updated.accepted_answers }),
  });

  if (!categoryId || !category || isLoading) return null;

  async function handleRate(rating: number) {
    if (!currentItem) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitReview(currentItem.review_state_id, rating);
      submitResult(rating);
      setRevealed(false);
      setEditing(false);
    } catch (err) {
      setError(getErrorMessage(err, t("common:errors.generic")));
    } finally {
      setSubmitting(false);
    }
  }

  // The "OK" outcome on a forced redo after this item already failed once
  // this session: purely a session-local confirmation, no further API call --
  // the earlier failing rating already set (and capped) the real SRS state.
  function handleConfirmOk() {
    confirmRetry();
    setRevealed(false);
    setEditing(false);
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link to={`/categories/${categoryId}`} className="text-sm text-slate-500 hover:text-slate-800">
        ← {category.name}
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{t("title")}</h1>
        {(correctCount > 0 || incorrectCount > 0) && (
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-emerald-600">{t("sessionStats.correct", { count: correctCount })}</span>
            <span className="font-medium text-red-500">{t("sessionStats.incorrect", { count: incorrectCount })}</span>
            <span className="text-slate-400">{t("sessionStats.remaining", { count: remainingCount })}</span>
          </div>
        )}
      </div>

      <div className="mt-4">
        <TypeFilter value={types} onChange={setTypes} />
      </div>

      {!currentItem ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg font-medium text-slate-800">{t("allCaughtUp")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("nothingDueIn", { name: category.name })}</p>
          <Link
            to={`/categories/${categoryId}`}
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            {t("backToDashboard")}
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-sm text-slate-400">{t("due", { count: remainingCount })}</p>

          {currentItem.item_kind === "card" && currentItem.answer_mode === "typed" ? (
            <div className="mt-2">
              <TypedAnswerCard
                key={currentItem.review_state_id}
                item={currentItem}
                onRate={handleRate}
                hasFailedThisSession={hasFailedThisSession}
                onConfirmOk={handleConfirmOk}
                disabled={submitting}
                onAddAcceptedAnswer={(answer) => addAcceptedAnswer.mutate(answer)}
              />
            </div>
          ) : (
            <>
              <div className="mt-2">
                <Flashcard item={currentItem} revealed={revealed} />
              </div>

              {revealed && currentItem.card_id && !editing && (
                <button onClick={() => setEditing(true)} className="mt-2 text-xs text-slate-400 hover:text-primary">
                  {t("editCard.trigger")}
                </button>
              )}

              {revealed && editing && currentItem.card_id && (
                <EditCardForm
                  cardId={currentItem.card_id}
                  frontText={currentItem.front_text ?? ""}
                  backText={currentItem.back_text ?? ""}
                  onSaved={(patch) => {
                    updateCurrentItem(patch);
                    setEditing(false);
                  }}
                  onCancel={() => setEditing(false)}
                />
              )}

              {!revealed ? (
                <button
                  onClick={() => setRevealed(true)}
                  className="mt-6 w-full rounded-lg bg-slate-800 py-3 text-sm font-medium text-white hover:bg-slate-700"
                >
                  {t("revealAnswer")}
                </button>
              ) : (
                !editing &&
                (hasFailedThisSession ? (
                  <RetryConfirmButtons onOk={handleConfirmOk} onNotOk={() => handleRate(1)} disabled={submitting} />
                ) : (
                  <RatingButtons onRate={handleRate} disabled={submitting} />
                ))
              )}
            </>
          )}

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
