import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, Sparkles, X, XCircle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useMatch, useNavigate } from "react-router-dom";

import { getCredential, sendChatMessage, type ChatResponse } from "@/features/assistant/api";
import { listCategories } from "@/features/categories/api";
import { createCard } from "@/features/cards/api";
import { createNode, listFlat, type FlatHierarchyNode } from "@/features/hierarchy/api";
import { linkOcrScan } from "@/features/ocr/api";
import { OcrCaptureButton } from "@/features/ocr/OcrCaptureButton";
import { getErrorMessage } from "@/lib/errors";

type Kind = "card" | "lesson" | "ai";

function withDepth(nodes: FlatHierarchyNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    let depth = 0;
    let cursor = node.parent_id ? byId.get(node.parent_id) : undefined;
    while (cursor && depth < 20) {
      depth += 1;
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
    }
    return { node, depth };
  });
}

// With a categoryId (inside a deck) the dialog is fixed to that deck; without
// one (main page) it lets the user pick the deck.
export function CreateContentFab({ categoryId }: { categoryId?: string }) {
  const { t } = useTranslation("create");
  const [open, setOpen] = useState(false);
  const lessonMatch = useMatch("/categories/:categoryId/lessons/:nodeId");
  const groupMatch = useMatch("/categories/:categoryId/groups/:nodeId");
  const currentNodeId = lessonMatch?.params.nodeId ?? groupMatch?.params.nodeId ?? "";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t("fabLabel")}
        title={t("fabLabel")}
        className="fixed bottom-20 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary-dark"
      >
        <Plus className="h-6 w-6" />
      </button>
      {open && (
        <CreateContentDialog fixedCategoryId={categoryId} currentNodeId={currentNodeId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function CreateContentDialog({
  fixedCategoryId,
  currentNodeId,
  onClose,
}: {
  fixedCategoryId?: string;
  currentNodeId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation(["create", "cards", "common"]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [kind, setKind] = useState<Kind>("card");
  const [deckOverride, setDeckOverride] = useState<string | null>(null);
  const [cardNodeOverride, setCardNodeOverride] = useState<string | null>(null);
  const [lessonParentOverride, setLessonParentOverride] = useState<string | null>(null);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [hint, setHint] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scanIds, setScanIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<ChatResponse | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const { data: decks } = useQuery({
    queryKey: ["categories", "mine"],
    queryFn: () => listCategories("mine"),
    enabled: !fixedCategoryId,
  });

  // A lone deck is preselected so the common single-deck case needs no extra click.
  const categoryId = fixedCategoryId ?? deckOverride ?? (decks?.length === 1 ? decks[0].id : "");

  const { data: flat } = useQuery({
    queryKey: ["hierarchyFlat", categoryId],
    queryFn: () => listFlat(categoryId),
    enabled: !!categoryId,
  });

  const nodes = useMemo(() => withDepth(flat ?? []), [flat]);
  const groups = useMemo(() => nodes.filter(({ node }) => node.node_kind === "group"), [nodes]);

  // When opened from a lesson page a new lesson belongs next to it (its parent);
  // from a group page it belongs inside that group.
  const defaultLessonParent = useMemo(() => {
    const current = flat?.find((node) => node.id === currentNodeId);
    if (!current) return "";
    return current.node_kind === "group" ? current.id : (current.parent_id ?? "");
  }, [flat, currentNodeId]);

  const cardNodeId = cardNodeOverride ?? currentNodeId;
  const lessonParentId = lessonParentOverride ?? defaultLessonParent;

  function changeDeck(nextId: string) {
    setDeckOverride(nextId);
    setCardNodeOverride(null);
    setLessonParentOverride(null);
  }

  function invalidateAll() {
    for (const key of ["cards", "hierarchy", "hierarchyFlat", "hierarchyNode", "progression", "ocrScans"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  async function linkScans(target: { card_id: string } | { lesson_node_id: string }) {
    // Creation already succeeded; a failed provenance link shouldn't fail it.
    await Promise.allSettled(scanIds.map((scanId) => linkOcrScan(scanId, target)));
  }

  const addCard = useMutation({
    mutationFn: async () => {
      const card = await createCard({
        category_id: categoryId,
        lesson_node_id: cardNodeId || null,
        front_text: front,
        back_text: back,
        hint: hint || null,
      });
      await linkScans({ card_id: card.id });
      return card;
    },
    onSuccess: () => {
      invalidateAll();
      setFront("");
      setBack("");
      setHint("");
      setScanIds([]);
      setError(null);
      setNotice(t("create:card.added"));
    },
    onError: (err) => setError(getErrorMessage(err, t("common:errors.generic"))),
  });

  const addLesson = useMutation({
    mutationFn: async () => {
      const node = await createNode({
        category_id: categoryId,
        parent_id: lessonParentId || null,
        node_kind: "lesson",
        title: title.trim(),
        body_markdown: body || undefined,
      });
      await linkScans({ lesson_node_id: node.id });
      return node;
    },
    onSuccess: (node) => {
      invalidateAll();
      onClose();
      navigate(`/categories/${categoryId}/lessons/${node.id}`);
    },
    onError: (err) => setError(getErrorMessage(err, t("common:errors.generic"))),
  });

  const { data: credential } = useQuery({
    queryKey: ["assistant-credential"],
    queryFn: getCredential,
    enabled: kind === "ai",
  });

  // The assistant writes through the same tools as the chat panel, so the
  // destination is passed as text: the chat API only knows the open category.
  const generateWithAi = useMutation({
    mutationFn: () => {
      const destination = flat?.find((node) => node.id === cardNodeId);
      const content = destination
        ? `${aiPrompt.trim()}\n\nAdd the cards to the ${destination.node_kind} "${destination.title}" (id=${destination.id}).`
        : aiPrompt.trim();
      return sendChatMessage({ messages: [{ role: "user", content }], categoryId });
    },
    onSuccess: (response) => {
      invalidateAll();
      setAiResult(response);
      setAiPrompt("");
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err, t("common:errors.generic"))),
  });

  const pending = addCard.isPending || addLesson.isPending || generateWithAi.isPending;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setNotice(null);
    if (kind === "card") addCard.mutate();
    else if (kind === "lesson") addLesson.mutate();
    else {
      setAiResult(null);
      generateWithAi.mutate();
    }
  }

  function switchKind(next: Kind) {
    setKind(next);
    setError(null);
    setNotice(null);
    setAiResult(null);
  }

  const inputClass = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label={t("create:title")}
        className="max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-xl bg-white p-4 shadow-xl sm:rounded-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{t("create:title")}</h2>
          <button type="button" onClick={onClose} aria-label={t("create:close")} className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1">
          {(["card", "lesson", "ai"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => switchKind(option)}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium ${
                kind === option ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {option === "ai" && <Sparkles className="h-3.5 w-3.5" />}
              {t(`create:kind.${option}`)}
            </button>
          ))}
        </div>

        {!fixedCategoryId && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-slate-400">{t("create:deck.label")}</label>
            <select
              required
              value={categoryId}
              onChange={(e) => changeDeck(e.target.value)}
              className={`mt-1 ${inputClass}`}
            >
              <option value="" disabled>
                {t("create:deck.placeholder")}
              </option>
              {decks?.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.icon ?? "📚"} {deck.name}
                </option>
              ))}
            </select>
            {decks?.length === 0 && <p className="mt-1 text-xs text-amber-700">{t("create:deck.none")}</p>}
          </div>
        )}

        {kind === "card" || kind === "ai" ? (
          <>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-400">{t("create:destination.cardLabel")}</label>
              <select
                value={cardNodeId}
                disabled={!categoryId}
                onChange={(e) => setCardNodeOverride(e.target.value)}
                className={`mt-1 ${inputClass}`}
              >
                <option value="">{t("create:destination.none")}</option>
                {nodes.map(({ node, depth }) => (
                  <option key={node.id} value={node.id}>
                    {"  ".repeat(depth)}
                    {node.node_kind === "lesson" ? "📄" : "📁"} {node.title}
                  </option>
                ))}
              </select>
            </div>

            {kind === "ai" ? (
              <>
                {credential && !credential.configured && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    {t("create:ai.notConfigured")}{" "}
                    <Link to="/settings" onClick={onClose} className="font-medium underline">
                      {t("create:ai.goToSettings")}
                    </Link>
                  </p>
                )}
                <textarea
                  autoFocus
                  required
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={4}
                  placeholder={t("create:ai.promptPlaceholder")}
                  className={inputClass}
                />
                {generateWithAi.isPending && <p className="text-xs text-slate-400">{t("create:ai.generating")}</p>}
                {aiResult && (
                  <div className="space-y-2 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                    <p className="whitespace-pre-wrap">{aiResult.message.content}</p>
                    {aiResult.tool_events.length > 0 && (
                      <ul className="space-y-1 border-t border-slate-200 pt-2">
                        {aiResult.tool_events.map((event, index) => (
                          <li key={index} className="flex items-start gap-1.5 text-xs text-slate-600">
                            {event.ok ? (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            ) : (
                              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                            )}
                            <span className="whitespace-pre-wrap">{event.summary}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <OcrCaptureButton
                    onResult={({ text, scanId }) => {
                      setFront(text);
                      setScanIds((prev) => [...prev, scanId]);
                    }}
                  />
                  <textarea
                    autoFocus
                    required
                    value={front}
                    onChange={(e) => setFront(e.target.value)}
                    rows={2}
                    placeholder={t("cards:frontPlaceholder")}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <OcrCaptureButton
                    onResult={({ text, scanId }) => {
                      setBack(text);
                      setScanIds((prev) => [...prev, scanId]);
                    }}
                  />
                  <textarea
                    required
                    value={back}
                    onChange={(e) => setBack(e.target.value)}
                    rows={2}
                    placeholder={t("cards:backPlaceholder")}
                    className={inputClass}
                  />
                </div>
                <input
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder={t("cards:hintPlaceholder")}
                  className={inputClass}
                />
              </>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-400">{t("create:destination.lessonLabel")}</label>
              <select
                value={lessonParentId}
                disabled={!categoryId}
                onChange={(e) => setLessonParentOverride(e.target.value)}
                className={`mt-1 ${inputClass}`}
              >
                <option value="">{t("create:destination.root")}</option>
                {groups.map(({ node, depth }) => (
                  <option key={node.id} value={node.id}>
                    {"  ".repeat(depth)}📁 {node.title}
                  </option>
                ))}
              </select>
            </div>
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("create:lesson.titlePlaceholder")}
              className={inputClass}
            />
            <div className="space-y-1">
              <OcrCaptureButton
                onResult={({ text, scanId }) => {
                  setBody((prev) => (prev ? `${prev}\n\n${text}` : text));
                  setScanIds((prev) => [...prev, scanId]);
                }}
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder={t("create:lesson.bodyPlaceholder")}
                className={`${inputClass} font-mono`}
              />
            </div>
          </>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
        {notice && <p className="text-xs text-emerald-700">{notice}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {kind === "card" ? t("create:card.submit") : kind === "lesson" ? t("create:lesson.submit") : t("create:ai.submit")}
          </button>
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:underline">
            {t("common:actions.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
