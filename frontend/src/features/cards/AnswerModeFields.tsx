import { useTranslation } from "react-i18next";

import type { AnswerMode } from "@/features/cards/api";
import { AnswersInput } from "@/features/cards/AnswersInput";
import { LanguageSelect } from "@/features/cards/LanguageSelect";
import { hasGap } from "@/lib/gaps";

// How the card is answered: flip & rate, or typed. Comes first in a card form
// because what follows (fill-in-the-blank, the answer inputs) depends on it.
export function AnswerModeToggle({
  mode,
  onModeChange,
}: {
  mode: AnswerMode;
  onModeChange: (mode: AnswerMode) => void;
}) {
  const { t } = useTranslation("cards");
  const buttonClass = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium ${active ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"}`;

  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-slate-400">{t("answerModeLabel")}</label>
      <div className="mt-1 flex gap-1">
        <button type="button" onClick={() => onModeChange("reveal")} className={buttonClass(mode === "reveal")}>
          {t("answerMode.reveal")}
        </button>
        <button type="button" onClick={() => onModeChange("typed")} className={buttonClass(mode === "typed")}>
          {t("answerMode.typed")}
        </button>
      </div>
    </div>
  );
}

// The typed answers (one input each) and, unless the deck already fixes it
// (a language deck's target language), the language they're expected in.
export function TypedAnswerFields({
  answers,
  onAnswersChange,
  language,
  onLanguageChange,
  showLanguage = true,
  requireAnswer = false,
}: {
  answers: string[];
  onAnswersChange: (answers: string[]) => void;
  language: string;
  onLanguageChange: (language: string) => void;
  showLanguage?: boolean;
  requireAnswer?: boolean;
}) {
  const { t } = useTranslation("cards");
  return (
    <>
      <AnswersInput value={answers} onChange={onAnswersChange} required={requireAnswer} />
      {showLanguage && (
        <LanguageSelect value={language} onChange={onLanguageChange} placeholder={t("answerLanguagePlaceholder")} />
      )}
    </>
  );
}

// "Also create the reverse card" -- not offered for a fill-in-the-blank
// sentence, whose reverse would ask for the whole sentence back. `showLanguage`
// is off on a language deck, where the reverse's language is just the source.
export function ReverseCardFields({
  front,
  mode,
  checked,
  onCheckedChange,
  language,
  onLanguageChange,
  showLanguage = true,
}: {
  front: string;
  mode: AnswerMode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  language: string;
  onLanguageChange: (language: string) => void;
  showLanguage?: boolean;
}) {
  const { t } = useTranslation("cards");
  if (hasGap(front)) return null;
  return (
    <>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} />
        {t("createReverse")}
      </label>
      {showLanguage && mode === "typed" && checked && (
        <LanguageSelect
          value={language}
          onChange={onLanguageChange}
          placeholder={t("reverseAnswerLanguagePlaceholder")}
        />
      )}
    </>
  );
}
