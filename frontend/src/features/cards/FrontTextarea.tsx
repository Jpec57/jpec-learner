import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { joinReadings, tokenizeReadings } from "@/lib/furigana";

// The card front. With `allowBlank` (typed cards only -- a blank is something
// you fill in by typing) a button drops a blank ("__") at the cursor, so a
// fill-in-the-blank sentence doesn't depend on knowing the syntax.
export function FrontTextarea({
  value,
  onChange,
  placeholder,
  className,
  required,
  autoFocus,
  allowBlank = false,
  rows = 2,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className: string;
  required?: boolean;
  autoFocus?: boolean;
  allowBlank?: boolean;
  rows?: number;
}) {
  const { t } = useTranslation("cards");
  const ref = useRef<HTMLTextAreaElement>(null);

  function insertBlank() {
    const element = ref.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    onChange(`${value.slice(0, start)}__${value.slice(end)}`);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + 2, start + 2);
    });
  }

  return (
    <>
      <textarea
        ref={ref}
        autoFocus={autoFocus}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      <ReadingFields value={value} onChange={onChange} />
      {allowBlank && (
        <button
          type="button"
          onClick={insertBlank}
          title={t("insertBlankTitle")}
          className="text-xs text-slate-500 hover:text-primary"
        >
          ＿ {t("insertBlank")}
        </button>
      )}
    </>
  );
}

// Shown as soon as the front contains kanji: one input per kanji run, so a
// reading can be typed without knowing the 漢字[かんじ] notation. Each input
// writes that notation back into the front.
export function ReadingFields({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation("cards");
  const tokens = tokenizeReadings(value);
  if (!tokens.some((token) => token.kanji)) return null;

  function setReading(index: number, reading: string) {
    const cleaned = reading.replace(/[[\]]/g, "");
    onChange(joinReadings(tokens.map((token, i) => (i === index ? { ...token, reading: cleaned } : token))));
  }

  return (
    <div className="space-y-1 rounded-md bg-slate-50 p-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{t("furigana.label")}</p>
      <div className="flex flex-wrap gap-2">
        {tokens.map((token, index) =>
          token.kanji ? (
            <label key={index} className="flex items-center gap-1 text-sm text-slate-700">
              <span lang="ja">{token.text}</span>
              <input
                lang="ja"
                value={token.reading ?? ""}
                onChange={(e) => setReading(index, e.target.value)}
                placeholder={t("furigana.placeholder")}
                aria-label={t("furigana.inputLabel", { kanji: token.text })}
                className="w-24 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-sm"
              />
            </label>
          ) : null
        )}
      </div>
    </div>
  );
}
