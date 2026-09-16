import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { getDueCount } from "@/features/notifications/api";

const DISMISSED_KEY = "jpeclearner.dueBannerDismissedDate";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DueBanner() {
  const { t } = useTranslation("common");
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === todayKey();
    } catch {
      return false;
    }
  });

  const { data: totalDue } = useQuery({ queryKey: ["dueCount"], queryFn: getDueCount });

  if (dismissed || !totalDue) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, todayKey());
    } catch {
      // localStorage may be unavailable (private mode); dismissal just won't persist.
    }
    setDismissed(true);
  }

  return (
    <div className="mb-6 flex items-center justify-between rounded-xl border border-primary/30 bg-primary-light px-4 py-3">
      <p className="text-sm font-medium text-primary-dark">
        🔔 {t("dueBanner.message", { count: totalDue })}
      </p>
      <button onClick={dismiss} className="text-xs text-primary hover:underline">
        {t("dueBanner.dismiss")}
      </button>
    </div>
  );
}
