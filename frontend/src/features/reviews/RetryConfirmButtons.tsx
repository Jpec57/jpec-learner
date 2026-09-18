import { useTranslation } from "react-i18next";

export function RetryConfirmButtons({
  onOk,
  onNotOk,
  disabled,
}: {
  onOk: () => void;
  onNotOk: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("review");
  return (
    <div className="mt-6">
      <p className="text-xs text-slate-400">{t("retry.hint")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          disabled={disabled}
          onClick={onNotOk}
          className="rounded-lg bg-red-500 px-2 py-3 text-sm font-medium text-white transition hover:bg-red-400 disabled:opacity-50"
        >
          {t("retry.notOk")}
        </button>
        <button
          disabled={disabled}
          onClick={onOk}
          className="rounded-lg bg-emerald-500 px-2 py-3 text-sm font-medium text-white transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {t("retry.ok")}
        </button>
      </div>
    </div>
  );
}
