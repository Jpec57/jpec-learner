// Turns two engine analyses (before / after a move) into a human explanation.
// Everything here is deterministic: the engine finds the truth, these rules
// put words on it (hung pieces, missed captures, allowed mates, ...).
import { Chess, type Color as ChessColor, type PieceSymbol, type Square } from "chess.js";

import type { AnalysisResult } from "@/features/chess/engine/stockfish";
import { classifyMove, scoreFor, winPercent, type Color, type MoveQuality, type Score } from "@/features/chess/evaluation";

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export interface CoachNote {
  key: string; // i18n key under chess:coach.notes
  params?: Record<string, string | number>;
}

export interface MoveReview {
  fenBefore: string;
  fenAfter: string;
  mover: Color;
  playedUci: string;
  playedSan: string;
  bestUci: string | null;
  bestSan: string | null;
  bestLineSan: string[];
  refutationUci: string | null;
  refutationLineSan: string[];
  quality: MoveQuality;
  evalBefore: Score; // white POV
  evalAfter: Score; // white POV
  notes: CoachNote[];
}

export function uciToMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}

/** Convert a UCI principal variation to SAN, stopping at the first illegal move. */
export function uciLineToSan(fen: string, uciMoves: string[], max = 6): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of uciMoves.slice(0, max)) {
    try {
      out.push(chess.move(uciToMove(uci)).san);
    } catch {
      break;
    }
  }
  return out;
}

/** "12. Nf3 Nc6 13. Bb5" style rendering of a SAN line starting at `fen`. */
export function formatLine(fen: string, sanMoves: string[]): string {
  const parts = fen.split(" ");
  let moveNumber = Number(parts[5] ?? 1);
  let white = parts[1] === "w";
  const out: string[] = [];
  sanMoves.forEach((san, index) => {
    if (white) out.push(`${moveNumber}. ${san}`);
    else out.push(index === 0 ? `${moveNumber}… ${san}` : san);
    if (!white) moveNumber += 1;
    white = !white;
  });
  return out.join(" ");
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

/** Pieces of `color` that can be won: attacked and undefended, or attacked by something cheaper. */
export function hangingPieces(fen: string, color: Color): { square: Square; piece: PieceSymbol }[] {
  const chess = new Chess(fen);
  const enemy = opposite(color) as ChessColor;
  const result: { square: Square; piece: PieceSymbol }[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== color || cell.type === "k") continue;
      const attackers = chess.attackers(cell.square, enemy);
      if (attackers.length === 0) continue;
      const defenders = chess.attackers(cell.square, color as ChessColor);
      const cheapestAttacker = Math.min(...attackers.map((sq) => PIECE_VALUE[chess.get(sq)!.type]));
      if (defenders.length === 0 || cheapestAttacker < PIECE_VALUE[cell.type]) {
        result.push({ square: cell.square, piece: cell.type });
      }
    }
  }
  return result.sort((a, b) => PIECE_VALUE[b.piece] - PIECE_VALUE[a.piece]);
}

function describeMove(fen: string, uci: string): { san: string; captured?: PieceSymbol; check: boolean; mate: boolean } | null {
  const chess = new Chess(fen);
  try {
    const move = chess.move(uciToMove(uci));
    return { san: move.san, captured: move.captured, check: chess.inCheck(), mate: chess.isCheckmate() };
  } catch {
    return null;
  }
}

