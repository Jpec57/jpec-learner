import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle, Sparkles, X, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { getCredential, sendChatMessage, type ChatMessage, type ToolEvent } from "@/features/assistant/api";
import { getErrorMessage } from "@/lib/errors";

interface DisplayMessage extends ChatMessage {
  toolEvents?: ToolEvent[];
}

export function AssistantChatPanel({ categoryId }: { categoryId?: string | null }) {
  const { t } = useTranslation(["assistant", "common"]);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: credential } = useQuery({ queryKey: ["assistant-credential"], queryFn: getCredential, enabled: open });

  const chat = useMutation({
    mutationFn: (nextMessages: ChatMessage[]) => sendChatMessage({ messages: nextMessages, categoryId }),
    onSuccess: (response) => {
      setMessages((prev) => [...prev, { ...response.message, toolEvents: response.tool_events }]);
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err, t("common:errors.generic"))),
  });

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || chat.isPending) return;
    const userMessage: DisplayMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    chat.mutate(nextMessages.map(({ role, content }) => ({ role, content })));
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
                  <MessageCircle className="h-4 w-4 text-primary" />
                  {t("assistant:chat.title")}
                </h2>
                <p className="text-xs text-slate-500">{t("assistant:chat.subtitle")}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
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
                <p className="text-sm text-slate-500">{t("assistant:chat.emptyState")}</p>
              )}

              {messages.map((message, index) => (
                <div key={index} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      message.role === "user" ? "bg-primary text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.toolEvents && message.toolEvents.length > 0 && (
                      <ul className="mt-2 space-y-1 border-t border-slate-300/50 pt-2">
                        {message.toolEvents.map((event, eventIndex) => (
                          <li key={eventIndex} className="flex items-start gap-1.5 text-xs text-slate-600">
                            {event.ok ? (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            ) : (
                              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                            )}
                            <span>{event.summary}</span>
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
                placeholder={t("assistant:chat.placeholder")}
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
