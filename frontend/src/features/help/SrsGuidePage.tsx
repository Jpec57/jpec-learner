import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { listLevels } from "@/features/progression/api";

// Mirrors backend/app/services/srs_constants.py -- kept as a plain snapshot
// here since this page is documentation, not a live computation, and the
// constants are the current, stable set the plan calls out as a "product
// feel" default (see that file's own docstring).
const DEFAULT_EASE_FACTOR = 2.5;
const MIN_EASE_FACTOR = 1.3;
const HARD_INTERVAL_MULTIPLIER = 1.2;
const HARD_EASE_PENALTY = 0.15;
const AGAIN_EASE_PENALTY = 0.2;
const MAX_INTERVAL_DAYS = 365;
const LEVEL_INTERVAL_THRESHOLDS = [0, 1, 3, 7, 14, 30, 60, 120, 180, 365];

const RATING_KEYS = ["again", "hard", "good", "easy", "perfect"] as const;

export function SrsGuidePage() {
  const { t, i18n } = useTranslation("srsGuide");
  const { data: levels } = useQuery({ queryKey: ["levels"], queryFn: listLevels, staleTime: Infinity });

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
        {t("backLink")}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{t("title")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("intro")}</p>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">{t("ratingsTitle")}</h2>
        <div className="mt-3 space-y-3">
          {RATING_KEYS.map((key) => (
            <div key={key} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">{t(`ratings.${key}.label`)}</p>
              <p className="mt-1 text-sm text-slate-600">{t(`ratings.${key}.description`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">{t("intervalsTitle")}</h2>
        <p className="mt-2 text-sm text-slate-600">{t("intervalsIntro")}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>{t("intervalSteps.first")}</li>
          <li>{t("intervalSteps.second")}</li>
          <li>{t("intervalSteps.later", { maxDays: MAX_INTERVAL_DAYS })}</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">{t("easeTitle")}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t("easeIntro", { defaultEase: DEFAULT_EASE_FACTOR, minEase: MIN_EASE_FACTOR })}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>{t("easeChanges.goodEasyPerfect")}</li>
          <li>{t("easeChanges.hard", { penalty: HARD_EASE_PENALTY, multiplier: HARD_INTERVAL_MULTIPLIER })}</li>
          <li>{t("easeChanges.again", { penalty: AGAIN_EASE_PENALTY })}</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">{t("levelsTitle")}</h2>
        <p className="mt-2 text-sm text-slate-600">{t("levelsIntro")}</p>
        <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
          {LEVEL_INTERVAL_THRESHOLDS.map((days, index) => {
            const level = index + 1;
            const definition = levels?.find((l) => l.level === level);
            const name = (i18n.language.startsWith("fr") ? definition?.name_fr : definition?.name_en) ?? `${level}`;
            return (
              <li key={level} className="rounded-md border border-slate-200 bg-white px-3 py-1.5">
                {days === 0 ? t("levelStart", { level, name }) : t("levelThreshold", { level, name, days })}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
