import { useState } from "react";

import { parseFurigana } from "@/lib/furigana";

// Furigana is a reading hint, not answer text -- shown only on click so it
// doesn't give away a typed-review answer at a glance (see DESIGN.md).
export function FuriganaText({ text, className = "" }: { text: string; className?: string }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  function toggle(index: number) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <span className={className}>
      {parseFurigana(text).map((segment, index) =>
        segment.reading ? (
          <ruby
            key={index}
            onClick={() => toggle(index)}
            className="cursor-pointer underline decoration-dotted decoration-slate-300 underline-offset-4"
          >
            {segment.text}
            {revealed.has(index) && <rt>{segment.reading}</rt>}
          </ruby>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </span>
  );
}
