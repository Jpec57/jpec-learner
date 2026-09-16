import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { updateCard } from "@/features/cards/api";
import { getErrorMessage } from "@/lib/errors";

export function EditCardForm({
  cardId,
  frontText,
  backText,
  onSaved,
  onCancel,
}: {
  cardId: string;
  frontText: string;
  backText: string;
  onSaved: (patch: { front_text: string; back_text: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["review", "common"]);
  const [front, setFront] = useState(frontText);
  const [back, setBack] = useState(backText);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => updateCard(cardId, { front_text: front, back_text: back }),
    onSuccess: (updated) => onSaved({ front_text: updated.front_text, back_text: updated.back_text }),
    onError: (err) => setError(getErrorMessage(err, t("common:errors.generic"))),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    save.mutate();
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      onSubmit={handleSubmit}
      className="mt-4 space-y-2 rounded-lg border border-primary/30 bg-primary-light/40 p-3"
    >
      <div>
        <label className="text-xs font-medium text-slate-500">{t("editCard.front")}</label>
        <textarea
          value={front}
          onChange={(e) => setFront(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500">{t("editCard.back")}</label>
        <textarea
          value={back}
          onChange={(e) => setBack(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {t("common:actions.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          {t("common:actions.cancel")}
        </button>
      </div>
    </motion.form>
  );
}
