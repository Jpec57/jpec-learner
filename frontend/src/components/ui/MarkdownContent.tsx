import ReactMarkdown from "react-markdown";

export function MarkdownContent({ markdown, className = "" }: { markdown: string; className?: string }) {
  return (
    <div className={`prose prose-sm prose-slate max-w-none ${className}`}>
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
}
