import { QUALITY_SYMBOL, type MoveQuality } from "@/features/chess/evaluation";

export interface MoveListItem {
  san: string;
  quality?: MoveQuality;
}

const SYMBOL_COLOR: Partial<Record<MoveQuality, string>> = {
  best: "text-emerald-600",
  excellent: "text-lime-600",
  inaccuracy: "text-amber-600",
  mistake: "text-orange-600",
  blunder: "text-red-600",
  book: "text-sky-600",
};

/** Two-column move list. `startsWithBlack` handles games started from a position where Black moves first. */
export function MoveList({
  moves,
  startMoveNumber = 1,
  startsWithBlack = false,
}: {
  moves: MoveListItem[];
  startMoveNumber?: number;
  startsWithBlack?: boolean;
}) {
  const padded: (MoveListItem | null)[] = startsWithBlack ? [null, ...moves] : moves;
  const rows: { number: number; white: MoveListItem | null; black: MoveListItem | null }[] = [];
  for (let i = 0; i < padded.length; i += 2) {
    rows.push({ number: startMoveNumber + i / 2, white: padded[i], black: padded[i + 1] ?? null });
  }

  const cell = (item: MoveListItem | null) =>
    item ? (
      <span className="font-medium text-slate-800">
        {item.san}
        {item.quality && QUALITY_SYMBOL[item.quality] && item.quality !== "good" && (
          <span className={`ml-0.5 text-xs font-bold ${SYMBOL_COLOR[item.quality] ?? ""}`}>{QUALITY_SYMBOL[item.quality]}</span>
        )}
      </span>
    ) : (
      <span className="text-slate-300">…</span>
    );

  if (rows.length === 0) return null;
  return (
    <ol className="grid max-h-56 grid-cols-[2.5rem_1fr_1fr] gap-x-2 gap-y-1 overflow-y-auto text-sm">
      {rows.map((row) => (
        <li key={row.number} className="contents">
          <span className="text-slate-400">{row.number}.</span>
          {cell(row.white)}
          {row.black ? cell(row.black) : <span />}
        </li>
      ))}
    </ol>
  );
}
