import { useTranslation } from "react-i18next";

const DEFAULT_PICKER_COLOR = "#4f46e5";

export function ThemeColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
}) {
  const { t } = useTranslation("categories");
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value ?? DEFAULT_PICKER_COLOR}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-9 cursor-pointer rounded-md border border-slate-300 p-0.5"
        aria-label={t("themeColor")}
      />
      <span className="text-sm text-slate-500">{t("themeColor")}</span>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="text-xs text-slate-400 hover:text-primary">
          {t("clearTheme")}
        </button>
      )}
    </div>
  );
}
