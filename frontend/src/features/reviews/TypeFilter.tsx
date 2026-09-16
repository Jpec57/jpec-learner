import { useTranslation } from "react-i18next";

import { ALL_REVIEW_ITEM_TYPES, type ReviewItemType } from "@/features/reviews/api";

const OPTIONS: { types: ReviewItemType[]; labelKey: string }[] = [
  { types: ALL_REVIEW_ITEM_TYPES, labelKey: "filter.all" },
  { types: ["card"], labelKey: "filter.cards" },
  { types: ["lesson"], labelKey: "filter.lessons" },
];

function sameTypes(a: ReviewItemType[], b: ReviewItemType[]): boolean {
  return a.length === b.length && a.every((type) => b.includes(type));
}

export function TypeFilter({
  value,
  onChange,
}: {
  value: ReviewItemType[];
  onChange: (types: ReviewItemType[]) => void;
}) {
  const { t } = useTranslation("review");

  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
      {OPTIONS.map((option) => {
        const active = sameTypes(option.types, value);
        return (
          <button
            key={option.labelKey}
            onClick={() => onChange(option.types)}
            className={`rounded-md px-3 py-1 transition ${
              active ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
