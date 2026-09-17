import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { getCategory } from "@/features/categories/api";
import { getProgression } from "@/features/progression/api";
import { ProgressionTree } from "@/features/progression/ProgressionTree";
import { StreakIndicator } from "@/features/progression/StreakIndicator";

const LEVEL_CHART_HEIGHT_PX = 64;

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

  const maxLevelCount = Math.max(...progression.level_distribution.map((entry) => entry.count), 1);

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

      {progression.total_items > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">{t("byLevel")}</p>
          <div className="mt-3 flex items-end gap-1" style={{ height: LEVEL_CHART_HEIGHT_PX }}>
            {progression.level_distribution.map((entry) => {
              const height =
                entry.count === 0 ? 2 : Math.max(6, (entry.count / maxLevelCount) * LEVEL_CHART_HEIGHT_PX);
              return (
                <div key={entry.level} className="flex flex-1 flex-col items-center justify-end gap-1">
                  {entry.count > 0 && <span className="text-[10px] text-slate-500">{entry.count}</span>}
                  <div
                    className={`w-full rounded-sm ${entry.count > 0 ? "bg-primary" : "bg-slate-100"}`}
                    style={{ height }}
                  />
                  <span className="text-[9px] text-slate-400">{entry.level}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-slate-400">{t("themes")}</h2>
      <p className="mt-1 text-xs text-slate-400">{t("treeHint")}</p>
      <div className="mt-3">
        <ProgressionTree categoryId={categoryId} />
      </div>
    </div>
  );
}
