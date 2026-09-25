import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { updateCard } from "@/features/cards/api";
import { AnswerModeToggle, TypedAnswerFields } from "@/features/cards/AnswerModeFields";
import { cleanAnswers } from "@/features/cards/AnswersInput";
import { FrontTextarea } from "@/features/cards/FrontTextarea";
import type { DueItem } from "@/features/reviews/api";
import { getErrorMessage } from "@/lib/errors";

export type CardEditPatch = Pick<
  DueItem,
  "front_text" | "back_text" | "answer_mode" | "accepted_answers" | "answer_language" | "hint"
>;

// The same fields as editing a card from the deck (type, front, back, typed
// answers, hint), minus moving it to another lesson.
export function EditCardForm({
  item,
  // A language deck's answer language is its target; keep what's stored.
  showAnswerLanguage,
  onSaved,
  onCancel,
}: {
  item: DueItem;
  showAnswerLanguage: boolean;
  onSaved: (patch: CardEditPatch) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["review", "cards", "common"]);
  const [front, setFront] = useState(item.front_text ?? "");
  const [back, setBack] = useState(item.back_text ?? "");
  const [answerMode, setAnswerMode] = useState(item.answer_mode);
  const [acceptedAnswers, setAcceptedAnswers] = useState(item.accepted_answers);
  const [answerLanguage, setAnswerLanguage] = useState(item.answer_language ?? "");
  const [hint, setHint] = useState(item.hint ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      updateCard(item.card_id!, {
        front_text: front,
        back_text: back,
        answer_mode: answerMode,
        accepted_answers: answerMode === "typed" ? cleanAnswers(acceptedAnswers) : [],
        answer_language: answerMode === "typed" ? answerLanguage || null : null,
        hint: hint || null,
      }),
    onSuccess: (updated) =>
      onSaved({
        front_text: updated.front_text,
        back_text: updated.back_text,
        answer_mode: updated.answer_mode,
        accepted_answers: updated.accepted_answers,
        answer_language: updated.answer_language,
        hint: updated.hint,
      }),
    onError: (err) => setError(getErrorMessage(err, t("common:errors.generic"))),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    save.mutate();
  }

  const inputClass = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

  return (
    <motion.form
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      onSubmit={handleSubmit}
      className="mt-4 space-y-2 rounded-lg border border-primary/30 bg-primary-light/40 p-3"
    >
      <AnswerModeToggle mode={answerMode} onModeChange={setAnswerMode} />
      <div>
        <label className="text-xs font-medium text-slate-500">{t("editCard.front")}</label>
        <FrontTextarea
          allowBlank={answerMode === "typed"}
          value={front}
          onChange={setFront}
          placeholder={t("cards:front")}
          className={`mt-1 ${inputClass}`}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500">{t("editCard.back")}</label>
        <textarea
          value={back}
          onChange={(e) => setBack(e.target.value)}
          rows={2}
          placeholder={answerMode === "typed" ? t("cards:typedBackPlaceholder") : t("cards:back")}
          className={`mt-1 ${inputClass}`}
        />
      </div>
      {answerMode === "typed" && (
        <TypedAnswerFields
          answers={acceptedAnswers}
          onAnswersChange={setAcceptedAnswers}
          language={answerLanguage}
          onLanguageChange={setAnswerLanguage}
          showLanguage={showAnswerLanguage}
        />
      )}
      <div>
        <label className="text-xs font-medium text-slate-500">{t("editCard.hint")}</label>
        <input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder={t("cards:hintPlaceholder")}
          className={`mt-1 ${inputClass}`}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {t("common:actions.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          {t("common:actions.cancel")}
        </button>
      </div>
    </motion.form>
  );
}
