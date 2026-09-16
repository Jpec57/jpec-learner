import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

import type { DueItem } from "@/features/reviews/api";

export function Flashcard({ item, revealed }: { item: DueItem; revealed: boolean }) {
  const { t } = useTranslation("review");
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
      <p className="mt-3 whitespace-pre-wrap text-lg text-slate-900">{question}</p>

      {revealed && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <hr className="my-5 border-slate-100" />
          <p className="text-xs uppercase tracking-wide text-slate-400">{t("answer")}</p>
          <p className="mt-3 whitespace-pre-wrap text-lg text-slate-700">{answer}</p>
        </motion.div>
      )}
    </motion.div>
  );
}
