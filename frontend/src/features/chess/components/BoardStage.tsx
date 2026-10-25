// Fullscreen "focus mode" for the chess board.
//
// The same wrapper renders in both modes (only its classes change), so the
// board inside never remounts when toggling. In fullscreen the side panels are
// hidden and the latest coach message is shown in a panel instead: beside the
// board on wide screens, below it on tall ones (phones), so it never covers
// the pieces.
import { motion } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { BOARD_MAX_WIDTH } from "@/features/chess/components/BoardWithEval";

export type OverlayTone = "info" | "success" | "warning" | "error";

export interface OverlayAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface OverlayMessage {
  id: string; // a new id re-shows the message
  tone: OverlayTone;
  title: string;
  body?: ReactNode;
  actions?: OverlayAction[];
}

const TONE_STYLE: Record<OverlayTone, string> = {
  info: "border-slate-200 bg-white/95 text-slate-800",
  success: "border-emerald-300 bg-emerald-50/95 text-emerald-900",
  warning: "border-amber-300 bg-amber-50/95 text-amber-900",
  error: "border-red-300 bg-red-50/95 text-red-900",
};

/** Fullscreen toggle. Uses the browser Fullscreen API when available, with a CSS fallback (iOS). */
export function useFullscreen() {
  const [active, setActive] = useState(false);

  const exit = useCallback(() => {
    setActive(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  const enter = useCallback(() => {
    setActive(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const toggle = useCallback(() => (active ? exit() : enter()), [active, enter, exit]);

  useEffect(() => {
    // Leaving native fullscreen (Esc, swipe) also leaves focus mode.
    const onChange = () => {
      if (!document.fullscreenElement) setActive(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);

  // Leaving the page while in fullscreen.
  useEffect(() => () => void (document.fullscreenElement && document.exitFullscreen().catch(() => {})), []);

  return { active, toggle, exit };
}

/** Single-key shortcuts (no modifiers), ignored while typing in a field. */
export function useChessShortcuts(shortcuts: Record<string, (() => void) | undefined>) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const handler = ref.current[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (handler) {
        event.preventDefault();
        handler();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function OverlayCard({ message }: { message: OverlayMessage }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`rounded-lg border p-3 text-sm shadow-lg ${TONE_STYLE[message.tone]}`}
    >
      <p className="font-semibold">{message.title}</p>
      {message.body && <div className="mt-1 opacity-90">{message.body}</div>}
      {message.actions && message.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {message.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={
                action.primary
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
                  : "rounded-md border border-current/20 bg-white/60 px-3 py-1.5 text-sm font-medium hover:bg-white"
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export interface ToolbarButton {
  label: string;
  shortcut?: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface BoardStageProps {
  fullscreen: boolean;
  onExit: () => void;
  toolbar: ToolbarButton[];
  overlay: OverlayMessage | null;
  /** A small persistent status (e.g. "Stockfish is thinking…"), fullscreen only. */
  pill?: string | null;
  board: ReactNode;
  /** Shown under the board outside fullscreen. */
  footer?: ReactNode;
}


export function BoardStage({ fullscreen, onExit, toolbar, overlay, pill, board, footer }: BoardStageProps) {
  const { t } = useTranslation("chess");
  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col items-center gap-3 overflow-hidden bg-slate-900 px-3 py-3"
          : "mx-auto"
      }
      style={fullscreen ? undefined : { maxWidth: BOARD_MAX_WIDTH }}
    >
      {fullscreen && (
        <div className="flex w-full max-w-5xl items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {toolbar.map((button) => (
              <button
                key={button.label}
                type="button"
                onClick={button.onClick}
                disabled={button.disabled}
                title={button.shortcut ? `${button.label} (${button.shortcut})` : button.label}
                className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-sm text-slate-100 hover:bg-white/20 disabled:opacity-40"
              >
                {button.icon}
                <span className="hidden sm:inline">{button.label}</span>
                {button.shortcut && (
                  <kbd className="hidden rounded bg-white/15 px-1 text-[10px] text-slate-300 md:inline">{button.shortcut}</kbd>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onExit}
            title={`${t("focus.exit")} (Esc)`}
            className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-sm text-slate-100 hover:bg-white/20"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">{t("focus.exit")}</span>
          </button>
        </div>
      )}

      {/* Fullscreen layout (class names must stay literal for Tailwind):
          - tall screens: board on top, as wide as possible while leaving at least ~9rem for the message panel below;
          - wide screens (aspect ≥ 4/3): board as tall as possible, message panel in a column beside it. */}
      <div
        className={
          fullscreen
            ? "flex min-h-0 w-full flex-1 flex-col items-center gap-3 [@media(min-aspect-ratio:4/3)]:flex-row [@media(min-aspect-ratio:4/3)]:items-start [@media(min-aspect-ratio:4/3)]:justify-center [@media(min-aspect-ratio:4/3)]:gap-4"
            : ""
        }
      >
        <div
          className={
            fullscreen
              ? "relative w-full shrink-0 max-w-[min(calc(100vw_-_1.5rem),calc(100dvh_-_14.5rem))] [@media(min-aspect-ratio:4/3)]:max-w-[min(calc(100vw_-_23rem),calc(100dvh_-_5.5rem))]"
              : "relative w-full"
          }
        >
          {board}
          {fullscreen && pill && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-slate-900/80 px-3 py-1 text-xs text-white shadow">
              {pill}
            </div>
          )}
        </div>
        {fullscreen && (
          <div
            aria-live="polite"
            className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] max-w-[min(calc(100vw_-_1.5rem),calc(100dvh_-_14.5rem))] [@media(min-aspect-ratio:4/3)]:w-80 [@media(min-aspect-ratio:4/3)]:max-h-full [@media(min-aspect-ratio:4/3)]:max-w-none [@media(min-aspect-ratio:4/3)]:flex-none"
          >
            {overlay ? (
              <OverlayCard key={overlay.id} message={overlay} />
            ) : (
              <p className="rounded-lg border border-dashed border-white/15 p-3 text-center text-sm text-slate-400">{t("focus.noComment")}</p>
            )}
          </div>
        )}
      </div>

      {!fullscreen && footer}
    </div>
  );
}

export function FullscreenButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("chess");
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${t("focus.enter")} (F)`}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-primary"
    >
      <Maximize2 className="h-4 w-4" />
      <span className="sr-only sm:not-sr-only">{t("focus.enter")}</span>
    </button>
  );
}
