import { formatScore, winPercent, type Score } from "@/features/chess/evaluation";

interface EvalBarProps {
  score: Score | null; // white POV
  orientation: "white" | "black";
  depth?: number;
}

/** Vertical evaluation bar: white's share grows from White's side of the board. */
export function EvalBar({ score, orientation, depth }: EvalBarProps) {
  const white = score ? winPercent(score) : 50;
  const label = score ? formatScore(score) : "…";
  const whiteAhead = white >= 50;
  // White's share is drawn from the bottom when White is at the bottom.
  const whiteAtBottom = orientation === "white";
  const labelAtBottom = whiteAhead === whiteAtBottom;

  return (
    <div
      className="relative w-6 self-stretch shrink-0 overflow-hidden rounded-md border border-slate-300 bg-slate-800 sm:w-7"
      role="meter"
      aria-label="Evaluation"
      aria-valuenow={Math.round(white)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={label}
      title={depth ? `${label} · depth ${depth}` : label}
    >
      <div
        className="absolute inset-x-0 bg-slate-50 transition-[height] duration-500 ease-out"
        style={{ height: `${white}%`, [whiteAtBottom ? "bottom" : "top"]: 0 }}
      />
      <div className="absolute inset-x-0 top-1/2 h-px bg-amber-400/70" aria-hidden />
      <span
        className={`absolute inset-x-0 text-center text-[10px] font-semibold leading-none ${
          labelAtBottom ? "bottom-1" : "top-1"
        } ${whiteAhead ? "text-slate-800" : "text-slate-100"}`}
      >
        {label}
      </span>
    </div>
  );
}
