import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useConfirm } from "@/components/ui/useConfirm";
import { ANSWER_LANGUAGE_OPTIONS, answerLanguageDisplay } from "@/features/cards/answerLanguages";
import { createCard, deleteCard, listCards, updateCard, type AnswerMode, type Card } from "@/features/cards/api";
import { listFlat } from "@/features/hierarchy/api";
import { ImageUploadInput } from "@/features/images/ImageUploadInput";
import { getReviewState } from "@/features/reviews/api";
import { formatDateTime } from "@/lib/formatDate";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

function parseAcceptedAnswers(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((answer) => answer.trim())
    .filter(Boolean);
}

function LanguageSelect({
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

function CardRow({ card, categoryId, lessonNodeId }: { card: Card; categoryId: string; lessonNodeId: string | null }) {
  const { t, i18n } = useTranslation(["cards", "common"]);
  const { confirm, dialog } = useConfirm();
  const queryClient = useQueryClient();
  const queryKey = ["cards", categoryId, lessonNodeId ?? null];
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(card.front_text);
  const [back, setBack] = useState(card.back_text);
  const [answerMode, setAnswerMode] = useState<AnswerMode>(card.answer_mode);
  const [acceptedAnswersInput, setAcceptedAnswersInput] = useState(card.accepted_answers.join(", "));
  const [answerLanguage, setAnswerLanguage] = useState(card.answer_language ?? "");
  const [hint, setHint] = useState(card.hint ?? "");
  const [moveToNodeId, setMoveToNodeId] = useState(card.lesson_node_id ?? "");

  const { data: reviewState } = useQuery({
    queryKey: ["reviewState", card.id],
    queryFn: () => getReviewState({ card_id: card.id }),
    enabled: expanded,
  });

  const { data: flatNodes } = useQuery({
    queryKey: ["hierarchyFlat", categoryId],
    queryFn: () => listFlat(categoryId),
    enabled: editing,
  });

  const save = useMutation({
    mutationFn: () =>
      updateCard(card.id, {
        front_text: front,
        back_text: back,
        answer_mode: answerMode,
        accepted_answers: answerMode === "typed" ? parseAcceptedAnswers(acceptedAnswersInput) : [],
        answer_language: answerMode === "typed" ? answerLanguage || null : null,
        hint: hint || null,
        lesson_node_id: moveToNodeId,
      }),
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

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:border-primary/50"
      >
        <span className="truncate text-sm text-slate-800">{card.front_text}</span>
        <span className="ml-3 flex shrink-0 items-center gap-2">
          {card.answer_mode === "typed" && (
            <span className="rounded-full bg-accent-light px-1.5 py-0.5 text-[10px] font-medium text-accent-dark">
              {t("typedBadge")}
            </span>
          )}
          {card.is_public && (
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              {t("common:status.public")}
            </span>
          )}
          <ChevronDown size={16} className="text-slate-400" />
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <button
        onClick={() => setExpanded(false)}
        className="mb-2 flex items-center gap-1 text-xs text-slate-400 hover:text-primary"
      >
        <ChevronUp size={14} /> {t("collapse")}
      </button>
      {reviewState && (
        <p className="mb-2 text-xs text-slate-400">
          {t("levelLabel", { level: reviewState.current_level })} ·{" "}
          {t("nextReviewLabel", { date: formatDateTime(reviewState.due_at, i18n.language) })}
        </p>
      )}
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
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setAnswerMode("reveal")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                answerMode === "reveal" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {t("answerMode.reveal")}
            </button>
            <button
              type="button"
              onClick={() => setAnswerMode("typed")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                answerMode === "typed" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {t("answerMode.typed")}
            </button>
          </div>
          {answerMode === "typed" && (
            <>
              <textarea
                value={acceptedAnswersInput}
                onChange={(e) => setAcceptedAnswersInput(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                placeholder={t("acceptedAnswersPlaceholder")}
              />
              <LanguageSelect
                value={answerLanguage}
                onChange={setAnswerLanguage}
                placeholder={t("answerLanguagePlaceholder")}
              />
            </>
          )}
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder={t("hintPlaceholder")}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <div>
            <label className="text-[10px] uppercase tracking-wide text-slate-400">{t("moveToNode")}</label>
            <select
              value={moveToNodeId}
              onChange={(e) => setMoveToNodeId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {flatNodes?.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.node_kind === "lesson" ? "📄" : "📁"} {node.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => save.mutate()}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-dark"
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
            {card.answer_mode === "typed" && card.accepted_answers.length > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                {t("alsoAccepts", { answers: card.accepted_answers.join(", ") })}
              </p>
            )}
            {card.answer_mode === "typed" && card.answer_language && (
              <p className="mt-1 text-xs text-slate-400">
                {answerLanguageDisplay(card.answer_language).flag} {answerLanguageDisplay(card.answer_language).label}
              </p>
            )}
            {card.hint && <p className="mt-1 text-xs text-slate-400">💡 {card.hint}</p>}
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
          <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-primary">
            {t("common:actions.edit")}
          </button>
        )}
        <button onClick={() => togglePublic.mutate()} className="text-xs text-slate-400 hover:text-primary">
          {card.is_public ? t("makePrivate") : t("makePublic")}
        </button>
        <button
          onClick={async () => {
            if (await confirm(t("common:actions.delete"), t("deleteConfirm"))) remove.mutate();
          }}
          className="text-xs text-slate-400 hover:text-red-600"
        >
          {t("common:actions.delete")}
        </button>
      </div>
      {dialog}
    </div>
  );
}

interface AddCardInput {
  front: string;
  back: string;
  answerMode: AnswerMode;
  acceptedAnswers: string[];
  answerLanguage: string;
  hint: string;
  createReverse: boolean;
  reverseAnswerLanguage: string;
}

function AddCardForm({ onSubmit }: { onSubmit: (input: AddCardInput) => Promise<unknown> }) {
  const { t } = useTranslation(["cards", "common"]);
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("reveal");
  const [acceptedAnswersInput, setAcceptedAnswersInput] = useState("");
  const [answerLanguage, setAnswerLanguage] = useState("");
  const [hint, setHint] = useState("");
  const [createReverse, setCreateReverse] = useState(false);
  const [reverseAnswerLanguage, setReverseAnswerLanguage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        front,
        back,
        answerMode,
        acceptedAnswers: answerMode === "typed" ? parseAcceptedAnswers(acceptedAnswersInput) : [],
        answerLanguage,
        hint,
        createReverse,
        reverseAnswerLanguage,
      });
      setFront("");
      setBack("");
      setAcceptedAnswersInput("");
      setAnswerLanguage("");
      setHint("");
      setCreateReverse(false);
      setReverseAnswerLanguage("");
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-primary hover:underline">
        {t("addCard")}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-primary/30 bg-primary-light/30 p-3">
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

      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setAnswerMode("reveal")}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            answerMode === "reveal" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          {t("answerMode.reveal")}
        </button>
        <button
          type="button"
          onClick={() => setAnswerMode("typed")}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            answerMode === "typed" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          {t("answerMode.typed")}
        </button>
      </div>

      {answerMode === "typed" && (
        <>
          <textarea
            value={acceptedAnswersInput}
            onChange={(e) => setAcceptedAnswersInput(e.target.value)}
            rows={2}
            placeholder={t("acceptedAnswersPlaceholder")}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <LanguageSelect
            value={answerLanguage}
            onChange={setAnswerLanguage}
            placeholder={t("answerLanguagePlaceholder")}
          />
        </>
      )}

      <input
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder={t("hintPlaceholder")}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={createReverse} onChange={(e) => setCreateReverse(e.target.checked)} />
        {t("createReverse")}
      </label>

      {answerMode === "typed" && createReverse && (
        <LanguageSelect
          value={reverseAnswerLanguage}
          onChange={setReverseAnswerLanguage}
          placeholder={t("reverseAnswerLanguagePlaceholder")}
        />
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-60"
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
  const { t } = useTranslation(["cards", "common"]);
  const queryClient = useQueryClient();
  const baseQueryKey = ["cards", categoryId, lessonNodeId ?? null];
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const { data } = useQuery({
    queryKey: [...baseQueryKey, search, page],
    queryFn: () =>
      listCards({ categoryId, lessonNodeId, owner: "me", search, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const cards = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min(total, page * PAGE_SIZE + PAGE_SIZE);

  const addCard = useMutation({
    mutationFn: (input: AddCardInput) =>
      createCard({
        category_id: categoryId,
        lesson_node_id: lessonNodeId,
        front_text: input.front,
        back_text: input.back,
        answer_mode: input.answerMode,
        accepted_answers: input.acceptedAnswers,
        answer_language: input.answerMode === "typed" ? input.answerLanguage || null : null,
        hint: input.hint || null,
        create_reverse: input.createReverse,
        reverse_answer_language:
          input.answerMode === "typed" && input.createReverse ? input.reverseAnswerLanguage || null : null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: baseQueryKey }),
  });

  return (
    <div className="space-y-3">
      <input
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />

      {cards.map((card) => (
        <CardRow key={card.id} card={card} categoryId={categoryId} lessonNodeId={lessonNodeId} />
      ))}
      {total === 0 && <p className="text-sm text-slate-400">{search ? t("noSearchResults") : t("noCards")}</p>}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{t("pageRange", { start: pageStart, end: pageEnd, total })}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-md px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
            >
              {t("common:pagination.previous")}
            </button>
            <button
              onClick={() => setPage((p) => (pageEnd < total ? p + 1 : p))}
              disabled={pageEnd >= total}
              className="rounded-md px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
            >
              {t("common:pagination.next")}
            </button>
          </div>
        </div>
      )}

      <AddCardForm onSubmit={(input) => addCard.mutateAsync(input)} />
    </div>
  );
}
