// Two-step "reset progress" control: a quiet link that asks for confirmation inline.
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface ResetProgressButtonProps {
  label: string;
  question: string;
  onConfirm: () => void;
}

export function ResetProgressButton({ label, question, onConfirm }: ResetProgressButtonProps) {
  const { t } = useTranslation("chess");
  const [confirming, setConfirming] = useState(false);

  if (!confirming)
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-600"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {label}
      </button>
    );

  return (
    <div role="alertdialog" aria-label={question} className="flex flex-wrap items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
      <span className="flex-1">{question}</span>
      <button
        type="button"
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
        className="rounded-md bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700"
      >
        {t("progressReset.confirm")}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2.5 py-1 text-red-800 hover:bg-red-100">
        {t("progressReset.cancel")}
      </button>
    </div>
  );
}
