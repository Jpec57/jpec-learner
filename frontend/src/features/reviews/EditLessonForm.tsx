import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { updateNode } from "@/features/hierarchy/api";
import { getErrorMessage } from "@/lib/errors";

export function EditLessonForm({
  nodeId,
  title,
  body,
  onSaved,
  onCancel,
}: {
  nodeId: string;
  title: string;
  body: string;
  onSaved: (patch: { title: string; body_markdown: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["review", "common"]);
  const [titleInput, setTitleInput] = useState(title);
  const [bodyInput, setBodyInput] = useState(body);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => updateNode(nodeId, { title: titleInput, body_markdown: bodyInput }),
    onSuccess: (updated) => onSaved({ title: updated.title, body_markdown: updated.body_markdown ?? "" }),
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
        <label className="text-xs font-medium text-slate-500">{t("editLesson.title")}</label>
        <input
          required
          value={titleInput}
          onChange={(e) => setTitleInput(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-500">{t("editLesson.content")}</label>
          <button
            type="button"
            onClick={() => setPreview((value) => !value)}
            className="text-xs text-slate-400 hover:text-primary"
          >
            {preview ? t("editLesson.edit") : t("editLesson.preview")}
          </button>
        </div>
        {preview ? (
          <div className="mt-1 rounded-md border border-slate-300 bg-white p-2">
            {bodyInput.trim() ? (
              <MarkdownContent markdown={bodyInput} />
            ) : (
              <p className="text-sm text-slate-400">{t("editLesson.previewEmpty")}</p>
            )}
          </div>
        ) : (
          <textarea
            value={bodyInput}
            onChange={(e) => setBodyInput(e.target.value)}
            rows={10}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-sm"
          />
        )}
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
