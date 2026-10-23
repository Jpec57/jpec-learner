import { GraduationCap, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { openCoach } from "@/features/assistant/coachBus";
import { formatLine, type CoachNote, type MoveReview } from "@/features/chess/coach";
import { formatScore, QUALITY_STYLE, QUALITY_SYMBOL, type MoveQuality } from "@/features/chess/evaluation";

export function QualityBadge({ quality }: { quality: MoveQuality }) {
  const { t } = useTranslation("chess");
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${QUALITY_STYLE[quality]}`}>
      {QUALITY_SYMBOL[quality] && <span>{QUALITY_SYMBOL[quality]}</span>}
      {t(`coach.quality.${quality}`)}
    </span>
  );
}

export function useNoteText() {
  const { t } = useTranslation("chess");
  return (note: CoachNote) => {
    const params = { ...note.params };
    if (typeof params.piece === "string") params.piece = t(`pieces.${params.piece}`);
    return t(`coach.notes.${note.key}`, params);
  };
}

interface CoachPanelProps {
  review: MoveReview | null;
  pending: boolean;
  viewingBest: boolean;
  onToggleBest: () => void;
  onRetry?: () => void;
  /** The AI assistant is only offered when the user switched it on. */
  allowAi?: boolean;
}

export function CoachPanel({ review, pending, viewingBest, onToggleBest, onRetry, allowAi = false }: CoachPanelProps) {
  const { t } = useTranslation("chess");
  const noteText = useNoteText();

  const isBad = review && ["inaccuracy", "mistake", "blunder"].includes(review.quality);

  function askAi() {
    if (!review) return;
    openCoach(
      t("coach.aiPrompt", {
        fen: review.fenBefore,
        played: review.playedSan,
        color: t(review.mover === "w" ? "play.white" : "play.black"),
        quality: t(`coach.quality.${review.quality}`),
        before: formatScore(review.evalBefore),
        after: formatScore(review.evalAfter),
        best: review.bestSan ?? "?",
        line: formatLine(review.fenBefore, review.bestLineSan.slice(0, 6)),
      })
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-slate-400">
        <GraduationCap className="h-4 w-4" />
        {t("coach.title")}
      </h2>

      {!review && <p className="mt-3 text-sm text-slate-500">{pending ? t("coach.reviewing") : t("coach.empty")}</p>}

      {review && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{t("coach.yourMove", { move: review.playedSan })}</span>
            <QualityBadge quality={review.quality} />
          </div>
          <p className="text-xs text-slate-500">
            {t("coach.evalChange", { before: formatScore(review.evalBefore), after: formatScore(review.evalAfter) })}
          </p>
          <ul className="space-y-1.5 text-sm text-slate-700">
            {review.notes.map((note, index) => (
              <li key={index} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                <span>{noteText(note)}</span>
              </li>
            ))}
          </ul>
          {review.quality !== "best" && review.bestSan && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={onToggleBest}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-primary/50 hover:text-primary"
              >
                {viewingBest ? t("coach.backToGame") : t("coach.showBest")}
              </button>
              {isBad && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
                >
                  {t("coach.retry")}
                </button>
              )}
              {isBad && allowAi && (
                <button
                  type="button"
                  onClick={askAi}
                  className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-primary"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("coach.askAi")}
                </button>
              )}
            </div>
          )}
          {viewingBest && <p className="text-xs text-slate-500">{t("coach.viewingBefore")}</p>}
        </div>
      )}
      {review && pending && <p className="mt-2 text-xs text-slate-400">{t("coach.reviewing")}</p>}
    </section>
  );
}
