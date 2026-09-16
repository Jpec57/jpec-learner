import { useTranslation } from "react-i18next";

const RATINGS: { value: number; labelKey: string; className: string }[] = [
  { value: 1, labelKey: "ratings.again", className: "bg-red-500 hover:bg-red-400" },
  { value: 2, labelKey: "ratings.hard", className: "bg-orange-500 hover:bg-orange-400" },
  { value: 3, labelKey: "ratings.good", className: "bg-amber-500 hover:bg-amber-400" },
  { value: 4, labelKey: "ratings.easy", className: "bg-lime-500 hover:bg-lime-400" },
  { value: 5, labelKey: "ratings.perfect", className: "bg-emerald-500 hover:bg-emerald-400" },
];

export function RatingButtons({ onRate, disabled }: { onRate: (rating: number) => void; disabled?: boolean }) {
  const { t } = useTranslation("review");
  return (
    <div className="mt-6 grid grid-cols-5 gap-2">
      {RATINGS.map((rating) => (
        <button
          key={rating.value}
          disabled={disabled}
          onClick={() => onRate(rating.value)}
          className={`rounded-lg px-2 py-3 text-sm font-medium text-white transition disabled:opacity-50 ${rating.className}`}
        >
          {t(rating.labelKey)}
        </button>
      ))}
    </div>
  );
}
