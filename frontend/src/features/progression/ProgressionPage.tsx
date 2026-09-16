import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { getCategory } from "@/features/categories/api";
import { getProgression } from "@/features/progression/api";
import { LevelBadge } from "@/features/progression/LevelBadge";
import { ProgressBar } from "@/features/progression/ProgressBar";
import { StreakIndicator } from "@/features/progression/StreakIndicator";

export function ProgressionPage() {
  const { t } = useTranslation("progression");
  const { categoryId } = useParams<{ categoryId: string }>();

  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: () => getCategory(categoryId!),
    enabled: !!categoryId,
  });

  const { data: progression } = useQuery({
    queryKey: ["progression", categoryId],
    queryFn: () => getProgression(categoryId!),
    enabled: !!categoryId,
  });

  if (!categoryId || !category || !progression) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={`/categories/${categoryId}`} className="text-sm text-slate-500 hover:text-slate-800">
        ← {category.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{t("title")}</h1>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-sm text-slate-500">
            {t("itemsTracked", { count: progression.total_items })} ·{" "}
            {t("dueNow", { count: progression.total_due })}
          </p>
          <div className="mt-1">
            <StreakIndicator days={progression.streak_days} />
          </div>
        </div>
      </div>

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-slate-400">{t("themes")}</h2>
      <div className="mt-3 space-y-3">
        {progression.themes.map((theme) => (
          <div key={theme.node_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-slate-900">{theme.title}</h3>
              <LevelBadge level={theme.avg_level} />
            </div>
            <div className="mt-3">
              <ProgressBar value={theme.avg_level} />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {t("itemsTracked", { count: theme.total_items })} · {t("dueNow", { count: theme.due_count })}
            </p>
          </div>
        ))}
        {progression.themes.length === 0 && (
          <p className="text-sm text-slate-400">
            {t("noThemesPrefix")}{" "}
            <Link to={`/categories/${categoryId}/browse`} className="text-primary hover:underline">
              {t("browse")}
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
