import { Swords } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { OPENING_COURSES, type Lang, type OpeningCourse } from "@/features/chess/openings";
import { ResetProgressButton } from "@/features/chess/components/ResetProgressButton";
import { isCompleted, isMastered, useChessProgress } from "@/features/chess/progress";

export function useLang(): Lang {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith("fr") ? "fr" : "en";
}

function CourseCard({ course, completed, mastered }: { course: OpeningCourse; completed: number; mastered: number }) {
  const { t } = useTranslation("chess");
  const lang = useLang();
  const total = course.lines.length;
  return (
    <Link
      to={`/chess/openings/${course.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xl" aria-hidden>
          {course.side === "w" ? "♔" : "♚"}
        </span>
        <span className="text-xs text-slate-400">{course.eco}</span>
      </div>
      <h3 className="mt-2 text-lg font-semibold text-slate-900">{course.name[lang]}</h3>
      <p className="mt-1 text-sm text-slate-600">{course.summary[lang]}</p>
      <div className="mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="relative h-full">
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary/35 transition-all" style={{ width: `${(completed / total) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all" style={{ width: `${(mastered / total) * 100}%` }} />
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {t("home.linesDone", { done: completed, total })}
          {mastered > 0 && <span className="text-emerald-700"> · {t("home.linesMastered", { count: mastered })}</span>}
        </p>
      </div>
    </Link>
  );
}

export function ChessHomePage() {
  const { t } = useTranslation("chess");
  const { progress, reset } = useChessProgress();
  const hasProgress = Object.keys(progress).length > 0;

  const section = (side: "w" | "b") => (
    <section className="mt-10">
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
        {t(side === "w" ? "home.asWhite" : "home.asBlack")}
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {OPENING_COURSES.filter((course) => course.side === side).map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            completed={course.lines.filter((line) => isCompleted(progress, course.id, line.id)).length}
            mastered={course.lines.filter((line) => isMastered(progress, course.id, line.id)).length}
          />
        ))}
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">{t("home.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("home.subtitle")}</p>

      <div className="mt-6 rounded-xl border border-primary/30 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
            <Swords className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">{t("home.playTitle")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("home.playDesc")}</p>
            <Link
              to="/chess/play"
              className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
            >
              {t("home.playCta")}
            </Link>
          </div>
        </div>
      </div>

      {section("w")}
      {section("b")}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400">{t("home.engineLoading")}</p>
        {hasProgress && (
          <ResetProgressButton label={t("progressReset.all")} question={t("progressReset.allQuestion")} onConfirm={() => reset()} />
        )}
      </div>
    </div>
  );
}
