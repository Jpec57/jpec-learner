import type { DueItem } from "@/features/reviews/api";

export function Flashcard({ item, revealed }: { item: DueItem; revealed: boolean }) {
  const question = item.item_kind === "card" ? item.front_text : item.title;
  const answer = item.item_kind === "card" ? item.back_text : item.body_markdown;

  return (
    <div className="min-h-[220px] rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">
        {item.item_kind === "card" ? "Card" : "Lesson"}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-lg text-slate-900">{question}</p>

      {revealed && (
        <>
          <hr className="my-5 border-slate-100" />
          <p className="text-xs uppercase tracking-wide text-slate-400">Answer</p>
          <p className="mt-3 whitespace-pre-wrap text-lg text-slate-700">{answer}</p>
        </>
      )}
    </div>
  );
}
