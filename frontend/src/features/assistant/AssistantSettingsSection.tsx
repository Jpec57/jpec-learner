import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { deleteCredential, getCredential, saveCredential, type LLMProvider } from "@/features/assistant/api";
import { getErrorMessage } from "@/lib/errors";

const PROVIDERS: LLMProvider[] = ["claude", "chatgpt", "gemini"];

export function AssistantSettingsSection() {
  const { t } = useTranslation(["assistant", "common"]);
  const queryClient = useQueryClient();
  const { data: credential } = useQuery({ queryKey: ["assistant-credential"], queryFn: getCredential });

  const [provider, setProvider] = useState<LLMProvider>("claude");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => saveCredential({ provider, api_key: apiKey, model: model.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant-credential"] });
      setApiKey("");
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 1500);
    },
    onError: (err) => setError(getErrorMessage(err, t("common:errors.generic"))),
  });

  const remove = useMutation({
    mutationFn: deleteCredential,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assistant-credential"] }),
  });

  return (
    <div className="mt-6 space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t("assistant:settings.title")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("assistant:settings.description")}</p>
      </div>

      {credential?.configured ? (
        <p className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
          <Check size={16} aria-hidden />
          {t("assistant:settings.configuredAs", {
            provider: t(`assistant:settings.providers.${credential.provider}`),
          })}
        </p>
      ) : (
        <p className="text-sm text-slate-600">{t("assistant:settings.notConfigured")}</p>
      )}

      <div>
        <label className="text-sm font-medium text-slate-700">{t("assistant:settings.provider")}</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {PROVIDERS.map((p) => {
            // Green = this provider already has a working key saved (semantic
            // "success", see DESIGN.md); primary = merely selected for editing.
            const isConfigured = credential?.configured === true && credential.provider === p;
            const isSelected = provider === p;
            const style = isConfigured
              ? `border-emerald-500 bg-emerald-50 font-medium text-emerald-700 ${isSelected ? "ring-2 ring-emerald-200" : ""}`
              : isSelected
                ? "border-primary bg-primary-light text-primary-dark"
                : "border-slate-300 text-slate-600 hover:bg-slate-50";
            return (
              <button
                key={p}
                onClick={() => setProvider(p)}
                aria-pressed={isSelected}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${style}`}
              >
                {isConfigured && <Check size={14} aria-hidden />}
                {t(`assistant:settings.providers.${p}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">{t("assistant:settings.apiKey")}</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t("assistant:settings.apiKeyPlaceholder")}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">{t("assistant:settings.model")}</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={t("assistant:settings.modelPlaceholder")}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => save.mutate()}
          disabled={!apiKey || save.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {t("assistant:settings.save")}
        </button>
        {credential?.configured && (
          <button
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {t("assistant:settings.remove")}
          </button>
        )}
        {saved && <p className="text-xs text-emerald-600">{t("assistant:settings.saved")}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
