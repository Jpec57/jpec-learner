import { Chess, type Square } from "chess.js";
import { useMemo, useState, type CSSProperties } from "react";
import { Chessboard } from "react-chessboard";

import { EvalBar } from "@/features/chess/components/EvalBar";
import type { Score } from "@/features/chess/evaluation";

export interface BoardArrow {
  from: string;
  to: string;
  color: string;
}

// Keeps the whole board (and its eval bar) on screen: capped by the viewport height.
export const BOARD_MAX_WIDTH = "min(600px, calc(100vh - 12rem))";

export const ARROW_COLORS = {
  best: "rgba(16, 185, 129, 0.85)", // emerald
  played: "rgba(239, 68, 68, 0.75)", // red
  hint: "rgba(79, 70, 229, 0.8)", // primary indigo
  threat: "rgba(249, 115, 22, 0.8)", // accent orange
};

interface BoardWithEvalProps {
  id: string;
  fen: string;
  orientation: "white" | "black";
  score: Score | null; // white POV
  depth?: number;
  /** Which color the user may move; null = board is read-only. */
  movableColor: "w" | "b" | null;
  /** Return false to reject the move (piece snaps back). */
  onMove?: (move: { from: string; to: string; promotion?: string }) => boolean;
  arrows?: BoardArrow[];
  lastMove?: { from: string; to: string } | null;
  /** Extra square tints, e.g. a wrong move flashing red. */
  squareTints?: Record<string, string>;
}

const LAST_MOVE_TINT = "rgba(250, 204, 21, 0.38)";
const SELECTED_TINT = "rgba(79, 70, 229, 0.35)";

export function BoardWithEval({
  id,
  fen,
  orientation,
  score,
  depth,
  movableColor,
  onMove,
  arrows = [],
  lastMove,
  squareTints = {},
}: BoardWithEvalProps) {
  const [selected, setSelected] = useState<Square | null>(null);
  const chess = useMemo(() => new Chess(fen), [fen]);
  const turn = chess.turn();
  const canMove = movableColor !== null && movableColor === turn && !chess.isGameOver();

  const targets = useMemo(
    () => (selected && canMove ? chess.moves({ square: selected, verbose: true }).map((m) => m.to) : []),
    [chess, selected, canMove]
  );

  function tryMove(from: string, to: string): boolean {
    if (!canMove || !onMove) return false;
    const legal = chess.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
    if (legal.length === 0) return false;
    // Auto-queen: underpromotion is rare enough not to need a picker here.
    const promotion = legal.some((m) => m.promotion) ? "q" : undefined;
    setSelected(null);
    return onMove({ from, to, promotion });
  }

  function handleSquareClick(square: string) {
    if (!canMove) return;
    if (selected && targets.includes(square as Square)) {
      tryMove(selected, square);
      return;
    }
    const piece = chess.get(square as Square);
    setSelected(piece && piece.color === turn ? (square as Square) : null);
  }

  const squareStyles: Record<string, CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { backgroundColor: LAST_MOVE_TINT };
    squareStyles[lastMove.to] = { backgroundColor: LAST_MOVE_TINT };
  }
  if (chess.inCheck()) {
    const king = chess
      .board()
      .flat()
      .find((cell) => cell && cell.type === "k" && cell.color === turn);
    if (king) squareStyles[king.square] = { background: "radial-gradient(circle, rgba(239,68,68,0.85) 0%, rgba(239,68,68,0) 75%)" };
  }
  if (selected) squareStyles[selected] = { backgroundColor: SELECTED_TINT };
  for (const target of targets) {
    const occupied = chess.get(target);
    squareStyles[target] = {
      ...squareStyles[target],
      background: occupied
        ? "radial-gradient(circle, transparent 58%, rgba(15,23,42,0.28) 60%)"
        : "radial-gradient(circle, rgba(15,23,42,0.28) 22%, transparent 24%)",
    };
  }
  for (const [square, color] of Object.entries(squareTints)) {
    squareStyles[square] = { ...squareStyles[square], backgroundColor: color };
  }

  return (
    <div className="flex w-full gap-2">
      <EvalBar score={score} orientation={orientation} depth={depth} />
      <div className="min-w-0 flex-1 overflow-hidden rounded-md shadow-md">
        <Chessboard
          id={id}
          position={fen}
          boardOrientation={orientation}
          arePiecesDraggable={canMove}
          isDraggablePiece={({ piece }) => canMove && piece[0] === turn}
          onPieceDragBegin={(_piece, square) => setSelected(square)}
          onPieceDrop={(sourceSquare, targetSquare) => tryMove(sourceSquare, targetSquare)}
          // Promotions are handled in tryMove (auto-queen); skip the library's dialog.
          onPromotionCheck={() => false}
          onSquareClick={(square) => handleSquareClick(square)}
          customArrows={arrows.map((arrow) => [arrow.from as Square, arrow.to as Square, arrow.color])}
          areArrowsAllowed
          customSquareStyles={squareStyles}
          customDarkSquareStyle={{ backgroundColor: "#7c8db5" }}
          customLightSquareStyle={{ backgroundColor: "#e8ecf6" }}
          animationDuration={180}
        />
      </div>
    </div>
  );
}
