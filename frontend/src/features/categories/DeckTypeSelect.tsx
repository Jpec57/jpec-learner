import { useTranslation } from "react-i18next";

import type { DeckType } from "@/features/categories/api";

const OPTIONS: { value: DeckType; icon: string }[] = [
  { value: "general", icon: "📚" },
  { value: "language", icon: "🌐" },
  { value: "scientific", icon: "🧪" },
];

export function DeckTypeSelect({ value, onChange }: { value: DeckType; onChange: (value: DeckType) => void }) {
  const { t } = useTranslation("categories");
  return (
    <div>
      <p className="text-xs text-slate-500">{t("deckType.label")}</p>
      <div className="mt-1 flex flex-wrap gap-1" role="radiogroup" aria-label={t("deckType.label")}>
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              value === option.value ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {option.icon} {t(`deckType.${option.value}`)}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-400">{t(`deckType.${value}Hint`)}</p>
    </div>
  );
}
