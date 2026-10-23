import { Chess } from "chess.js";
import { ArrowLeft, CheckCircle2, Eye, FlipVertical2, Lightbulb, RotateCcw, Swords, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { reviewMove } from "@/features/chess/coach";
import { useLang } from "@/features/chess/ChessHomePage";
import { ARROW_COLORS, BOARD_MAX_WIDTH, BoardWithEval, type BoardArrow } from "@/features/chess/components/BoardWithEval";
import { QualityBadge } from "@/features/chess/components/CoachPanel";
import { MoveList } from "@/features/chess/components/MoveList";
import { useAnalysisService, useLiveAnalysis } from "@/features/chess/engine/hooks";
import { formatScore, scoreFor, type Color, type MoveQuality } from "@/features/chess/evaluation";
import { getCourse, type OpeningCourse } from "@/features/chess/openings";
import { isMastered, loadProgress, recordLineResult } from "@/features/chess/progress";

const stripSuffix = (san: string) => san.replace(/[+#!?]+$/, "");

type Feedback =
  | { kind: "correct"; san: string }
  | { kind: "wrong"; san: string; from: string; to: string; quality?: MoveQuality; evalText?: string }
  | { kind: "hint"; piece: string; square: string }
  | { kind: "shown"; san: string; from: string; to: string }
  | null;

function positionsFor(course: OpeningCourse, lineIndex: number) {
  const chess = new Chess();
  const fens = [chess.fen()];
  const ucis: { from: string; to: string }[] = [];
  for (const move of course.lines[lineIndex].moves) {
    const played = chess.move(move.san);
    fens.push(chess.fen());
    ucis.push({ from: played.from, to: played.to });
  }
  return { fens, ucis };
}

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

  const [lineIndex, setLineIndex] = useState(0);
  const [ply, setPly] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [progress, setProgress] = useState(loadProgress);
  const [orientation, setOrientation] = useState<"white" | "black">(course.side === "w" ? "white" : "black");
  const recordedRef = useRef(false);

  const line = course.lines[lineIndex];
  const { fens, ucis } = useMemo(() => positionsFor(course, lineIndex), [course, lineIndex]);
  const fen = fens[ply];
  const done = ply >= line.moves.length;
  const turn = fen.split(" ")[1] as Color;
  const traineeTurn = !done && turn === course.side;

  const live = useLiveAnalysis(service, fen);
  const liveScore = live?.lines[0] ? scoreFor(live.lines[0].score, turn, "w") : null;

  // The trainer plays the opponent's moves automatically.
  useEffect(() => {
    if (done || traineeTurn) return;
    const timer = setTimeout(() => setPly((p) => p + 1), ply === 0 ? 700 : 550);
    return () => clearTimeout(timer);
  }, [done, traineeTurn, ply]);

  // Record the result once when the line is finished.
  useEffect(() => {
    if (!done || recordedRef.current) return;
    recordedRef.current = true;
    setProgress(recordLineResult(course.id, line.id, mistakes === 0));
  }, [done, course.id, line.id, mistakes]);

  function restart(index = lineIndex) {
    recordedRef.current = false;
    service?.reset();
    setLineIndex(index);
    setPly(0);
    setMistakes(0);
    setFeedback(null);
  }

  function handleMove({ from, to, promotion }: { from: string; to: string; promotion?: string }): boolean {
    if (!traineeTurn) return false;
    const expected = line.moves[ply];
    const board = new Chess(fen);
    let played;
    try {
      played = board.move({ from, to, promotion });
    } catch {
      return false;
    }
    if (stripSuffix(played.san) === stripSuffix(expected.san)) {
      setFeedback({ kind: "correct", san: played.san });
      setPly((p) => p + 1);
      return true;
    }

    // Wrong: snap back, count it, and ask the engine how bad it really was.
    setMistakes((m) => m + 1);
    const wrong: Feedback = { kind: "wrong", san: played.san, from, to };
    setFeedback(wrong);
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

  function showHint() {
    const expected = new Chess(fen).move(line.moves[ply].san);
    setFeedback({ kind: "hint", piece: expected.piece, square: expected.from });
  }

  function showMove() {
    const expected = new Chess(fen).move(line.moves[ply].san);
    setMistakes((m) => m + 1); // being shown the answer means it wasn't known
    setFeedback({ kind: "shown", san: expected.san, from: expected.from, to: expected.to });
  }

  const arrows: BoardArrow[] = [];
  const tints: Record<string, string> = {};
  if (traineeTurn && feedback?.kind === "shown") arrows.push({ from: feedback.from, to: feedback.to, color: ARROW_COLORS.best });
  if (traineeTurn && feedback?.kind === "wrong") {
    arrows.push({ from: feedback.from, to: feedback.to, color: ARROW_COLORS.played });
  }
  if (traineeTurn && feedback?.kind === "hint") tints[feedback.square] = "rgba(79, 70, 229, 0.45)";

  const lastMove = ply > 0 ? ucis[ply - 1] : null;

  // The latest notes: the trainee's move just played, then the opponent's reply.
  const recent = line.moves
    .slice(0, ply)
    .map((move, index) => ({ ...move, index }))
    .slice(-2)
    .reverse();

  const traineeMoveCount = line.moves.filter((_, index) => (index % 2 === 0 ? "w" : "b") === course.side).length;
  const traineeMovesPlayed = line.moves.slice(0, ply).filter((_, index) => (index % 2 === 0 ? "w" : "b") === course.side).length;

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
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="mx-auto" style={{ maxWidth: BOARD_MAX_WIDTH }}>
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
            <div className="mt-2 flex items-center justify-between gap-2 pl-8 text-sm sm:pl-9">
              <div className="flex-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(ply / line.moves.length) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t("course.progress", { current: traineeMovesPlayed, total: traineeMoveCount })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-primary"
                title={t("board.flip")}
              >
                <FlipVertical2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">{t("course.lines")}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {course.lines.map((option, index) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => restart(index)}
                  className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-left text-sm ${
                    index === lineIndex ? "border-primary bg-primary-light text-primary-dark" : "border-slate-300 text-slate-600 hover:border-primary/50"
                  }`}
                >
                  {isMastered(progress, course.id, option.id) && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label={t("course.mastered")} />}
                  {option.name[lang]}
                </button>
              ))}
            </div>
          </section>

          {/* Turn-by-turn feedback */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-live="polite">
            {done ? (
              <div>
                <p className="text-lg font-semibold text-emerald-700">{mistakes === 0 ? t("course.completedFlawless") : t("course.completed")}</p>
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
                      onClick={() => restart((lineIndex + 1) % course.lines.length)}
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
                        <p className="flex flex-wrap items-center gap-1.5 text-red-700">
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
                  const byTrainee = (move.index % 2 === 0 ? "w" : "b") === course.side;
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
                      <span className="text-slate-600">{move.note[lang]}</span>
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
              <MoveList moves={line.moves.slice(0, ply).map((move) => ({ san: move.san }))} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

