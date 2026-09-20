import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, GraduationCap, MessageCircle, Sparkles, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { MarkdownContent } from "@/components/ui/MarkdownContent";
import {
  getCredential,
  sendChatMessage,
  type ChatMessage,
  type ChatMode,
  type ToolEvent,
  type ToolRef,
} from "@/features/assistant/api";
import { onOpenCoach } from "@/features/assistant/coachBus";
import { toolRefHref } from "@/features/assistant/toolRefs";
import { getErrorMessage } from "@/lib/errors";

interface DisplayMessage extends ChatMessage {
  toolEvents?: ToolEvent[];
}

const MODES: ChatMode[] = ["builder", "coach"];

const REF_ICONS: Record<ToolRef["kind"], string> = { category: "📚", group: "📁", lesson: "📖", card: "🃏" };

// With links listed below, the first summary line is enough as a heading; the
// "(id=…)" the model needs for follow-up calls is noise for the reader.
function summaryHeading(summary: string): string {
  return summary.split("\n")[0].replace(/\s*\(id=[^)]*\)/, "");
}

export function AssistantChatPanel({ categoryId }: { categoryId?: string | null }) {
  const { t } = useTranslation(["assistant", "common"]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("builder");
  // One conversation per persona: the coach and the builder have different
  // system prompts, so mixing their histories would confuse both.
  const [histories, setHistories] = useState<Record<ChatMode, DisplayMessage[]>>({ builder: [], coach: [] });
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const messages = histories[mode];

  const { data: credential } = useQuery({ queryKey: ["assistant-credential"], queryFn: getCredential, enabled: open });

  const chat = useMutation({
    mutationFn: (vars: { mode: ChatMode; messages: ChatMessage[] }) =>
      sendChatMessage({ messages: vars.messages, categoryId, mode: vars.mode }),
    onSuccess: (response, vars) => {
      setHistories((prev) => ({
        ...prev,
        [vars.mode]: [...prev[vars.mode], { ...response.message, toolEvents: response.tool_events }],
      }));
      setError(null);
      // Tools may have created cards or rewritten the plan; refresh whatever shows them.
      if (response.tool_events.some((event) => event.ok)) queryClient.invalidateQueries();
    },
    onError: (err) => setError(getErrorMessage(err, t("common:errors.generic"))),
  });

  const historiesRef = useRef(histories);
  historiesRef.current = histories;
  const pendingRef = useRef(false);
  pendingRef.current = chat.isPending;

  function send(text: string, forMode: ChatMode) {
    const trimmed = text.trim();
    if (!trimmed || pendingRef.current) return;
    const next: DisplayMessage[] = [...historiesRef.current[forMode], { role: "user", content: trimmed }];
    setHistories((prev) => ({ ...prev, [forMode]: next }));
    setInput("");
    chat.mutate({ mode: forMode, messages: next.map(({ role, content }) => ({ role, content })) });
  }

  const sendRef = useRef(send);
  sendRef.current = send;

  // "Ask the coach" buttons elsewhere (the plan section) open this panel in
  // coach mode, optionally with a ready-made first message.
  useEffect(
    () =>
      onOpenCoach((prompt) => {
        setMode("coach");
        setOpen(true);
        if (prompt) sendRef.current(prompt, "coach");
      }),
    []
  );

  function handleSend() {
    send(input, mode);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-primary-dark"
      >
        <Sparkles className="h-4 w-4" />
        {t("assistant:chat.openButton")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={() => setOpen(false)}>
          <div
            className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                  {mode === "coach" ? (
                    <GraduationCap className="h-4 w-4 text-primary" />
                  ) : (
                    <MessageCircle className="h-4 w-4 text-primary" />
                  )}
                  {t(mode === "coach" ? "assistant:coach.title" : "assistant:chat.title")}
                </h2>
                <p className="text-xs text-slate-500">
                  {t(mode === "coach" ? "assistant:coach.subtitle" : "assistant:chat.subtitle")}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div role="tablist" className="flex gap-1 border-b border-slate-200 px-4 py-2">
              {MODES.map((value) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => {
                    setMode(value);
                    setError(null);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    mode === value ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t(`assistant:modes.${value}`)}
                </button>
              ))}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {credential && !credential.configured && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {t("assistant:chat.notConfigured")}{" "}
                  <Link to="/settings" className="font-medium underline" onClick={() => setOpen(false)}>
                    {t("assistant:chat.goToSettings")}
                  </Link>
                </div>
              )}

              {messages.length === 0 && (
                <p className="text-sm text-slate-500">
                  {t(mode === "coach" ? "assistant:coach.emptyState" : "assistant:chat.emptyState")}
                </p>
              )}
              {messages.length === 0 && mode === "coach" && (
                <div className="flex flex-wrap gap-2">
                  {(["assess", "weakest"] as const).map((key) => (
                    <button
                      key={key}
                      onClick={() => send(t(`assistant:coach.prompts.${key}`), "coach")}
                      disabled={chat.isPending}
                      className="rounded-full border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
                    >
                      {t(`assistant:coach.prompts.${key}`)}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((message, index) => (
                <div key={index} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      message.role === "user" ? "bg-primary text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <MarkdownContent markdown={message.content} />
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                    {message.toolEvents && message.toolEvents.length > 0 && (
                      <ul className="mt-2 space-y-1 border-t border-slate-300/50 pt-2">
                        {message.toolEvents.map((event, eventIndex) => (
                          <li key={eventIndex} className="flex items-start gap-1.5 text-xs text-slate-600">
                            {event.ok ? (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            ) : (
                              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                            )}
                            <div className="min-w-0">
                              <span>{event.refs?.length ? summaryHeading(event.summary) : event.summary}</span>
                              {event.refs && event.refs.length > 0 && (
                                <ul className="mt-1 space-y-0.5">
                                  {event.refs.map((ref) => (
                                    <li key={`${ref.kind}-${ref.id}`} className="flex items-center gap-1">
                                      <span aria-hidden>{REF_ICONS[ref.kind]}</span>
                                      <a
                                        href={toolRefHref(ref)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={t(`assistant:chat.refKinds.${ref.kind}`)}
                                        className="min-w-0 truncate font-medium text-primary hover:underline"
                                      >
                                        {ref.kind === "card" ? (
                                          <MarkdownContent markdown={ref.label} inline />
                                        ) : (
                                          ref.label
                                        )}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}

              {chat.isPending && <p className="text-sm text-slate-400">{t("assistant:chat.thinking")}</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex gap-2 border-t border-slate-200 p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={t(mode === "coach" ? "assistant:coach.placeholder" : "assistant:chat.placeholder")}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || chat.isPending}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {t("assistant:chat.send")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
