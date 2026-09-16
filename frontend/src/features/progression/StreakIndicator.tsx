import { useTranslation } from "react-i18next";

export function StreakIndicator({ days }: { days: number }) {
  const { t } = useTranslation("progression");
  if (days <= 0) {
    return <p className="text-sm text-slate-400">{t("noStreak")}</p>;
  }
  return <p className="flex items-center gap-1 text-sm font-medium text-orange-600">{t("streak", { count: days })}</p>;
}
