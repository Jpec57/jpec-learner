import { ANSWER_LANGUAGE_OPTIONS } from "@/features/cards/answerLanguages";

export function LanguageSelect({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-600"
    >
      <option value="">{placeholder}</option>
      {ANSWER_LANGUAGE_OPTIONS.map((option) => (
        <option key={option.code} value={option.code}>
          {option.flag} {option.label}
        </option>
      ))}
    </select>
  );
}
