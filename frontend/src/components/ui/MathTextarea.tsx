import { useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  expandShortcut,
  insertSnippet,
  STRUCTURE_BUTTONS,
  SYMBOL_BUTTONS,
  type MathButton,
  type TextEdit,
} from "@/lib/mathShortcuts";

// A markdown textarea for scientific decks: a LaTeX toolbar, "$" helpers and
// inline shortcuts (type "alpha " or "-> " inside $...$). Rendering itself is
// unchanged -- all card/lesson text is already markdown + KaTeX.
export function MathTextarea({
  value,
  onChange,
  rows = 8,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const ref = useRef<HTMLTextAreaElement>(null);

  function apply(edit: TextEdit) {
    onChange(edit.value);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  }

  function insert(button: MathButton) {
    const element = ref.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    apply(insertSnippet(value, start, end, button.snippet, { bare: button.bare }));
  }

  function handleChange(next: string, caret: number) {
    const expanded = expandShortcut(next, caret);
    if (expanded) apply(expanded);
    else onChange(next);
  }

  const buttonClass =
    "min-w-[1.75rem] rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 hover:border-primary hover:text-primary";

  return (
    <div className="space-y-1">
      <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-1.5">
        <div className="flex flex-wrap gap-1">
          {STRUCTURE_BUTTONS.map((button) => (
            <button
              key={button.label}
              type="button"
              title={button.snippet.replace("|", "▢")}
              // Keep the textarea's focus and selection while clicking.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(button)}
              className={buttonClass}
            >
              {button.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {SYMBOL_BUTTONS.map((button) => (
            <button
              key={button.snippet}
              type="button"
              title={button.snippet}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(button)}
              className={buttonClass}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value, e.target.selectionStart)}
        onKeyDown={(e) => {
          // Ctrl/Cmd+M: inline math around the selection.
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
            e.preventDefault();
            insert({ label: "", snippet: "$|$", bare: true });
          }
        }}
        className={`${className} font-mono`}
      />
      <p className="text-xs text-slate-400">{t("math.hint")}</p>
    </div>
  );
}
