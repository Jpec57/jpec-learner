import "katex/dist/katex.min.css";

import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";

import { mediaUrl } from "@/features/images/api";

const REMARK_PLUGINS = [remarkMath, remarkBreaks];
const REHYPE_PLUGINS = [rehypeKatex];
// Inline mode drops the paragraph wrapper so short text (a comma-separated
// list of answers, a one-line preview) can sit inside a surrounding line.
// Uploaded images are served by the API under /media, which may be another origin
// than the app, so `![...](/media/...)` links in card text are resolved like attachments.
const resolveImg: Components["img"] = ({ src, alt, node: _node, ...rest }) => (
  <img src={typeof src === "string" && src.startsWith("/media/") ? mediaUrl(src) : src} alt={alt ?? ""} {...rest} />
);
const BLOCK_COMPONENTS: Components = { img: resolveImg };
const INLINE_COMPONENTS: Components = { p: ({ children }) => <>{children}</>, img: resolveImg };

// Markdown with $inline$ / $$block$$ LaTeX math. Single newlines are kept as
// line breaks (remark-breaks) since card text is typed as plain multi-line text.
export function MarkdownContent({
  markdown,
  className = "",
  inline = false,
  size = "prose-sm",
}: {
  markdown: string;
  className?: string;
  inline?: boolean;
  size?: "prose-sm" | "prose-base" | "prose-lg";
}) {
  const content = (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={inline ? INLINE_COMPONENTS : BLOCK_COMPONENTS}
    >
      {markdown}
    </ReactMarkdown>
  );
  if (inline) return <span className={className}>{content}</span>;
  return <div className={`prose ${size} prose-slate max-w-none ${className}`}>{content}</div>;
}
