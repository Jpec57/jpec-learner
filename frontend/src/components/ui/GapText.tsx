import { useTranslation } from "react-i18next";

import { CardText } from "@/components/ui/CardText";
import { hasGap, splitGaps } from "@/lib/gaps";

// Drop-in for CardText on a card's *front*: runs of underscores render as a
// blank to fill in ("あの試合は__見たい"). `fill` writes the answer into the
// blank -- only honoured for a single gap, since a card has one answer.
export function GapText({
  text,
  fill,
  className = "",
  inline = false,
  size,
}: {
  text: string;
  fill?: string | null;
  className?: string;
  inline?: boolean;
  size?: "prose-sm" | "prose-base" | "prose-lg";
}) {
  const { t } = useTranslation("cards");
  if (!hasGap(text)) return <CardText text={text} className={className} inline={inline} size={size} />;

  const pieces = splitGaps(text);
  const filled = fill && pieces.length === 2 ? fill : null;

  return (
    <span className={className}>
      {pieces.map((piece, index) => (
        <span key={index}>
          {piece && <CardText text={piece} inline />}
          {index < pieces.length - 1 &&
            (filled ? (
              <span className="mx-1 border-b-2 border-emerald-500 px-1 font-medium text-emerald-700">
                <CardText text={filled} inline />
              </span>
            ) : (
              <span
                role="img"
                aria-label={t("gapLabel")}
                className="mx-1 inline-block min-w-[4rem] border-b-2 border-slate-400"
              >
                &nbsp;
              </span>
            ))}
        </span>
      ))}
    </span>
  );
}
