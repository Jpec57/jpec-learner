import { FuriganaText } from "@/components/ui/FuriganaText";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { parseFurigana } from "@/lib/furigana";

// Card text is markdown + LaTeX math, except text using furigana notation
// (漢字[かんじ]): its square brackets would collide with markdown link syntax
// and its click-to-reveal readings need FuriganaText, so it renders as before.
export function CardText({
  text,
  className = "",
  inline = false,
  size,
}: {
  text: string;
  className?: string;
  inline?: boolean;
  size?: "prose-sm" | "prose-base" | "prose-lg";
}) {
  if (parseFurigana(text).some((segment) => segment.reading)) {
    return <FuriganaText text={text} className={className} />;
  }
  return <MarkdownContent markdown={text} className={className} inline={inline} size={size} />;
}
