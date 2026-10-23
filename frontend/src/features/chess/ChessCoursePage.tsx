import { Chess } from "chess.js";
import { ArrowLeft, CheckCircle2, Eye, FlipVertical2, Lightbulb, RotateCcw, SkipForward, Swords, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { reviewMove } from "@/features/chess/coach";
import { useLang } from "@/features/chess/ChessHomePage";
import {
  BoardStage,
  FullscreenButton,
  useChessShortcuts,
  useFullscreen,
  type OverlayMessage,
  type ToolbarButton,
} from "@/features/chess/components/BoardStage";
import { ARROW_COLORS, BoardWithEval, type BoardArrow } from "@/features/chess/components/BoardWithEval";
import { QualityBadge } from "@/features/chess/components/CoachPanel";
import { MoveList } from "@/features/chess/components/MoveList";
import { useAnalysisService, useEngineFailed, useLiveAnalysis } from "@/features/chess/engine/hooks";
import { formatScore, scoreFor, type Color, type MoveQuality } from "@/features/chess/evaluation";
import { getCourse, type CourseLine, type OpeningCourse } from "@/features/chess/openings";
import { isMastered, loadProgress, recordLineResult } from "@/features/chess/progress";

const stripSuffix = (san: string) => san.replace(/[+#!?]+$/, "");

type Feedback =
  | { kind: "correct"; san: string }
  | { kind: "wrong"; san: string; from: string; to: string; quality?: MoveQuality; evalText?: string }
  | { kind: "hint"; piece: string; square: string }
  | { kind: "shown"; san: string; from: string; to: string }
  | null;

// One line, or "mixed": the opponent picks among every line matching the moves so far.
type Mode = number | "mixed";

/** Lines still consistent with the moves played (the trainee is following one of them). */
function matchingLines(lines: CourseLine[], history: string[]): CourseLine[] {
  return lines.filter(
    (line) => line.moves.length >= history.length && history.every((san, index) => line.moves[index].san === san)
  );
}

function replay(history: string[]) {
  const chess = new Chess();
  const fens = [chess.fen()];
  const squares: { from: string; to: string }[] = [];
  for (const san of history) {
    const move = chess.move(san);
    fens.push(chess.fen());
    squares.push({ from: move.from, to: move.to });
  }
  return { fens, squares };
}

const moverOf = (index: number): Color => (index % 2 === 0 ? "w" : "b");

export function ChessCoursePage() {
  const { courseId } = useParams();
  const course = courseId ? getCourse(courseId) : undefined;
  if (!course) return <Navigate to="/chess" replace />;
  return <CourseTrainer key={course.id} course={course} />;
}

function CourseTrainer({ course }: { course: OpeningCourse }) {
  const { t } = useTranslation("chess");
  const lang = useLang();
  const navigate = useNavigate();
  const service = useAnalysisService(14);
  const engineFailed = useEngineFailed(service?.engine);
  const focus = useFullscreen();

  const [mode, setMode] = useState<Mode>(0);
  const [history, setHistory] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [progress, setProgress] = useState(loadProgress);
  const [orientation, setOrientation] = useState<"white" | "black">(course.side === "w" ? "white" : "black");
  const recordedRef = useRef(false);

  const pool = useMemo(() => (mode === "mixed" ? course.lines : [course.lines[mode]]), [mode, course]);
  const candidates = useMemo(() => matchingLines(pool, history), [pool, history]);
  const finishedLine = candidates.find((line) => line.moves.length === history.length) ?? null;
  // The line we're on for notes/progress: the finished one, or the first still matching.
  const currentLine = finishedLine ?? candidates[0] ?? pool[0];
  const lineKnown = mode !== "mixed" || new Set(candidates.map((line) => line.id)).size === 1;

  const { fens, squares } = useMemo(() => replay(history), [history]);
  const ply = history.length;
  const fen = fens[ply];
  const done = finishedLine !== null || candidates.length === 0;
  const turn = fen.split(" ")[1] as Color;
  const traineeTurn = !done && turn === course.side;

  const live = useLiveAnalysis(service, fen);
  const liveScore = live?.lines[0] ? scoreFor(live.lines[0].score, turn, "w") : null;

  // The trainer plays the opponent's moves. In mixed mode it picks one of the
  // distinct continuations at random, so each run can go down a different line.
  useEffect(() => {
    if (done || traineeTurn) return;
    const options = [...new Set(candidates.map((line) => line.moves[ply].san))];
    const next = options[Math.floor(Math.random() * options.length)];
    const timer = setTimeout(() => setHistory((h) => [...h, next]), ply === 0 ? 700 : 550);
    return () => clearTimeout(timer);
  }, [done, traineeTurn, ply, candidates]);

  // Record the result once when a line is finished.
  useEffect(() => {
    if (!finishedLine || recordedRef.current) return;
    recordedRef.current = true;
    setProgress(recordLineResult(course.id, finishedLine.id, mistakes === 0));
  }, [finishedLine, course.id, mistakes]);

  function restart(next: Mode = mode) {
    recordedRef.current = false;
    service?.reset();
    setMode(next);
    setHistory([]);
    setMistakes(0);
    setFeedback(null);
  }

  const nextMode = (): Mode => (mode === "mixed" ? "mixed" : (mode + 1) % course.lines.length);

  function handleMove({ from, to, promotion }: { from: string; to: string; promotion?: string }): boolean {
    if (!traineeTurn) return false;
    const board = new Chess(fen);
    let played;
    try {
      played = board.move({ from, to, promotion });
    } catch {
      return false;
    }
    // Any matching line's move is right (lines can branch on the trainee's move too).
    const expected = candidates.map((line) => line.moves[ply].san).find((san) => stripSuffix(san) === stripSuffix(played.san));
    if (expected) {
      setFeedback({ kind: "correct", san: played.san });
      setHistory((h) => [...h, expected]);
      return true;
    }

    // Wrong: snap back, count it, and ask the engine how bad it really was.
    setMistakes((m) => m + 1);
    setFeedback({ kind: "wrong", san: played.san, from, to });
    if (service) {
      const before = service.acquire(fen);
      const after = service.acquire(board.fen());
      const uci = `${from}${to}${played.promotion ?? ""}`;
      void Promise.all([before.promise, after.promise]).then(([beforeResult, afterResult]) => {
        before.release();
        after.release();
        const review = reviewMove(beforeResult, afterResult, uci);
        setFeedback((current) =>
          current?.kind === "wrong" && current.san === played.san
            ? { ...current, quality: review.quality, evalText: formatScore(review.evalAfter) }
            : current
        );
      });
    }
    return false;
  }

  function expectedMove() {
    return new Chess(fen).move(currentLine.moves[ply].san);
  }

  function showHint() {
    if (!traineeTurn) return;
    const expected = expectedMove();
    setFeedback({ kind: "hint", piece: expected.piece, square: expected.from });
  }

  function showMove() {
    if (!traineeTurn) return;
    const expected = expectedMove();
    setMistakes((m) => m + 1); // being shown the answer means it wasn't known
    setFeedback({ kind: "shown", san: expected.san, from: expected.from, to: expected.to });
  }

  const flip = () => setOrientation((o) => (o === "white" ? "black" : "white"));

  useChessShortcuts({
    f: focus.toggle,
    Escape: focus.active ? focus.exit : undefined,
    h: showHint,
    s: showMove,
    r: () => restart(),
    n: done ? () => restart(nextMode()) : undefined,
    x: flip,
  });

  const arrows: BoardArrow[] = [];
  const tints: Record<string, string> = {};
  if (traineeTurn && feedback?.kind === "shown") arrows.push({ from: feedback.from, to: feedback.to, color: ARROW_COLORS.best });
  if (traineeTurn && feedback?.kind === "wrong") arrows.push({ from: feedback.from, to: feedback.to, color: ARROW_COLORS.played });
  if (traineeTurn && feedback?.kind === "hint") tints[feedback.square] = "rgba(79, 70, 229, 0.45)";

  const lastMove = ply > 0 ? squares[ply - 1] : null;

  // The latest notes: the trainee's move just played, then the opponent's reply.
  const recent = history
    .map((san, index) => ({ san, index, note: currentLine.moves[index]?.note }))
    .slice(-2)
    .reverse();

  const lineMoves = currentLine.moves;
  const traineeMoveCount = lineMoves.filter((_, index) => moverOf(index) === course.side).length;
  const traineeMovesPlayed = history.filter((_, index) => moverOf(index) === course.side).length;

  // ── Overlay messages for fullscreen focus mode ──
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  useEffect(() => {
    if (!focus.active) return;
    setShowShortcutHelp(true);
    const timer = setTimeout(() => setShowShortcutHelp(false), 4000);
    return () => clearTimeout(timer);
  }, [focus.active]);

  let overlay: OverlayMessage | null = null;
  if (engineFailed) overlay = { id: "engine-failed", tone: "error", title: t("board.engineFailed"), duration: null };
  else if (done)
    overlay = {
      id: `done-${ply}-${currentLine.id}`,
      tone: "success",
      title: mistakes === 0 ? t("course.completedFlawless") : t("course.completed"),
      body: currentLine.name[lang],
      actions: [
        { label: t("course.restart"), onClick: () => restart() },
        ...(course.lines.length > 1 ? [{ label: t("course.nextLine"), onClick: () => restart(nextMode()), primary: true }] : []),
      ],
      duration: null,
    };
  else if (showShortcutHelp) overlay = { id: "help", tone: "info", title: t("focus.title"), body: t("focus.courseShortcuts"), duration: 4000 };
  else if (traineeTurn && feedback?.kind === "wrong")
    overlay = {
      id: `wrong-${ply}-${feedback.san}-${feedback.quality ?? ""}`,
      tone: "error",
      title: t("course.wrong", { move: feedback.san }),
      body: (
        <>
          {feedback.quality && (
            <p>{t("course.wrongEngine", { move: feedback.san, quality: t(`coach.quality.${feedback.quality}`), eval: feedback.evalText })}</p>
          )}
          <p>{t("course.tryAgain")}</p>
        </>
      ),
      actions: [
        { label: t("course.hint"), onClick: showHint },
        { label: t("course.showMove"), onClick: showMove },
      ],
      duration: 8000,
    };
  else if (traineeTurn && feedback?.kind === "hint")
    overlay = { id: `hint-${ply}`, tone: "info", title: t("course.hintText", { piece: t(`pieces.${feedback.piece}`) }), duration: null };
  else if (traineeTurn && feedback?.kind === "shown")
    overlay = { id: `shown-${ply}`, tone: "success", title: t("course.shownText", { move: feedback.san }), duration: null };
  else if (recent.length > 0)
    // After each exchange: why our move was right and what the opponent's reply wants.
    overlay = {
      id: `notes-${ply}`,
      tone: "info",
      title: lineKnown && mode === "mixed" ? t("course.currentLine", { name: currentLine.name[lang] }) : t("course.yourMove", { opening: course.name[lang] }),
      body: (
        <ul className="space-y-1">
          {[...recent].reverse().map((move) => (
            <li key={move.index}>
              <span className="font-semibold">
                {moverOf(move.index) === course.side ? `✓ ${move.san}` : t("course.opponentNote", { move: move.san })}
              </span>
              {move.note && <span> — {move.note[lang]}</span>}
            </li>
          ))}
        </ul>
      ),
      duration: 6000,
    };

  const toolbar: ToolbarButton[] = [
    { label: t("course.hint"), shortcut: "H", icon: <Lightbulb className="h-4 w-4" />, onClick: showHint, disabled: !traineeTurn },
    { label: t("course.showMove"), shortcut: "S", icon: <Eye className="h-4 w-4" />, onClick: showMove, disabled: !traineeTurn },
    { label: t("course.restart"), shortcut: "R", icon: <RotateCcw className="h-4 w-4" />, onClick: () => restart() },
    { label: t("course.nextLine"), shortcut: "N", icon: <SkipForward className="h-4 w-4" />, onClick: () => restart(nextMode()), disabled: !done },
    { label: t("board.flip"), shortcut: "X", icon: <FlipVertical2 className="h-4 w-4" />, onClick: flip },
  ];

  const pill = !done && !traineeTurn ? (ply === 0 ? t("course.start") : t("course.opponentMoving")) : null;

  const chipClass = (selected: boolean) =>
    `flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-left text-sm ${
      selected ? "border-primary bg-primary-light text-primary-dark" : "border-slate-300 text-slate-600 hover:border-primary/50"
    }`;

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/chess" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        {t("course.back")}
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-2xl font-semibold text-slate-900">{course.name[lang]}</h1>
        <span className="text-sm text-slate-400">
          {course.side === "w" ? "♔" : "♚"} {course.eco}
        </span>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className={focus.active ? "" : "lg:sticky lg:top-20 lg:self-start"}>
          <BoardStage
            fullscreen={focus.active}
            onExit={focus.exit}
            toolbar={toolbar}
            overlay={overlay}
            pill={focus.active ? pill : null}
            board={
              <BoardWithEval
                id={`course-${course.id}`}
                fen={fen}
                orientation={orientation}
                score={liveScore}
                depth={live?.depth}
                movableColor={traineeTurn ? course.side : null}
                onMove={handleMove}
                arrows={arrows}
                lastMove={lastMove}
                squareTints={tints}
              />
            }
            footer={
              <>
                <div className="mt-2 flex items-center justify-between gap-2 pl-8 text-sm sm:pl-9">
                  <div className="flex-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(ply / lineMoves.length) * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("course.progress", { current: traineeMovesPlayed, total: traineeMoveCount })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={flip}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-primary"
                    title={`${t("board.flip")} (X)`}
                  >
                    <FlipVertical2 className="h-4 w-4" />
                  </button>
                  <FullscreenButton onClick={focus.toggle} />
                </div>
                <p className="mt-1 hidden pl-9 text-xs text-slate-400 md:block">{t("focus.courseShortcuts")}</p>
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
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
              {t("course.lines")} <span className="normal-case tracking-normal">· {t("course.linesCount", { count: course.lines.length })}</span>
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => restart("mixed")} className={chipClass(mode === "mixed")} title={t("course.mixedHelp")}>
                {t("course.mixed")}
              </button>
              {course.lines.map((option, index) => (
                <button key={option.id} type="button" onClick={() => restart(index)} className={chipClass(index === mode)}>
                  {isMastered(progress, course.id, option.id) && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label={t("course.mastered")} />
                  )}
                  {option.name[lang]}
                </button>
              ))}
            </div>
            {mode === "mixed" && (
              <p className="mt-2 text-xs text-slate-500">
                {lineKnown && ply > 0 ? t("course.currentLine", { name: currentLine.name[lang] }) : t("course.mixedHelp")}
              </p>
            )}
          </section>

          {/* Turn-by-turn feedback */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-live="polite">
            {done ? (
              <div>
                <p className="text-lg font-semibold text-emerald-700">
                  {mistakes === 0 ? t("course.completedFlawless") : t("course.completed")}
                </p>
                <p className="text-sm text-slate-500">{currentLine.name[lang]}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => restart()}
                    className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:border-primary/50 hover:text-primary"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("course.restart")}
                  </button>
                  {course.lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => restart(nextMode())}
                      className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
                    >
                      {t("course.nextLine")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate("/chess/play", { state: { fen, color: course.side } })}
                    className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-primary"
                  >
                    <Swords className="h-4 w-4" />
                    {t("course.playFromHere")}
                  </button>
                </div>
              </div>
            ) : traineeTurn ? (
              <div className="space-y-3">
                {feedback?.kind === "wrong" && (
                  <div className="flex gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium">{t("course.wrong", { move: feedback.san })}</p>
                      {feedback.quality && (
                        <p className="text-red-700">
                          {t("course.wrongEngine", {
                            move: feedback.san,
                            quality: t(`coach.quality.${feedback.quality}`),
                            eval: feedback.evalText,
                          })}
                        </p>
                      )}
                      <p>{t("course.tryAgain")}</p>
                    </div>
                  </div>
                )}
                {feedback?.kind === "hint" && (
                  <p className="rounded-md bg-primary-light p-3 text-sm text-primary-dark">
                    {t("course.hintText", { piece: t(`pieces.${feedback.piece}`) })}
                  </p>
                )}
                {feedback?.kind === "shown" && (
                  <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{t("course.shownText", { move: feedback.san })}</p>
                )}
                <p className="font-medium text-slate-900">{t("course.yourMove", { opening: course.name[lang] })}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={showHint}
                    className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:border-primary/50 hover:text-primary"
                  >
                    <Lightbulb className="h-4 w-4" />
                    {t("course.hint")}
                  </button>
                  <button
                    type="button"
                    onClick={showMove}
                    className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:border-primary/50 hover:text-primary"
                  >
                    <Eye className="h-4 w-4" />
                    {t("course.showMove")}
                  </button>
                  <button
                    type="button"
                    onClick={() => restart()}
                    className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-primary"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("course.restart")}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">{ply === 0 ? t("course.start") : t("course.opponentMoving")}</p>
            )}

            {recent.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                {recent.map((move) => {
                  const byTrainee = moverOf(move.index) === course.side;
                  return (
                    <li key={move.index} className="text-sm">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-900">
                        {byTrainee ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            {t("course.correct", { move: move.san })}
                            {move.index === ply - 1 && feedback?.kind === "correct" && <QualityBadge quality="book" />}
                          </>
                        ) : (
                          t("course.opponentNote", { move: move.san })
                        )}
                      </span>
                      {move.note && <span className="text-slate-600">{move.note[lang]}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">{t("course.ideas")}</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {course.ideas.map((idea, index) => (
                <li key={index} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  {idea[lang]}
                </li>
              ))}
            </ul>
          </section>

          {ply > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <MoveList moves={history.map((san) => ({ san }))} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
