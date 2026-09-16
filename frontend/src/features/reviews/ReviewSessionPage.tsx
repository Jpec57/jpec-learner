import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { getCategory } from "@/features/categories/api";
import { Flashcard } from "@/features/reviews/Flashcard";
import { getDue, submitReview } from "@/features/reviews/api";
import { RatingButtons } from "@/features/reviews/RatingButtons";

export function ReviewSessionPage() {
  const { t } = useTranslation("review");
  const { categoryId } = useParams<{ categoryId: string }>();
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);

  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: () => getCategory(categoryId!),
    enabled: !!categoryId,
  });

  const { data: due, isLoading } = useQuery({
    queryKey: ["reviewsDue", categoryId],
    queryFn: () => getDue(categoryId!),
    enabled: !!categoryId,
  });

  const submit = useMutation({
    mutationFn: (rating: number) => submitReview(due![0].review_state_id, rating),
    onSuccess: () => {
      setRevealed(false);
      setSessionDone((n) => n + 1);
      queryClient.invalidateQueries({ queryKey: ["reviewsDue", categoryId] });
    },
  });

  if (!categoryId || !category || isLoading) return null;

  const currentItem = due?.[0];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <Link to={`/categories/${categoryId}`} className="text-sm text-slate-500 hover:text-slate-800">
          ← {category.name}
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">{t("title")}</h1>
          {sessionDone > 0 && (
            <span className="text-sm text-slate-400">{t("reviewedThisSession", { count: sessionDone })}</span>
          )}
        </div>

        {!currentItem ? (
          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-lg font-medium text-slate-800">{t("allCaughtUp")}</p>
            <p className="mt-1 text-sm text-slate-500">{t("nothingDueIn", { name: category.name })}</p>
            <Link
              to={`/categories/${categoryId}`}
              className="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              {t("backToDashboard")}
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            <p className="text-sm text-slate-400">{t("due", { count: due!.length })}</p>
            <div className="mt-2">
              <Flashcard item={currentItem} revealed={revealed} />
            </div>

            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                className="mt-6 w-full rounded-lg bg-slate-800 py-3 text-sm font-medium text-white hover:bg-slate-700"
              >
                {t("revealAnswer")}
              </button>
            ) : (
              <RatingButtons onRate={(rating) => submit.mutate(rating)} disabled={submit.isPending} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
