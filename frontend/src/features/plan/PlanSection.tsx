import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { MathTextarea } from "@/components/ui/MathTextarea";
import { openCoach } from "@/features/assistant/coachBus";
import type { DeckType } from "@/features/categories/api";
import {
  getPlan,
  getPlanProgress,
  updatePlan,
  type PlanSectionProgress,
  type SectionStatus,
} from "@/features/plan/api";
import { ProgressBar } from "@/features/progression/ProgressBar";
import { getErrorMessage } from "@/lib/errors";

const STATUS_CLASSES: Record<SectionStatus, string> = {
  weak: "bg-red-100 text-red-800 border-red-300",
  no_content: "bg-amber-100 text-amber-800 border-amber-300",
  not_started: "bg-slate-100 text-slate-700 border-slate-300",
  in_progress: "bg-sky-100 text-sky-800 border-sky-300",
  solid: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

function SectionRow({ section }: { section: PlanSectionProgress }) {
  const { t } = useTranslation("plan");
  const done = section.checklist.filter((item) => item.done).length;
  const hasContent = section.total_items > 0;

  return (
    <li className={section.level === 3 ? "ml-5" : ""}>
      <div className="flex items-center justify-between gap-2">
        <span className={section.level === 2 ? "font-medium text-slate-900" : "text-sm text-slate-700"}>
          {section.title}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[section.status]}`}
        >
          {t(`status.${section.status}`)}
        </span>
      </div>
      {hasContent && (
        <div className="mt-1.5">
          <ProgressBar value={section.avg_level} />
        </div>
      )}
      <p className="mt-1 text-xs text-slate-500">
        {hasContent
          ? [
              t("section.items", { count: section.total_items }),
              t("section.due", { count: section.due_count }),
              section.lapse_rate !== null
                ? t("section.lapse", { percent: Math.round(section.lapse_rate * 100) })
                : null,
              section.checklist.length > 0
                ? t("section.milestones", { done, total: section.checklist.length })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : section.checklist.length > 0
            ? t("section.milestones", { done, total: section.checklist.length })
            : t(section.status === "no_content" ? "section.noContentHint" : "section.notStartedHint")}
      </p>
    </li>
  );
}

export function PlanSection({ categoryId, deckType }: { categoryId: string; deckType: DeckType }) {
  const { t } = useTranslation(["plan", "common", "assistant"]);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: plan } = useQuery({ queryKey: ["plan", categoryId], queryFn: () => getPlan(categoryId) });
  const { data: progress } = useQuery({
    queryKey: ["plan-progress", categoryId],
    queryFn: () => getPlanProgress(categoryId),
  });

  const save = useMutation({
    mutationFn: () => updatePlan(categoryId, { goal, plan_markdown: markdown }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["plan-progress", categoryId] });
      setEditing(false);
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err, t("common:errors.generic"))),
  });

  if (!plan) return null;

  function startEditing() {
    setGoal(plan?.goal ?? "");
    setMarkdown(plan?.plan_markdown ?? "");
    setError(null);
    setEditing(true);
  }

  const hasPlan = !!plan.goal || !!plan.plan_markdown;
  const sections = progress?.sections ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <GraduationCap className="h-4 w-4 text-primary" />
            {t("plan:title")}
          </h2>
          {!editing && (
            <p className="mt-1 text-sm text-slate-600">{plan.goal ?? t("plan:noGoal")}</p>
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => openCoach()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
            >
              {t("plan:askCoach")}
            </button>
            <button
              onClick={startEditing}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              {hasPlan ? t("plan:edit") : t("plan:write")}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("plan:goalLabel")}</span>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={t("plan:goalPlaceholder")}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="text-sm">
            <span className="font-medium text-slate-700">{t("plan:planLabel")}</span>
            <p className="text-xs text-slate-500">{t("plan:planHelp")}</p>
            {deckType === "scientific" ? (
              <MathTextarea
                value={markdown}
                onChange={setMarkdown}
                rows={14}
                placeholder={t("plan:planPlaceholder")}
                className="mt-1"
              />
            ) : (
              <textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                rows={14}
                placeholder={t("plan:planPlaceholder")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={save.isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {t("common:actions.save")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <>
          {sections.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{t("plan:emptyPlan")}</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {sections.map((section, index) => (
                <SectionRow key={`${index}-${section.title}`} section={section} />
              ))}
            </ul>
          )}

          {sections.some((s) => s.status === "no_content") && (
            <p className="mt-4 text-xs text-slate-500">{t("plan:linkHint")}</p>
          )}

          {progress && progress.weakest_cards.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-medium text-slate-500">
                <span aria-hidden>🎯 </span>
                {t("plan:weakestCards")}
              </p>
              <ul className="mt-2 space-y-1">
                {progress.weakest_cards.map((card) => (
                  <li key={card.card_id} className="flex items-center justify-between gap-2 text-sm">
                    <Link
                      to={`/categories/${categoryId}/cards/${card.card_id}`}
                      className="truncate text-slate-700 hover:text-primary"
                    >
                      {card.front_text}
                    </Link>
                    <span className="shrink-0 text-xs text-slate-400">
                      {t("plan:lapses", { count: card.lapses })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasPlan && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {(["assess", "weakest"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => openCoach(t(`assistant:coach.prompts.${key}`))}
                  className="rounded-full border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/5"
                >
                  {t(`assistant:coach.prompts.${key}`)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
