import { Chess } from "chess.js";
import { ArrowLeft, Eye, FlipVertical2, Lightbulb, RotateCcw, Flag } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { reviewMove, uciLineToSan, uciToMove, type MoveReview } from "@/features/chess/coach";
import {
  BoardStage,
  FullscreenButton,
  useChessShortcuts,
  useFullscreen,
  type OverlayMessage,
  type ToolbarButton,
} from "@/features/chess/components/BoardStage";
import { ARROW_COLORS, BoardWithEval, type BoardArrow } from "@/features/chess/components/BoardWithEval";
import { CoachPanel, useNoteText } from "@/features/chess/components/CoachPanel";
import { MoveList } from "@/features/chess/components/MoveList";
import { useAnalysisService, useEngineFailed, useLiveAnalysis, useOpponentEngine } from "@/features/chess/engine/hooks";
import type { StrengthOptions } from "@/features/chess/engine/stockfish";
import { scoreFor, type Color, type MoveQuality } from "@/features/chess/evaluation";

const START_FEN = new Chess().fen();

interface Level {
  strength: StrengthOptions;
  depth?: number;
  movetime?: number;
}

const LEVELS: Record<number, Level> = {
  1: { strength: { skill: 0 }, depth: 1 },
  2: { strength: { skill: 3 }, depth: 3 },
  3: { strength: { skill: 6 }, depth: 5 },
  4: { strength: { skill: 10 }, depth: 8 },
  5: { strength: { elo: 1600 }, movetime: 500 },
  6: { strength: { elo: 1900 }, movetime: 700 },
  7: { strength: { elo: 2300 }, movetime: 1000 },
  8: { strength: { skill: 20 }, movetime: 1500 },
};

interface PlayedMove {
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  by: Color;
}

interface GameSetup {
  color: Color;
  level: number;
  startFen: string;
}

const LEVEL_KEY = "jpeclearner.chess.level";
const AI_KEY = "jpeclearner.chess.allowAi";

function savedAllowAi(): boolean {
  try {
    return window.localStorage.getItem(AI_KEY) === "1";
  } catch {
    return false;
  }
}

function savedLevel(): number {
  try {
    const value = Number(window.localStorage.getItem(LEVEL_KEY));
    return value >= 1 && value <= 8 ? value : 3;
  } catch {
    return 3;
  }
}

const reviewKey = (move: PlayedMove) => `${move.fenBefore}|${move.uci}`;