export function reviewMove(before: AnalysisResult, after: AnalysisResult, playedUci: string): MoveReview {
  const mover = before.fen.split(" ")[1] as Color;
  const opponent = opposite(mover);
  const played = describeMove(before.fen, playedUci);
  const bestLine = before.lines[0];
  const bestUci = before.bestMove ?? bestLine?.pv[0] ?? null;
  const bestSan = bestUci ? describeMove(before.fen, bestUci)?.san ?? null : null;
  const playedBest = bestUci === playedUci;

  // Scores from the mover's point of view.
  const bestScore: Score = bestLine ? scoreFor(bestLine.score, mover, mover) : { type: "cp", value: 0 };
  const afterLine = after.lines[0];
  let afterScore: Score;
  if (played?.mate) afterScore = { type: "mate", value: 1 };
  else if (afterLine) afterScore = scoreFor(afterLine.score, opponent, mover);
  else afterScore = { type: "cp", value: 0 }; // stalemate or no info
  const winBefore = winPercent(bestScore);
  const winAfter = played?.mate ? 100 : winPercent(afterScore);
  const quality = classifyMove(winBefore, winAfter, playedBest);

  const refutationUci = played?.mate ? null : after.bestMove ?? afterLine?.pv[0] ?? null;
  const refutationLineSan = afterLine ? uciLineToSan(after.fen, afterLine.pv, 9) : [];
  const bestLineSan = bestLine ? uciLineToSan(before.fen, bestLine.pv, 6) : [];

  const notes: CoachNote[] = [];
  const bad = quality === "inaccuracy" || quality === "mistake" || quality === "blunder";

  if (played?.mate) {
    notes.push({ key: "deliveredMate" });
  } else {
    if (bestScore.type === "mate" && bestScore.value > 0 && !(afterScore.type === "mate" && afterScore.value > 0)) {
      notes.push({ key: "missedMate", params: { n: bestScore.value, move: bestSan ?? "" } });
    }
    if (afterScore.type === "mate" && afterScore.value < 0) {
      notes.push({
        key: "allowsMate",
        params: { n: -afterScore.value, line: formatLine(after.fen, refutationLineSan.slice(0, -afterScore.value * 2 - 1)) },
      });
    }
  }

  if (bad && !played?.mate) {
    // Pieces left en prise by this move (that weren't already en prise before it).
    const beforeHanging = new Set(hangingPieces(before.fen, mover).map((h) => h.square));
    const to = playedUci.slice(2, 4);
    const newlyHanging = hangingPieces(after.fen, mover).filter((h) => !beforeHanging.has(h.square) || h.square === to);
    const refutation = refutationUci ? describeMove(after.fen, refutationUci) : null;

    if (refutation?.captured) {
      notes.push({
        key: "refutationCapture",
        params: { move: refutation.san, piece: refutation.captured },
      });
    } else if (newlyHanging.length > 0) {
      notes.push({ key: "hangs", params: { piece: newlyHanging[0].piece, square: newlyHanging[0].square } });
    } else if (refutation?.check) {
      notes.push({ key: "refutationCheck", params: { move: refutation.san } });
    } else if (refutation) {
      notes.push({ key: "refutation", params: { line: formatLine(after.fen, refutationLineSan.slice(0, 4)) } });
    }

    // What the best move would have achieved.
    const best = bestUci ? describeMove(before.fen, bestUci) : null;
    if (best?.mate) notes.push({ key: "bestMates", params: { move: best.san } });
    else if (best?.captured) notes.push({ key: "bestCaptures", params: { move: best.san, piece: best.captured } });
    else if (best?.check) notes.push({ key: "bestChecks", params: { move: best.san } });
    if (bestLineSan.length > 0) {
      notes.push({ key: "bestLine", params: { line: formatLine(before.fen, bestLineSan.slice(0, 5)) } });
    }
  } else if (!played?.mate) {
    if (playedBest) notes.push({ key: "playedBest" });
    else if (bestSan) notes.push({ key: "alsoGood", params: { move: bestSan } });
    if (played?.captured) notes.push({ key: "wonMaterial", params: { piece: played.captured } });
  }

  return {
    fenBefore: before.fen,
    fenAfter: after.fen,
    mover,
    playedUci,
    playedSan: played?.san ?? playedUci,
    bestUci,
    bestSan,
    bestLineSan,
    refutationUci,
    refutationLineSan,
    quality,
    evalBefore: scoreFor(bestScore, mover, "w"),
    evalAfter: scoreFor(afterScore, mover, "w"),
    notes,
  };
}
