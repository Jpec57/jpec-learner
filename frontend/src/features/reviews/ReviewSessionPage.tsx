import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { useConfirm } from "@/components/ui/useConfirm";
import { deleteCard, updateCard } from "@/features/cards/api";
import { getCategory } from "@/features/categories/api";
import { listFlat, updateNode } from "@/features/hierarchy/api";
import { ALL_REVIEW_ITEM_TYPES, getDue, submitReview, type ReviewItemType } from "@/features/reviews/api";
import { acceptedAnswersFor } from "@/features/reviews/answerGrading";
import { EditCardForm } from "@/features/reviews/EditCardForm";
import { EditLessonForm } from "@/features/reviews/EditLessonForm";
import { Flashcard } from "@/features/reviews/Flashcard";
import { NodeFilter } from "@/features/reviews/NodeFilter";
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
  // The node filter lives in the URL (?node=<id>) so the "Review" button on a
  // group/lesson page can deep-link to a scoped session.
  const [searchParams, setSearchParams] = useSearchParams();
  const nodeParam = searchParams.get("node");
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const queryClient = useQueryClient();

  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: () => getCategory(categoryId!),
    enabled: !!categoryId,
  });

  const { data: flatNodes } = useQuery({
    queryKey: ["hierarchyFlat", categoryId],
    queryFn: () => listFlat(categoryId!),
    enabled: !!categoryId,
  });
  // A stale or foreign ?node= (deleted group, other deck) falls back to the whole deck.
  const nodeId = flatNodes?.some((n) => n.id === nodeParam) ? nodeParam : null;
  const nodeTitle = flatNodes?.find((n) => n.id === nodeId)?.title;
  const nodeResolved = !nodeParam || !!flatNodes;

  function handleNodeChange(next: string | null) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("node", next);
        else params.delete("node");
        return params;
      },
      { replace: true }
    );
  }

  // Fetched once per (category, node, type filter) -- NOT invalidated after each
  // submit. The local session queue (below) governs what's shown next; a
  // failing rating keeps an item in *this session* even though its new
  // server-side due_at has moved into the future.
  const { data: fetchedDue, isLoading } = useQuery({
    queryKey: ["reviewsDue", categoryId, nodeId, types.join(",")],
    queryFn: () => getDue(categoryId!, types, undefined, nodeId),
    enabled: !!categoryId && nodeResolved,
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
    removeCurrentItem,
  } = useReviewSessionQueue(fetchedDue);

  const addAcceptedAnswer = useMutation({
    mutationFn: (answer: string) => {
      // With no explicit list, back_text is the sole answer -- keep it accepted
      // once the list becomes explicit.
      const existing = acceptedAnswersFor(currentItem?.back_text ?? "", currentItem?.accepted_answers ?? []);
      return updateCard(currentItem!.card_id!, { accepted_answers: [...existing, answer] });
    },
    onSuccess: (updated) => updateCurrentItem({ accepted_answers: updated.accepted_answers }),
  });

  const removeCard = useMutation({
    mutationFn: (cardId: string) => deleteCard(cardId),
    onSuccess: () => {
      removeCurrentItem();
      setRevealed(false);
      setEditing(false);
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err, t("common:errors.generic"))),
  });

  // Same session-local behaviour as deleting a card: the lesson leaves this
  // session without counting as an attempt, and stops coming up in future ones.
  const excludeLesson = useMutation({
    mutationFn: (nodeId: string) => updateNode(nodeId, { exclude_from_review: true }),
    onSuccess: (_updated, nodeId) => {
      removeCurrentItem();
      setRevealed(false);
      setEditing(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["hierarchyNode", nodeId] });
      queryClient.invalidateQueries({ queryKey: ["progression"] });
      queryClient.invalidateQueries({ queryKey: ["nodeProgression"] });
    },
    onError: (err) => setError(getErrorMessage(err, t("common:errors.generic"))),
  });

  if (!categoryId || !category || !nodeResolved) return null;

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

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <TypeFilter value={types} onChange={setTypes} />
        {flatNodes && flatNodes.length > 0 && (
          <NodeFilter nodes={flatNodes} value={nodeId} onChange={handleNodeChange} />
        )}
      </div>

      {isLoading ? null : !currentItem ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg font-medium text-slate-800">{t("allCaughtUp")}</p>
          <p className="mt-1 text-sm text-slate-500">
            {nodeTitle ? t("nothingDueInNode", { name: nodeTitle }) : t("nothingDueIn", { name: category.name })}
          </p>
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

              {currentItem.item_kind === "lesson" && currentItem.lesson_node_id && (
                <>
                  {!editing && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      <button onClick={() => setEditing(true)} className="hover:text-primary">
                        ✏️ {t("editLesson.trigger")}
                      </button>
                      <button
                        onClick={async () => {
                          if (await confirm(t("excludeLesson.trigger"), t("excludeLesson.confirm"))) {
                            excludeLesson.mutate(currentItem.lesson_node_id!);
                          }
                        }}
                        disabled={excludeLesson.isPending || submitting}
                        className="hover:text-red-600 disabled:opacity-50"
                      >
                        🚫 {t("excludeLesson.trigger")}
                      </button>
                      <Link
                        to={`/categories/${categoryId}/lessons/${currentItem.lesson_node_id}`}
                        className="hover:text-primary"
                      >
                        📄 {t("editLesson.openPage")}
                      </Link>
                    </div>
                  )}
                  {editing && (
                    <EditLessonForm
                      nodeId={currentItem.lesson_node_id}
                      title={currentItem.title ?? ""}
                      body={currentItem.body_markdown ?? ""}
                      onSaved={(patch) => {
                        updateCurrentItem(patch);
                        queryClient.invalidateQueries({ queryKey: ["hierarchyNode", currentItem.lesson_node_id] });
                        setEditing(false);
                      }}
                      onCancel={() => setEditing(false)}
                    />
                  )}
                </>
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

          {currentItem.card_id && (
            <button
              onClick={async () => {
                if (await confirm(t("common:actions.delete"), t("deleteCard.confirm"))) {
                  removeCard.mutate(currentItem.card_id!);
                }
              }}
              disabled={removeCard.isPending || submitting}
              className="mt-4 text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
            >
              {t("deleteCard.trigger")}
            </button>
          )}

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}
      {dialog}
    </div>
  );
}
