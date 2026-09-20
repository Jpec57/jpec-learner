import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { CardText } from "@/components/ui/CardText";
import { GapText } from "@/components/ui/GapText";
import { useConfirm } from "@/components/ui/useConfirm";
import { answerLanguageDisplay } from "@/features/cards/answerLanguages";
import { createCard, deleteCard, listCards, updateCard, type AnswerMode, type Card } from "@/features/cards/api";
import { AnswerModeToggle, ReverseCardFields, TypedAnswerFields } from "@/features/cards/AnswerModeFields";
import { cleanAnswers } from "@/features/cards/AnswersInput";
import { FrontTextarea } from "@/features/cards/FrontTextarea";
import {
  answerLanguageForTarget,
  LanguageDirectionFields,
  useLanguageDirection,
} from "@/features/cards/LanguageDirection";
import { TranslateAssist } from "@/features/cards/TranslateAssist";
import { getCategory } from "@/features/categories/api";
import { listFlat } from "@/features/hierarchy/api";
import { ImageUploadInput } from "@/features/images/ImageUploadInput";
import { linkOcrScan } from "@/features/ocr/api";
import { OcrCaptureButton } from "@/features/ocr/OcrCaptureButton";
import { ScannedFromThumbnails } from "@/features/ocr/ScannedFromThumbnails";
import { getReviewState } from "@/features/reviews/api";
import { formatDateTime } from "@/lib/formatDate";
import { hasGap } from "@/lib/gaps";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

export interface CardNodeInfo {
  title: string;
  href: string;
}

