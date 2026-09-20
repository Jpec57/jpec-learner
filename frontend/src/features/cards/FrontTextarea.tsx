import { useRef } from "react";
import { useTranslation } from "react-i18next";

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
