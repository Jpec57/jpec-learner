import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cleanAnswers } from "@/features/cards/AnswersInput";
import type { LanguageDirection } from "@/features/cards/LanguageDirection";
import { translateText } from "@/features/translation/api";
import { getErrorMessage } from "@/lib/errors";
import { stripFurigana } from "@/lib/furigana";
import { hasGap } from "@/lib/gaps";

// "Translate" for a language deck (jisho for Japanese, a general free
// translator otherwise). A typed card gets one answer input per valid answer
// (each Jisho definition, say); a flip card gets the translation as its back.
// Other candidates show as chips, since free translators are hit-and-miss on
// single words: a chip adds an answer (typed) or replaces the back (flip).
export function TranslateAssist({
  front,
  direction,
  typed,
  answers,
  onAnswersChange,
  onBackChange,
}: {
  front: string;
  direction: LanguageDirection;
  typed: boolean;
  answers: string[];
  onAnswersChange: (answers: string[]) => void;
  onBackChange: (back: string) => void;
}) {
  const { t } = useTranslation("cards");
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const translate = useMutation({
    mutationFn: () =>
      translateText({ text: stripFurigana(front).trim(), source: direction.source, target: direction.target }),
    onSuccess: (result) => {
      setError(null);
      setProvider(result.provider);
      setAlternatives(result.alternatives);
      if (typed) onAnswersChange(result.answers.length > 0 ? result.answers : [result.translation]);
      else onBackChange(result.translation);
    },
    onError: (err) => {
      setAlternatives([]);
      setProvider(null);
      setError(getErrorMessage(err, t("translate.failed")));
    },
  });

  if (!direction.enabled) return null;

  const missingLanguages = !direction.source || !direction.target || direction.source === direction.target;
  const disabled = translate.isPending || !front.trim() || hasGap(front) || missingLanguages;
  const current = cleanAnswers(answers).map((answer) => answer.toLowerCase());
  const suggestions = alternatives.filter((alternative) => !typed || !current.includes(alternative.toLowerCase()));

  function pick(alternative: string) {
    if (typed) onAnswersChange([...cleanAnswers(answers), alternative]);
    else onBackChange(alternative);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => translate.mutate()}
          title={missingLanguages ? t("translate.pickLanguages") : undefined}
          className="rounded-md border border-primary/40 px-2 py-1 text-xs font-medium text-primary hover:bg-primary-light/40 disabled:opacity-50"
        >
          🌐 {translate.isPending ? t("translate.busy") : t("translate.button")}
        </button>
        {provider && <span className="text-[10px] text-slate-400">{t("translate.via", { provider })}</span>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">{t("translate.alternatives")}</span>
          {suggestions.map((alternative) => (
            <button
              key={alternative}
              type="button"
              onClick={() => pick(alternative)}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-primary-light hover:text-primary-dark"
            >
              {typed ? "+ " : ""}
              {alternative}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
