import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import { formatLine, hangingPieces, reviewMove, uciLineToSan } from "@/features/chess/coach";
import type { AnalysisResult } from "@/features/chess/engine/stockfish";
import { classifyMove, formatScore, winPercent } from "@/features/chess/evaluation";

function analysis(fen: string, cp: number | { mate: number }, pv: string[]): AnalysisResult {
  const score = typeof cp === "number" ? { type: "cp" as const, value: cp } : { type: "mate" as const, value: cp.mate };
  return { fen, depth: 14, bestMove: pv[0] ?? null, lines: [{ multipv: 1, depth: 14, score, pv }], cancelled: false };
}

describe("evaluation helpers", () => {
  it("formats scores", () => {
    expect(formatScore({ type: "cp", value: 134 })).toBe("+1.3");
    expect(formatScore({ type: "cp", value: -40 })).toBe("-0.4");
    expect(formatScore({ type: "mate", value: 3 })).toBe("M3");
    expect(formatScore({ type: "mate", value: -2 })).toBe("-M2");
  });

  it("classifies by winning-chance drop", () => {
    expect(classifyMove(50, 50, true)).toBe("best");
    expect(classifyMove(60, 58, false)).toBe("excellent");
    expect(classifyMove(60, 45, false)).toBe("inaccuracy");
    expect(classifyMove(60, 35, false)).toBe("mistake");
    expect(classifyMove(80, 20, false)).toBe("blunder");
    expect(winPercent({ type: "cp", value: 0 })).toBeCloseTo(50);
  });
});

describe("coach", () => {
  it("converts and formats lines", () => {
    const start = new Chess().fen();
    const san = uciLineToSan(start, ["e2e4", "e7e5", "g1f3"]);
    expect(san).toEqual(["e4", "e5", "Nf3"]);
    expect(formatLine(start, san)).toBe("1. e4 e5 2. Nf3");
    const afterE4 = new Chess();
    afterE4.move("e4");
    expect(formatLine(afterE4.fen(), ["e5", "Nf3"])).toBe("1… e5 2. Nf3");
  });

  it("finds hanging pieces", () => {
    // White queen on h5 attacked by the g6 pawn? Use a simple position: black knight on e5 undefended, attacked by Nf3.
    const fen = "rnbqkb1r/pppppppp/8/4n3/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 0 1";
    expect(hangingPieces(fen, "b").map((h) => h.square)).toContain("e5");
  });

  it("explains a hung queen", () => {
    // 1.e4 e5 2.Qh5 Nc6 3.Bc4 — Black plays 3…Nf6?? (blocks nothing; Qxf7#). Before: best is 3…g6.
    const board = new Chess();
    ["e4", "e5", "Qh5", "Nc6", "Bc4"].forEach((m) => board.move(m));
    const before = board.fen();
    board.move("Nf6");
    const after = board.fen();
    const review = reviewMove(
      analysis(before, 0, ["g7g6", "h5f3", "g8f6"]),
      analysis(after, { mate: 1 }, ["h5f7"]),
      "g8f6"
    );
    expect(review.quality).toBe("blunder");
    expect(review.playedSan).toBe("Nf6");
    expect(review.bestSan).toBe("g6");
    expect(review.notes.map((n) => n.key)).toContain("allowsMate");
    expect(review.notes.find((n) => n.key === "allowsMate")?.params?.line).toBe("4. Qxf7#");
  });

  it("praises the engine move", () => {
    const start = new Chess().fen();
    const board = new Chess();
    board.move("e4");
    const review = reviewMove(analysis(start, 30, ["e2e4"]), analysis(board.fen(), -30, ["e7e5"]), "e2e4");
    expect(review.quality).toBe("best");
    expect(review.notes[0].key).toBe("playedBest");
    expect(formatScore(review.evalAfter)).toBe("+0.3");
  });

  it("names the piece lost to the refutation", () => {
    // White knight on f3 wanders to g5 where the h6 pawn takes it.
    const fen = "rnbqkbnr/ppppppp1/7p/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3";
    const board = new Chess(fen);
    board.move("Ng5");
    const review = reviewMove(analysis(fen, 60, ["d2d4"]), analysis(board.fen(), 350, ["h6g5"]), "f3g5");
    expect(review.quality).toBe("blunder");
    const note = review.notes.find((n) => n.key === "refutationCapture");
    expect(note?.params).toEqual({ move: "hxg5", piece: "n" });
  });
});
