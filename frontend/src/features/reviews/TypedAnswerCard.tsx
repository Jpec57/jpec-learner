import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { CardText } from "@/components/ui/CardText";
import { answerLanguageDisplay } from "@/features/cards/answerLanguages";
import { acceptedAnswersFor, classifyTypedAnswer } from "@/features/reviews/answerGrading";
import type { DueItem } from "@/features/reviews/api";
import { RatingButtons } from "@/features/reviews/RatingButtons";
import { RetryConfirmButtons } from "@/features/reviews/RetryConfirmButtons";
import { normalizeAnswer } from "@/lib/textMatch";

const AUTO_PASS_RATING = 4;

type Phase = "answering" | "typoWarning" | "revealed";

export function TypedAnswerCard({
  item,
  onRate,
  hasFailedThisSession,
  onConfirmOk,
  disabled,
  onAddAcceptedAnswer,
}: {
  item: DueItem;
  onRate: (rating: number) => void;
  hasFailedThisSession: boolean;
  onConfirmOk: () => void;
  disabled?: boolean;
  onAddAcceptedAnswer: (answer: string) => void;
}) {
  const { t } = useTranslation("review");
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("answering");
  const [closestGuess, setClosestGuess] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const rawAcceptedAnswers = acceptedAnswersFor(item.back_text ?? "", item.accepted_answers);
  const language = item.answer_language ? answerLanguageDisplay(item.answer_language) : null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (phase !== "answering") return;
    const { verdict, closest } = classifyTypedAnswer(input, rawAcceptedAnswers);
    if (verdict === "correct") {
      if (hasFailedThisSession) {
        onConfirmOk();
      } else {
        onRate(AUTO_PASS_RATING);
      }
      return;
    }
    if (verdict === "typo") {
      setClosestGuess(closest);
      setPhase("typoWarning");
      return;
    }
    setPhase("revealed");
  }

  function handleAddAsAccepted() {
    onAddAcceptedAnswer(normalizeAnswer(input));
    setAdded(true);
  }

  return (
    <div className="min-h-[220px] rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-400">{t("card")}</p>
        {language && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {language.flag} {t("typed.expectedIn", { label: language.label })}
          </span>
        )}
      </div>
      <CardText text={item.front_text ?? ""} size="prose-lg" className="mt-3 block text-2xl text-slate-900" />

      {phase === "answering" && (
        <form onSubmit={handleSubmit} className="mt-6">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("typed.placeholder")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-lg"
          />
          <button
            type="submit"
            className="mt-3 w-full rounded-lg bg-slate-800 py-3 text-sm font-medium text-white hover:bg-slate-700"
          >
            {t("typed.submit")}
          </button>

          {item.hint && (
            <div className="mt-3">
              {showHint ? (
                <div className="text-sm text-slate-500">
                  <span aria-hidden>💡 </span>
                  <CardText text={item.hint} size="prose-base" className="inline-block align-top" />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowHint(true)}
                  className="text-xs text-slate-400 hover:text-primary"
                >
                  {t("typed.showHint")}
                </button>
              )}
            </div>
          )}
        </form>
      )}

      {phase === "typoWarning" && (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">{t("typed.typoWarning", { input, closest: closestGuess })}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setPhase("answering");
                setClosestGuess(null);
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
            >
              {t("typed.tryAgain")}
            </button>
            <button
              onClick={() => setPhase("revealed")}
              className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
            >
              {t("typed.forceSubmit")}
            </button>
          </div>
        </div>
      )}

      {phase === "revealed" && (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-wide text-slate-400">{t("typed.yourAnswer")}</p>
          <p className="mt-1 text-lg text-slate-700">{input.trim() || t("typed.noAnswer")}</p>
          <p className="mt-4 text-xs uppercase tracking-wide text-slate-400">{t("typed.correctAnswers")}</p>
          <p className="mt-1 text-lg font-medium text-slate-900">
            {rawAcceptedAnswers.map((answer, index) => (
              <span key={answer}>
                {index > 0 && ", "}
                <CardText text={answer} inline />
              </span>
            ))}
          </p>

          {input.trim() && !added && (
            <button onClick={handleAddAsAccepted} className="mt-2 text-xs text-slate-400 hover:text-primary">
              {t("typed.addAsAccepted")}
            </button>
          )}
          {added && <p className="mt-2 text-xs text-emerald-600">{t("typed.added")}</p>}

          {hasFailedThisSession ? (
            <RetryConfirmButtons onOk={onConfirmOk} onNotOk={() => onRate(1)} disabled={disabled} />
          ) : (
            <>
              <p className="mt-4 text-sm text-slate-500">{t("typed.selfRatePrompt")}</p>
              <RatingButtons onRate={onRate} disabled={disabled} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
