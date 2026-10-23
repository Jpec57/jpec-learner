// Score helpers shared by the eval bar and the coach.

export type Score = { type: "cp"; value: number } | { type: "mate"; value: number };
export type Color = "w" | "b";

/** Stockfish reports scores for the side to move; flip them to a fixed point of view. */
export function scoreFor(score: Score, sideToMove: Color, pov: Color): Score {
  if (sideToMove === pov) return score;
  return { type: score.type, value: -score.value } as Score;
}

/** Winning chances (0..100) for whoever the score belongs to. Same curve Lichess uses. */
export function winPercent(score: Score): number {
  if (score.type === "mate") {
    if (score.value === 0) return 0; // side to move is mated
    return score.value > 0 ? 100 : 0;
  }
  const cp = Math.max(-1000, Math.min(1000, score.value));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Human label for a white-POV score: "+1.3", "-0.4", "M3", "-M2". */
export function formatScore(score: Score): string {
  if (score.type === "mate") {
    if (score.value === 0) return "#";
    return score.value > 0 ? `M${score.value}` : `-M${-score.value}`;
  }
  const pawns = score.value / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

export type MoveQuality = "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder" | "book";

/**
 * Classify a move from the mover's winning chances before (with best play) and after.
 * Thresholds mirror Lichess: a 10/20/30 point drop is an inaccuracy/mistake/blunder.
 */
export function classifyMove(winBefore: number, winAfter: number, playedBest: boolean): MoveQuality {
  if (playedBest) return "best";
  const drop = winBefore - winAfter;
  if (drop >= 30) return "blunder";
  if (drop >= 20) return "mistake";
  if (drop >= 10) return "inaccuracy";
  if (drop >= 3) return "good";
  return "excellent";
}

export const QUALITY_SYMBOL: Record<MoveQuality, string> = {
  best: "★",
  excellent: "!",
  good: "",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
  book: "📖",
};

// Literal Tailwind classes (semantic bad→good signal, like the review rating buttons).
export const QUALITY_STYLE: Record<MoveQuality, string> = {
  best: "bg-emerald-100 text-emerald-800 border-emerald-300",
  excellent: "bg-lime-100 text-lime-800 border-lime-300",
  good: "bg-slate-100 text-slate-700 border-slate-300",
  inaccuracy: "bg-amber-100 text-amber-800 border-amber-300",
  mistake: "bg-orange-100 text-orange-800 border-orange-300",
  blunder: "bg-red-100 text-red-800 border-red-300",
  book: "bg-sky-100 text-sky-800 border-sky-300",
};
