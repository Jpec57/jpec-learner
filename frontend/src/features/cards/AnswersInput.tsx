import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/** Trimmed, non-empty answers -- the rows the user left blank are dropped. */
export function cleanAnswers(answers: string[]): string[] {
  return answers.map((answer) => answer.trim()).filter(Boolean);
}

// One input per accepted answer (any one of them is accepted when typed).
// Enter adds a new row rather than submitting the surrounding form.
export function AnswersInput({
  value,
  onChange,
  required,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  /** Makes the first input required, so a form can't be submitted without an answer. */
  required?: boolean;
}) {
  const { t } = useTranslation("cards");
  const rows = value.length > 0 ? value : [""];
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (focusIndex === null) return;
    inputs.current[focusIndex]?.focus();
    setFocusIndex(null);
  }, [focusIndex]);

  function addRow() {
    onChange([...rows, ""]);
    setFocusIndex(rows.length);
  }

  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wide text-slate-400">{t("answersLabel")}</label>
      {rows.map((answer, index) => (
        <div key={index} className="flex items-center gap-1">
          <input
            ref={(element) => {
              inputs.current[index] = element;
            }}
            value={answer}
            required={required && index === 0}
            onChange={(e) => onChange(rows.map((row, i) => (i === index ? e.target.value : row)))}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (answer.trim()) addRow();
            }}
            placeholder={t("answerInputPlaceholder")}
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              aria-label={t("removeAnswer")}
              className="text-slate-400 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={addRow} className="text-xs text-primary hover:underline">
        {t("addAnswer")}
      </button>
    </div>
  );
}
