import { FormEvent, useState } from "react";

import type { NodeKind } from "@/features/hierarchy/api";

export function AddChildForm({
  kind,
  onSubmit,
  onCancel,
}: {
  kind: NodeKind;
  onSubmit: (input: { title: string; body_markdown?: string }) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ title, body_markdown: kind === "lesson" ? body : undefined });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <input
        autoFocus
        required
        placeholder={kind === "group" ? "Group title (e.g. Analysis)" : "Lesson title (e.g. Limits)"}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      {kind === "lesson" && (
        <textarea
          placeholder="Lesson content (Markdown, optional)"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          Add {kind}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
