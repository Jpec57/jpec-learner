import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { getUpcoming } from "@/features/reviews/api";

const HOURS_SHOWN = 24;
const CHART_HEIGHT_PX = 64;

export function UpcomingBarChart({ categoryId }: { categoryId: string }) {
  const { t } = useTranslation("review");
  const { data: buckets } = useQuery({
    queryKey: ["reviewsUpcoming", categoryId],
    queryFn: () => getUpcoming(categoryId, HOURS_SHOWN),
    enabled: !!categoryId,
  });

  if (!buckets || buckets.every((bucket) => bucket.count === 0)) return null;

  const max = Math.max(...buckets.map((bucket) => bucket.count), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{t("upcoming.title")}</p>
      <div className="mt-3 flex items-end gap-0.5" style={{ height: CHART_HEIGHT_PX }}>
        {buckets.map((bucket, index) => {
          const hour = new Date(bucket.hour).getHours();
          const height = bucket.count === 0 ? 2 : Math.max(6, (bucket.count / max) * CHART_HEIGHT_PX);
          return (
            <div
              key={bucket.hour}
              className="group relative flex flex-1 flex-col items-center justify-end"
              title={t("upcoming.tooltip", { count: bucket.count, hour })}
            >
              <div
                className={`w-full rounded-sm ${bucket.count > 0 ? "bg-primary" : "bg-slate-100"}`}
                style={{ height }}
              />
              {index % 3 === 0 && <span className="mt-1 text-[9px] text-slate-400">{hour}h</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