export function CardRow({
  card,
  categoryId,
  nodeInfo,
  standalone,
  onDeleted,
}: {
  card: Card;
  categoryId: string;
  nodeInfo?: CardNodeInfo;
  // On the dedicated card page: always expanded, no collapse toggle.
  standalone?: boolean;
  onDeleted?: () => void;
}) {
  const { t, i18n } = useTranslation(["cards", "common"]);
  const { confirm, dialog } = useConfirm();
  const queryClient = useQueryClient();
  // Broad prefix rather than this row's own node id: a card can be edited
  // from a per-node list OR the category-wide search page, whose query key
  // doesn't share the node id, so invalidation must cover both.
  const queryKey = ["cards", categoryId];
  const [expanded, setExpanded] = useState(!!standalone);
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(card.front_text);
  const [back, setBack] = useState(card.back_text);
  const [answerMode, setAnswerMode] = useState<AnswerMode>(card.answer_mode);
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>(card.accepted_answers);
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

  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: () => getCategory(categoryId),
    enabled: editing,
  });

  const save = useMutation({
    mutationFn: () =>
      updateCard(card.id, {
        front_text: front,
        back_text: back,
        answer_mode: answerMode,
        accepted_answers: answerMode === "typed" ? cleanAnswers(acceptedAnswers) : [],
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      onDeleted?.();
    },
  });

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:border-primary/50"
      >
        <span className="flex min-w-0 flex-col">
          <GapText text={card.front_text.split("\n")[0]} inline className="truncate text-sm text-slate-800" />
          {nodeInfo && <span className="mt-0.5 truncate text-xs text-slate-400">{nodeInfo.title}</span>}
        </span>
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
      {!standalone && (
        <button
          onClick={() => setExpanded(false)}
          className="mb-2 flex items-center gap-1 text-xs text-slate-400 hover:text-primary"
        >
          <ChevronUp size={14} /> {t("collapse")}
        </button>
      )}
      {nodeInfo && (
        <p className="mb-2 text-xs text-slate-400">
          <Link to={nodeInfo.href} className="hover:text-primary hover:underline">
            {nodeInfo.title} →
          </Link>
        </p>
      )}
      {reviewState && (
        <p className="mb-2 text-xs text-slate-400">
          {t("levelLabel", { level: reviewState.current_level })} ·{" "}
          {t("nextReviewLabel", { date: formatDateTime(reviewState.due_at, i18n.language) })}
        </p>
      )}
      {editing ? (
        <div className="space-y-2">
          <AnswerModeToggle mode={answerMode} onModeChange={setAnswerMode} />
          <FrontTextarea
            allowBlank={answerMode === "typed"}
            value={front}
            onChange={setFront}
            placeholder={t("front")}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder={answerMode === "typed" ? t("typedBackPlaceholder") : t("back")}
          />
          {answerMode === "typed" && (
            <TypedAnswerFields
              answers={acceptedAnswers}
              onAnswersChange={setAcceptedAnswers}
              language={answerLanguage}
              onLanguageChange={setAnswerLanguage}
              // A language deck's answer language is its target; keep what's stored.
              showLanguage={category?.deck_type !== "language"}
            />
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
            <GapText text={card.front_text} className="text-sm text-slate-800" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{t("back")}</p>
            <CardText text={card.back_text} className="text-sm text-slate-800" />
            {card.answer_mode === "typed" && card.accepted_answers.length > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                {t("acceptedAnswersList", { answers: card.accepted_answers.join(", ") })}
              </p>
            )}
            {card.answer_mode === "typed" && card.answer_language && (
              <p className="mt-1 text-xs text-slate-400">
                {answerLanguageDisplay(card.answer_language).flag} {answerLanguageDisplay(card.answer_language).label}
              </p>
            )}
            {card.hint && (
              <div className="mt-1 text-xs text-slate-400">
                <span aria-hidden>💡 </span>
                <CardText text={card.hint} size="prose-sm" className="inline-block align-top" />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-3">
        <ImageUploadInput
          images={card.images}
          target={{ card_id: card.id }}
          onChange={() => queryClient.invalidateQueries({ queryKey })}
        />
        <ScannedFromThumbnails target={{ card_id: card.id }} />
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
  scanId?: string;
}

function AddCardForm({
  categoryId,
  onSubmit,
}: {
  categoryId: string;
  onSubmit: (input: AddCardInput) => Promise<unknown>;
}) {
  const { t } = useTranslation(["cards", "common"]);
  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: () => getCategory(categoryId),
  });
  const direction = useLanguageDirection(category);
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("reveal");
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>([]);
  const [answerLanguage, setAnswerLanguage] = useState("");
  const [hint, setHint] = useState("");
  const [createReverse, setCreateReverse] = useState(false);
  const [reverseAnswerLanguage, setReverseAnswerLanguage] = useState("");
  const [scanId, setScanId] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const typedAnswers = answerMode === "typed" ? cleanAnswers(acceptedAnswers) : [];
  const hasTypedAnswers = typedAnswers.length > 0;
  // On a language deck a typed card's answers *are* its verso (all of them
  // joined), so there is no separate field for it -- nor for the answer language,
  // which is the deck's target language.
  const languageTyped = direction.enabled && answerMode === "typed";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        front,
        // Elsewhere the details field is optional once answers are listed; the
        // card still needs a back, so fall back to the answers themselves.
        back: !languageTyped && back.trim() ? back : typedAnswers.join(" / "),
        answerMode,
        acceptedAnswers: typedAnswers,
        // A language deck's target fills in the answer language when unset.
        answerLanguage: answerLanguage || (direction.enabled ? answerLanguageForTarget(direction.target) : ""),
        hint,
        createReverse: createReverse && !hasGap(front),
        // A language deck's reverse card is answered in the source language.
        reverseAnswerLanguage: direction.enabled ? direction.source : reverseAnswerLanguage,
        scanId,
      });
      await direction.remember().catch(() => undefined);
      setFront("");
      setBack("");
      setAcceptedAnswers([]);
      setAnswerLanguage("");
      setHint("");
      setCreateReverse(false);
      setReverseAnswerLanguage("");
      setScanId(undefined);
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
      <OcrCaptureButton
        onResult={(result) => {
          setFront(result.text);
          setScanId(result.scanId);
        }}
      />
      {direction.enabled && <LanguageDirectionFields direction={direction} />}
      <AnswerModeToggle mode={answerMode} onModeChange={setAnswerMode} />
      <FrontTextarea
        autoFocus
        required
        allowBlank={answerMode === "typed"}
        value={front}
        onChange={setFront}
        placeholder={t("frontPlaceholder")}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <TranslateAssist
        front={front}
        direction={direction}
        typed={answerMode === "typed"}
        answers={acceptedAnswers}
        onAnswersChange={setAcceptedAnswers}
        onBackChange={setBack}
      />
      {answerMode === "typed" && (
        <TypedAnswerFields
          answers={acceptedAnswers}
          onAnswersChange={setAcceptedAnswers}
          language={answerLanguage}
          onLanguageChange={setAnswerLanguage}
          showLanguage={!direction.enabled}
          requireAnswer={languageTyped}
        />
      )}
      {!languageTyped && (
        <textarea
          required={!hasTypedAnswers}
          value={back}
          onChange={(e) => setBack(e.target.value)}
          rows={2}
          placeholder={answerMode === "typed" ? t("typedBackPlaceholder") : t("backPlaceholder")}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      )}

      <input
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder={t("hintPlaceholder")}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />

      <ReverseCardFields
        front={front}
        mode={answerMode}
        checked={createReverse}
        onCheckedChange={setCreateReverse}
        language={reverseAnswerLanguage}
        onLanguageChange={setReverseAnswerLanguage}
        showLanguage={!direction.enabled}
      />

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
  initialSearch,
}: {
  categoryId: string;
  lessonNodeId: string | null;
  initialSearch?: string;
}) {
  const { t } = useTranslation(["cards", "common"]);
  const queryClient = useQueryClient();
  const baseQueryKey = ["cards", categoryId, lessonNodeId ?? null];
  const [searchInput, setSearchInput] = useState(initialSearch ?? "");
  const [search, setSearch] = useState(initialSearch ?? "");
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
    mutationFn: async (input: AddCardInput) => {
      const card = await createCard({
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
      });
      // The card didn't exist yet when the photo was scanned, so the source
      // photo can only be linked back to it now that we have an id.
      if (input.scanId) await linkOcrScan(input.scanId, { card_id: card.id });
      return card;
    },
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
        <CardRow key={card.id} card={card} categoryId={categoryId} />
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

      <AddCardForm categoryId={categoryId} onSubmit={(input) => addCard.mutateAsync(input)} />
    </div>
  );
}
