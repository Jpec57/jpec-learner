import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { getInsights, type ReviewInsightItem } from "@/features/reviews/api";
import { formatDateTime } from "@/lib/formatDate";

function itemLabel(item: ReviewInsightItem): string {
  return (item.item_kind === "card" ? item.front_text : item.title) ?? "";
}

function InsightList({
  title,
  items,
  subtitle,
}: {
  title: string;
  items: ReviewInsightItem[];
  subtitle: (item: ReviewInsightItem) => string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.review_state_id}>
            <p className="truncate text-sm text-slate-800">{itemLabel(item)}</p>
            <p className="text-xs text-slate-400">{subtitle(item)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReviewInsights({ categoryId }: { categoryId: string }) {
  const { t, i18n } = useTranslation("categories");
  const { data } = useQuery({
    queryKey: ["reviewInsights", categoryId],
    queryFn: () => getInsights(categoryId),
    enabled: !!categoryId,
  });

  if (!data || (data.struggling.length === 0 && data.stale.length === 0)) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-400">{t("insights.title")}</p>
        <Link to={`/categories/${categoryId}/review`} className="text-xs font-medium text-primary hover:underline">
          {t("insights.reviewNow")}
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {data.struggling.length > 0 && (
          <InsightList
            title={t("insights.struggling")}
            items={data.struggling}
            subtitle={(item) => t("insights.levelAttempts", { level: item.current_level, count: item.repetitions })}
          />
        )}
        {data.stale.length > 0 && (
          <InsightList
            title={t("insights.stale")}
            items={data.stale}
            subtitle={(item) =>
              item.last_reviewed_at
                ? t("insights.lastReviewed", { date: formatDateTime(item.last_reviewed_at, i18n.language) })
                : t("insights.neverReviewed")
            }
          />
        )}
      </div>
    </div>
  );
}
