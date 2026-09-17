import { parseFurigana } from "@/lib/furigana";

export function FuriganaText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {parseFurigana(text).map((segment, index) =>
        segment.reading ? (
          <ruby key={index}>
            {segment.text}
            <rt>{segment.reading}</rt>
          </ruby>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </span>
  );
}
