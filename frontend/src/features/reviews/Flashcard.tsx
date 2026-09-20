import { motion } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CardText } from "@/components/ui/CardText";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import type { DueItem } from "@/features/reviews/api";

export function Flashcard({ item, revealed }: { item: DueItem; revealed: boolean }) {
  const { t } = useTranslation("review");
  // Keyed by review state so a hint opened on one card doesn't stay open on the next.
  const [hintShownFor, setHintShownFor] = useState<string | null>(null);
  const question = item.item_kind === "card" ? item.front_text : item.title;
  const answer = item.item_kind === "card" ? item.back_text : item.body_markdown;

  return (
    <motion.div
      key={item.review_state_id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="min-h-[220px] rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
    >
      <p className="text-xs uppercase tracking-wide text-slate-400">
        {item.item_kind === "card" ? t("card") : t("lesson")}
      </p>
      <CardText text={question ?? ""} size="prose-lg" className="mt-3 block" />

      {item.item_kind === "card" && item.hint && !revealed && (
        <div className="mt-4">
          {hintShownFor === item.review_state_id ? (
            <div className="text-sm text-slate-500">
              <span aria-hidden>💡 </span>
              <CardText text={item.hint} size="prose-base" className="inline-block align-top" />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setHintShownFor(item.review_state_id)}
              className="text-xs text-slate-400 hover:text-primary"
            >
              {t("typed.showHint")}
            </button>
          )}
        </div>
      )}

      {revealed && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <hr className="my-5 border-slate-100" />
          <p className="text-xs uppercase tracking-wide text-slate-400">{t("answer")}</p>
          {item.item_kind === "lesson" ? (
            <MarkdownContent markdown={answer ?? ""} className="mt-3" />
          ) : (
            <CardText text={answer ?? ""} size="prose-lg" className="mt-3 block" />
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
