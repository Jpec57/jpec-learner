import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { createCard, deleteCard, listCards, updateCard, type Card } from "@/features/cards/api";
import { ImageUploadInput } from "@/features/images/ImageUploadInput";

function CardRow({ card, categoryId, lessonNodeId }: { card: Card; categoryId: string; lessonNodeId: string | null }) {
  const { t } = useTranslation(["cards", "common"]);
  const queryClient = useQueryClient();
  const queryKey = ["cards", categoryId, lessonNodeId ?? null];
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(card.front_text);
  const [back, setBack] = useState(card.back_text);

  const save = useMutation({
    mutationFn: () => updateCard(card.id, { front_text: front, back_text: back }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const togglePublic = useMutation({
    mutationFn: () => updateCard(card.id, { is_public: !card.is_public }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: () => deleteCard(card.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={front}
            onChange={(e) => setFront(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder={t("front")}
          />
          <textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder={t("back")}
          />
          <div className="flex gap-2">
            <button
              onClick={() => save.mutate()}
              className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
            >
              {t("common:actions.save")}
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:underline">
              {t("common:actions.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{t("front")}</p>
            <p className="text-sm text-slate-800">{card.front_text}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{t("back")}</p>
            <p className="text-sm text-slate-800">{card.back_text}</p>
          </div>
        </div>
      )}

      <div className="mt-3">
        <ImageUploadInput
          images={card.images}
          target={{ card_id: card.id }}
          onChange={() => queryClient.invalidateQueries({ queryKey })}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        {card.is_public && (
          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            {t("common:status.public")}
          </span>
        )}
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-indigo-600">
            {t("common:actions.edit")}
          </button>
        )}
        <button onClick={() => togglePublic.mutate()} className="text-xs text-slate-400 hover:text-indigo-600">
          {card.is_public ? t("makePrivate") : t("makePublic")}
        </button>
        <button
          onClick={() => {
            if (confirm(t("deleteConfirm"))) remove.mutate();
          }}
          className="text-xs text-slate-400 hover:text-red-600"
        >
          {t("common:actions.delete")}
        </button>
      </div>
    </div>
  );
}

function AddCardForm({ onSubmit }: { onSubmit: (input: { front: string; back: string }) => Promise<unknown> }) {
  const { t } = useTranslation(["cards", "common"]);
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ front, back });
      setFront("");
      setBack("");
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-indigo-600 hover:underline">
        {t("addCard")}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
      <textarea
        autoFocus
        required
        value={front}
        onChange={(e) => setFront(e.target.value)}
        rows={2}
        placeholder={t("frontPlaceholder")}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <textarea
        required
        value={back}
        onChange={(e) => setBack(e.target.value)}
        rows={2}
        placeholder={t("backPlaceholder")}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {t("addCardSubmit")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:underline">
          {t("common:actions.cancel")}
        </button>
      </div>
    </form>
  );
}

export function CardListSection({
  categoryId,
  lessonNodeId,
}: {
  categoryId: string;
  lessonNodeId: string | null;
}) {
  const { t } = useTranslation("cards");
  const queryClient = useQueryClient();
  const queryKey = ["cards", categoryId, lessonNodeId ?? null];

  const { data: cards } = useQuery({
    queryKey,
    queryFn: () => listCards({ categoryId, lessonNodeId, owner: "me" }),
  });

  const addCard = useMutation({
    mutationFn: (input: { front: string; back: string }) =>
      createCard({
        category_id: categoryId,
        lesson_node_id: lessonNodeId,
        front_text: input.front,
        back_text: input.back,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <div className="space-y-3">
      {cards?.map((card) => (
        <CardRow key={card.id} card={card} categoryId={categoryId} lessonNodeId={lessonNodeId} />
      ))}
      {cards?.length === 0 && <p className="text-sm text-slate-400">{t("noCards")}</p>}
      <AddCardForm onSubmit={(input) => addCard.mutateAsync(input)} />
    </div>
  );
}
