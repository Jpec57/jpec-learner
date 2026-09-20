import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { DECK_LANGUAGES } from "@/features/cards/deckLanguages";
import { updateCategory, type Category } from "@/features/categories/api";

export interface LanguageDirection {
  enabled: boolean;
  source: string;
  target: string;
  setSource: (code: string) => void;
  setTarget: (code: string) => void;
  swap: () => void;
  /** Saves the direction on the deck when it changed, so the next card starts from it. */
  remember: () => Promise<void>;
}

// A language deck remembers the last direction used: the form starts from the
// deck's saved source/target, and `remember()` (after a card is created) saves
// whatever was used.
export function useLanguageDirection(category: Category | undefined): LanguageDirection {
  const queryClient = useQueryClient();
  const [override, setOverride] = useState<{ source?: string; target?: string }>({});
  const source = override.source ?? category?.source_language ?? "";
  const target = override.target ?? category?.target_language ?? "";
  const enabled = category?.deck_type === "language";

  async function remember() {
    if (!enabled || !category || !source || !target) return;
    if (source === category.source_language && target === category.target_language) return;
    await updateCategory(category.id, { source_language: source, target_language: target });
    queryClient.invalidateQueries({ queryKey: ["category", category.id] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
  }

  return {
    enabled,
    source,
    target,
    setSource: (code) => setOverride((current) => ({ ...current, source: code })),
    setTarget: (code) => setOverride((current) => ({ ...current, target: code })),
    swap: () => setOverride({ source: target, target: source }),
    remember,
  };
}

/** On a language deck the answer language is simply the target language, so the
 * form doesn't ask for it a second time. */
export function answerLanguageForTarget(target: string): string {
  return DECK_LANGUAGES.some((language) => language.code === target) ? target : "";
}

// Source (recto) and destination (verso) language of a language deck's card.
export function LanguageDirectionFields({ direction }: { direction: LanguageDirection }) {
  const { t } = useTranslation("cards");
  const selectClass = "min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700";

  function options() {
    return DECK_LANGUAGES.map((language) => (
      <option key={language.code} value={language.code}>
        {language.flag} {language.label}
      </option>
    ));
  }

  return (
    <div className="flex items-center gap-1">
      <select
        aria-label={t("language.source")}
        value={direction.source}
        onChange={(e) => direction.setSource(e.target.value)}
        className={selectClass}
      >
        <option value="">{t("language.source")}</option>
        {options()}
      </select>
      <button
        type="button"
        onClick={direction.swap}
        aria-label={t("language.swap")}
        title={t("language.swap")}
        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary"
      >
        <ArrowLeftRight className="h-4 w-4" />
      </button>
      <select
        aria-label={t("language.target")}
        value={direction.target}
        onChange={(e) => direction.setTarget(e.target.value)}
        className={selectClass}
      >
        <option value="">{t("language.target")}</option>
        {options()}
      </select>
    </div>
  );
}
