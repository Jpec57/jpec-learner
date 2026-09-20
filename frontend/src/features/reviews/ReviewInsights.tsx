import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { getInsights, type ReviewInsightItem } from "@/features/reviews/api";
import { formatDateTime } from "@/lib/formatDate";

function itemLabel(item: ReviewInsightItem): string {
  return (item.item_kind === "card" ? item.front_text : item.title) ?? "";
}

function itemHref(categoryId: string, item: ReviewInsightItem): string | null {
  if (item.item_kind === "card" && item.card_id) return `/categories/${categoryId}/cards/${item.card_id}`;
  if (item.lesson_node_id) return `/categories/${categoryId}/lessons/${item.lesson_node_id}`;
  return null;
}

function InsightList({
  emoji,
  title,
  categoryId,
  items,
  subtitle,
}: {
  emoji: string;
  title: string;
  categoryId: string;
  items: ReviewInsightItem[];
  subtitle: (item: ReviewInsightItem) => string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">
        <span aria-hidden>{emoji} </span>
        {title}
      </p>
      <ul className="mt-2 space-y-1">
        {items.map((item) => {
          const href = itemHref(categoryId, item);
          const content = (
            <>
              <p className="truncate text-sm text-slate-800">{itemLabel(item)}</p>
              <p className="text-xs text-slate-400">{subtitle(item)}</p>
            </>
          );
          return (
            <li key={item.review_state_id}>
              {href ? (
                <Link to={href} className="-mx-2 block rounded-md px-2 py-1 hover:bg-slate-50">
                  {content}
                </Link>
              ) : (
                <div className="py-1">{content}</div>
              )}
            </li>
          );
        })}
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
            emoji="😓"
            categoryId={categoryId}
            title={t("insights.struggling")}
            items={data.struggling}
            subtitle={(item) => t("insights.levelAttempts", { level: item.current_level, count: item.repetitions })}
          />
        )}
        {data.stale.length > 0 && (
          <InsightList
            emoji="💤"
            categoryId={categoryId}
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
