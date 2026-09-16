import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { me, updateMe } from "@/features/auth/api";

export function SettingsPage() {
  const { t, i18n } = useTranslation(["auth", "common"]);
  const queryClient = useQueryClient();
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: me });
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [saved, setSaved] = useState(false);

  const update = useMutation({
    mutationFn: (input: { display_name?: string; locale?: string }) => updateMe(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← {t("common:nav.allCategories")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{t("auth:settings.title")}</h1>

        <div className="mt-6 space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label className="text-sm font-medium text-slate-700">{t("auth:settings.language")}</label>
            <div className="mt-2 flex gap-2">
              {(["fr", "en"] as const).map((locale) => (
                <button
                  key={locale}
                  onClick={() => {
                    i18n.changeLanguage(locale);
                    update.mutate({ locale });
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    i18n.language === locale
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {locale === "fr" ? "Français" : "English"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">{t("auth:settings.displayName")}</label>
            <div className="mt-2 flex gap-2">
              <input
                value={displayName || user?.display_name || ""}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
              <button
                onClick={() => update.mutate({ display_name: displayName })}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                {t("common:actions.save")}
              </button>
            </div>
          </div>

          {saved && <p className="text-xs text-emerald-600">{t("auth:settings.saved")}</p>}
        </div>
      </div>
    </div>
  );
}
