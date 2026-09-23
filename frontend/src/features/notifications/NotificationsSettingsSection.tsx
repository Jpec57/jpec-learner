import { useTranslation } from "react-i18next";

import { usePushSubscription } from "@/features/notifications/usePushSubscription";

export function NotificationsSettingsSection() {
  const { t } = useTranslation(["notifications", "common"]);
  const { isSupported, needsInstallHint, isEnabled, loading, error, enable, disable } = usePushSubscription();

  return (
    <div className="mt-6 space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t("notifications:settings.title")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("notifications:settings.description")}</p>
      </div>

      {!isSupported ? (
        <p className="text-sm text-slate-600">{t("notifications:settings.unsupported")}</p>
      ) : needsInstallHint ? (
        <p className="text-sm text-slate-600">{t("notifications:settings.iosHint")}</p>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={() => (isEnabled ? disable() : enable())}
            disabled={loading}
            aria-pressed={isEnabled}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
              isEnabled
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-primary bg-primary text-white hover:bg-primary-dark"
            }`}
          >
            {isEnabled ? t("notifications:settings.enabled") : t("notifications:settings.enable")}
          </button>
          {error && <p className="text-xs text-red-600">{t(`notifications:settings.errors.${error}`)}</p>}
        </div>
      )}
    </div>
  );
}