export function ChessPlayPage() {
  const { t } = useTranslation("chess");
  const location = useLocation();
  const fromCourse = (location.state ?? null) as { fen?: string; color?: Color } | null;

  const service = useAnalysisService(14);
  const opponent = useOpponentEngine();
  const engineFailed = useEngineFailed(service?.engine, opponent);
  const [allowAi, setAllowAi] = useState(savedAllowAi);

  const [pickColor, setPickColor] = useState<Color | "random">(fromCourse?.color ?? "w");
  const [pickLevel, setPickLevel] = useState(savedLevel);
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const [moves, setMoves] = useState<PlayedMove[]>([]);
  const [reviews, setReviews] = useState<Record<string, MoveReview>>({});
  const [pendingReviews, setPendingReviews] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [resigned, setResigned] = useState(false);
  const [viewingBest, setViewingBest] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [orientation, setOrientation] = useState<"white" | "black">(fromCourse?.color === "b" ? "black" : "white");

  // Bumped on new game / take back so late async results from the old timeline are ignored.
  const tokenRef = useRef(0);
  const movesRef = useRef(moves);
  movesRef.current = moves;

  const startFen = setup?.startFen ?? fromCourse?.fen ?? START_FEN;
  const currentFen = moves.length > 0 ? moves[moves.length - 1].fenAfter : startFen;
  const chess = useMemo(() => new Chess(currentFen), [currentFen]);
  const turn = chess.turn();
  const gameOver = chess.isGameOver() || resigned;

  const lastPlayerMove = setup ? [...moves].reverse().find((move) => move.by === setup.color) : undefined;
  const latestReview = lastPlayerMove ? reviews[reviewKey(lastPlayerMove)] ?? null : null;

  const displayedFen = viewingBest && latestReview ? latestReview.fenBefore : currentFen;
  const live = useLiveAnalysis(service, displayedFen);
  const liveTurn = displayedFen.split(" ")[1] as Color;
  const liveScore = live?.lines[0] ? scoreFor(live.lines[0].score, liveTurn, "w") : null;

  const requestOpponentMove = useCallback(
    async (fen: string, game: GameSetup) => {
      if (!opponent) return;
      const token = tokenRef.current;
      const level = LEVELS[game.level];
      setThinking(true);
      opponent.setStrength(level.strength);
      const [result] = await Promise.all([
        opponent.analyze(fen, { depth: level.depth, movetime: level.movetime }),
        new Promise((resolve) => setTimeout(resolve, 450)), // a beat so the reply doesn't feel instant
      ]);
      if (token !== tokenRef.current) return;
      setThinking(false);
      if (result.cancelled || !result.bestMove) return;
      const board = new Chess(fen);
      const move = board.move(uciToMove(result.bestMove));
      setMoves((prev) => [...prev, { san: move.san, uci: result.bestMove!, fenBefore: fen, fenAfter: board.fen(), by: board.turn() === "w" ? "b" : "w" }]);
    },
    [opponent]
  );

  const reviewPlayerMove = useCallback(
    (move: PlayedMove) => {
      if (!service) return;
      const before = service.acquire(move.fenBefore);
      const after = service.acquire(move.fenAfter);
      setPendingReviews((count) => count + 1);
      void Promise.all([before.promise, after.promise]).then(([beforeResult, afterResult]) => {
        before.release();
        after.release();
        setPendingReviews((count) => Math.max(0, count - 1));
        const review = reviewMove(beforeResult, afterResult, move.uci);
        setReviews((prev) => ({ ...prev, [reviewKey(move)]: review }));
      });
    },
    [service]
  );

  function startGame() {
    const color: Color = pickColor === "random" ? (Math.random() < 0.5 ? "w" : "b") : pickColor;
    const game: GameSetup = { color, level: pickLevel, startFen: fromCourse?.fen ?? START_FEN };
    try {
      window.localStorage.setItem(LEVEL_KEY, String(pickLevel));
    } catch {
      // ignore
    }
    tokenRef.current += 1;
    opponent?.cancelAll();
    service?.reset();
    setSetup(game);
    setMoves([]);
    setReviews({});
    setPendingReviews(0);
    setResigned(false);
    setViewingBest(false);
    setShowHint(false);
    setThinking(false);
    setOrientation(color === "w" ? "white" : "black");
    if (new Chess(game.startFen).turn() !== color) void requestOpponentMove(game.startFen, game);
  }

  function handleMove({ from, to, promotion }: { from: string; to: string; promotion?: string }): boolean {
    if (!setup || gameOver || thinking || viewingBest) return false;
    const board = new Chess(currentFen);
    let move;
    try {
      move = board.move({ from, to, promotion });
    } catch {
      return false;
    }
    const played: PlayedMove = {
      san: move.san,
      uci: `${from}${to}${move.promotion ?? ""}`,
      fenBefore: currentFen,
      fenAfter: board.fen(),
      by: setup.color,
    };
    setMoves((prev) => [...prev, played]);
    setShowHint(false);
    reviewPlayerMove(played);
    if (!board.isGameOver()) void requestOpponentMove(played.fenAfter, setup);
    return true;
  }

  function takeBack() {
    if (!setup) return;
    const list = movesRef.current;
    let index = list.length - 1;
    while (index >= 0 && list[index].by !== setup.color) index -= 1;
    if (index < 0) return;
    tokenRef.current += 1;
    opponent?.cancelAll();
    setThinking(false);
    setResigned(false);
    setViewingBest(false);
    setShowHint(false);
    setMoves(list.slice(0, index));
  }

  // If the user leaves "show best" mode by making the review disappear (take back), reset it.
  useEffect(() => {
    if (!latestReview) setViewingBest(false);
  }, [latestReview]);

  const arrows: BoardArrow[] = [];
  if (viewingBest && latestReview?.bestUci) {
    arrows.push({ from: latestReview.bestUci.slice(0, 2), to: latestReview.bestUci.slice(2, 4), color: ARROW_COLORS.best });
    arrows.push({ from: latestReview.playedUci.slice(0, 2), to: latestReview.playedUci.slice(2, 4), color: ARROW_COLORS.played });
  } else if (showHint && live?.bestMove) {
    arrows.push({ from: live.bestMove.slice(0, 2), to: live.bestMove.slice(2, 4), color: ARROW_COLORS.hint });
  }

  const lastMove = viewingBest ? null : moves.length > 0 ? { from: moves[moves.length - 1].uci.slice(0, 2), to: moves[moves.length - 1].uci.slice(2, 4) } : null;

  const qualityFor = (move: PlayedMove): MoveQuality | undefined => reviews[reviewKey(move)]?.quality;

  let status: string;
  if (!setup) status = t("play.setup");
  else if (resigned) status = t("play.over.resigned");
  else if (chess.isCheckmate()) status = turn === setup.color ? t("play.over.checkmateLoss") : t("play.over.checkmateWin");
  else if (chess.isStalemate()) status = t("play.over.stalemate");
  else if (chess.isDraw()) status = t("play.over.draw");
  else if (viewingBest) status = t("coach.viewingBefore");
  else if (engineFailed) status = t("board.engineFailed");
  else if (thinking) status = t("play.thinking");
  else status = t("play.yourTurn");

  const counts = useMemo(() => {
    const tally: Partial<Record<MoveQuality, number>> = {};
    for (const move of moves) {
      const review = reviews[reviewKey(move)];
      if (move.by === setup?.color && review) tally[review.quality] = (tally[review.quality] ?? 0) + 1;
    }
    return tally;
  }, [moves, reviews, setup?.color]);

  const startTurn = startFen.split(" ")[1];

  // ── Fullscreen focus mode, shortcuts and overlay messages ──
  const focus = useFullscreen();
  const noteText = useNoteText();
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  useEffect(() => {
    // Keyboard shortcuts only matter with a keyboard and mouse, not on touch screens.
    if (!focus.active || !window.matchMedia?.("(pointer: fine)").matches) return;
    setShowShortcutHelp(true);
    const timer = setTimeout(() => setShowShortcutHelp(false), 4000);
    return () => clearTimeout(timer);
  }, [focus.active]);

  const flip = () => setOrientation((o) => (o === "white" ? "black" : "white"));
  const canHint = !!setup && !gameOver && !thinking && turn === setup.color && !viewingBest;
  const toggleHint = () => canHint && setShowHint((v) => !v);
  const canShowBest = !!latestReview && latestReview.quality !== "best" && !!latestReview.bestSan;
  const toggleBest = () => canShowBest && setViewingBest((v) => !v);
  const isBadReview = !!latestReview && ["inaccuracy", "mistake", "blunder"].includes(latestReview.quality);

  useChessShortcuts({
    f: focus.toggle,
    Escape: focus.active ? focus.exit : undefined,
    h: toggleHint,
    x: flip,
    u: lastPlayerMove ? takeBack : undefined,
    b: toggleBest,
  });

  const toolbar: ToolbarButton[] = [
    { label: showHint ? t("play.hideHint") : t("play.hint"), shortcut: "H", icon: <Lightbulb className="h-4 w-4" />, onClick: toggleHint, disabled: !canHint },
    { label: t("play.takeBack"), shortcut: "U", icon: <RotateCcw className="h-4 w-4" />, onClick: takeBack, disabled: !lastPlayerMove },
    { label: viewingBest ? t("coach.backToGame") : t("coach.showBest"), shortcut: "B", icon: <Eye className="h-4 w-4" />, onClick: toggleBest, disabled: !canShowBest },
    { label: t("board.flip"), shortcut: "X", icon: <FlipVertical2 className="h-4 w-4" />, onClick: flip },
  ];

  const hintSan = showHint && live?.lines[0] ? uciLineToSan(currentFen, live.lines[0].pv, 1)[0] : undefined;

  let overlay: OverlayMessage | null = null;
  if (engineFailed) overlay = { id: "engine-failed", tone: "error", title: t("board.engineFailed") };
  else if (!setup || gameOver)
    overlay = {
      id: `setup-${status}`,
      tone: "info",
      title: status,
      body: !setup ? `${t("play.level")} ${pickLevel} — ${t(`play.levels.${pickLevel}`)}` : undefined,
      actions: [{ label: setup ? t("play.newGame") : t("play.start"), onClick: startGame, primary: true }],
    };
  else if (showShortcutHelp) overlay = { id: "help", tone: "info", title: t("focus.title"), body: t("focus.playShortcuts") };
  else if (viewingBest && latestReview)
    overlay = {
      id: `best-${latestReview.fenBefore}`,
      tone: "info",
      title: t("coach.best", { move: latestReview.bestSan }),
      body: t("coach.viewingBefore"),
      actions: [{ label: t("coach.backToGame"), onClick: () => setViewingBest(false), primary: true }],
    };
  else if (hintSan) overlay = { id: `hint-${currentFen}`, tone: "info", title: t("play.hintText", { move: hintSan }) };
  else if (latestReview && lastPlayerMove)
    overlay = {
      id: `review-${reviewKey(lastPlayerMove)}`,
      tone: isBadReview ? (latestReview.quality === "inaccuracy" ? "warning" : "error") : "success",
      title: `${latestReview.playedSan} — ${t(`coach.quality.${latestReview.quality}`)}`,
      body: (
        <ul className="space-y-0.5">
          {latestReview.notes.slice(0, 3).map((note, index) => (
            <li key={index}>{noteText(note)}</li>
          ))}
        </ul>
      ),
      actions: isBadReview
        ? [
            { label: t("coach.showBest"), onClick: () => setViewingBest(true) },
            { label: t("coach.retry"), onClick: takeBack, primary: true },
          ]
        : undefined,
    };

  const pill = engineFailed ? null : thinking ? t("play.thinking") : pendingReviews > 0 ? t("coach.reviewing") : null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/chess" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        {t("nav")}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{t("play.title")}</h1>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className={focus.active ? "" : "lg:sticky lg:top-20 lg:self-start"}>
          <BoardStage
            fullscreen={focus.active}
            onExit={focus.exit}
            toolbar={toolbar}
            overlay={overlay}
            pill={focus.active ? pill : null}
            board={
              <BoardWithEval
                id="play-board"
                fen={displayedFen}
                orientation={orientation}
                score={liveScore}
                depth={live?.depth}
                movableColor={setup && !gameOver && !thinking && !viewingBest ? setup.color : null}
                onMove={handleMove}
                arrows={arrows}
                lastMove={lastMove}
              />
            }
            footer={
              <>
                <div className="mt-2 flex items-center justify-between gap-2 pl-8 text-sm sm:pl-9">
                  <span className={`font-medium ${gameOver ? "text-primary" : "text-slate-600"}`}>{status}</span>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={flip}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-primary"
                      title={`${t("board.flip")} (X)`}
                    >
                      <FlipVertical2 className="h-4 w-4" />
                      <span className="sr-only sm:not-sr-only">{t("board.flip")}</span>
                    </button>
                    <FullscreenButton onClick={focus.toggle} />
                  </div>
                </div>
                <p className="mt-1 hidden pl-9 text-xs text-slate-400 md:block">{t("focus.playShortcuts")}</p>
              </>
            }
          />
        </div>

        <div className="space-y-4">
          {engineFailed && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {t("board.engineFailed")}
            </p>
          )}
          {!setup || gameOver ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">{t("play.setup")}</h2>
              {fromCourse?.fen && <p className="mt-2 text-xs text-slate-500">{t("play.fromPosition")}</p>}
              <p className="mt-3 text-sm font-medium text-slate-700">{t("play.yourColor")}</p>
              <div className="mt-1 flex gap-2">
                {(["w", "b", "random"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPickColor(option)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-sm ${
                      pickColor === option ? "border-primary bg-primary-light text-primary-dark" : "border-slate-300 text-slate-600 hover:border-primary/50"
                    }`}
                  >
                    {t(option === "w" ? "play.white" : option === "b" ? "play.black" : "play.random")}
                  </button>
                ))}
              </div>
              <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="chess-level">
                {t("play.level")}: <span className="text-primary">{pickLevel}</span> — {t(`play.levels.${pickLevel}`)}
              </label>
              <input
                id="chess-level"
                type="range"
                min={1}
                max={8}
                value={pickLevel}
                onChange={(event) => setPickLevel(Number(event.target.value))}
                className="mt-2 w-full accent-[rgb(var(--color-primary))]"
              />
              <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={allowAi}
                  onChange={(event) => {
                    setAllowAi(event.target.checked);
                    try {
                      window.localStorage.setItem(AI_KEY, event.target.checked ? "1" : "0");
                    } catch {
                      // ignore
                    }
                  }}
                  className="mt-0.5 accent-[rgb(var(--color-primary))]"
                />
                <span>
                  {t("play.aiToggle")}
                  <span className="block text-xs text-slate-400">{t("play.aiToggleHelp")}</span>
                </span>
              </label>
              <button
                type="button"
                onClick={startGame}
                disabled={!opponent}
                className="mt-4 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
              >
                {setup ? t("play.newGame") : t("play.start")}
              </button>
            </section>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowHint((v) => !v)}
                disabled={thinking || turn !== setup.color}
                className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-primary/50 hover:text-primary disabled:opacity-50"
              >
                <Lightbulb className="h-4 w-4" />
                {showHint ? t("play.hideHint") : t("play.hint")}
              </button>
              <button
                type="button"
                onClick={takeBack}
                disabled={!lastPlayerMove}
                className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-primary/50 hover:text-primary disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                {t("play.takeBack")}
              </button>
              <button
                type="button"
                onClick={() => {
                  tokenRef.current += 1;
                  opponent?.cancelAll();
                  setThinking(false);
                  setResigned(true);
                }}
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                <Flag className="h-4 w-4" />
                {t("play.resign")}
              </button>
            </div>
          )}

          {setup && showHint && live?.lines[0] && (
            <p className="rounded-md bg-primary-light px-3 py-2 text-sm text-primary-dark">
              {t("play.hintText", { move: uciLineToSan(currentFen, live.lines[0].pv, 1)[0] ?? "" })}
            </p>
          )}

          {setup && (
            <CoachPanel
              review={latestReview}
              pending={pendingReviews > 0}
              viewingBest={viewingBest}
              onToggleBest={() => setViewingBest((v) => !v)}
              onRetry={takeBack}
              allowAi={allowAi}
            />
          )}

          {moves.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-400">{t("play.moves")}</h2>
              <MoveList
                moves={moves.map((move) => ({ san: move.san, quality: move.by === setup?.color ? qualityFor(move) : undefined }))}
                startMoveNumber={Number(startFen.split(" ")[5] ?? 1)}
                startsWithBlack={startTurn === "b"}
              />
              {Object.keys(counts).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 text-xs">
                  <span className="text-slate-400">{t("play.summary")}:</span>
                  {(["best", "excellent", "good", "inaccuracy", "mistake", "blunder"] as MoveQuality[])
                    .filter((quality) => counts[quality])
                    .map((quality) => (
                      <span key={quality} className="text-slate-600">
                        {t(`coach.quality.${quality}`)} ×{counts[quality]}
                      </span>
                    ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
