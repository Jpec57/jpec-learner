import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { discardOcrScan, extractOcr, type OcrMode, type OcrScanOut } from "@/features/ocr/api";

type Stage = "closed" | "capture" | "loading" | "review";

export function OcrCaptureButton({
  onResult,
}: {
  // scanId is only set when the user chose to keep the photo; the caller then
  // links it to the saved card/lesson, which is what uploads it.
  onResult: (result: { text: string; scanId?: string }) => void;
}) {
  const { t } = useTranslation(["ocr", "common"]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("closed");
  const [mode, setMode] = useState<OcrMode>("general");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrScanOut | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [keepPhoto, setKeepPhoto] = useState(false);

  function clearPreview() {
    setPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }

  // Photos are only stored server-side temporarily; anything not kept is deleted.
  function discardResult() {
    if (result) discardOcrScan(result.id).catch(() => {});
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStage("loading");
    setError(null);
    try {
      const scan = await extractOcr(file, mode);
      clearPreview();
      setPreview(URL.createObjectURL(file));
      setResult(scan);
      setKeepPhoto(false);
      setStage("review");
    } catch {
      setError(t("extractError"));
      setStage("capture");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function reset() {
    clearPreview();
    setStage("closed");
    setResult(null);
    setKeepPhoto(false);
    setError(null);
  }

  if (stage === "closed") {
    return (
      <button
        type="button"
        onClick={() => setStage("capture")}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <Camera size={14} /> {t("scanButton")}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary-light/20 p-2">
      {stage !== "review" && (
        <>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setMode("general")}
              className={`rounded-md px-2 py-1 text-xs font-medium ${
                mode === "general" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {t("mode.general")}
            </button>
            <button
              type="button"
              onClick={() => setMode("manga")}
              className={`rounded-md px-2 py-1 text-xs font-medium ${
                mode === "manga" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {t("mode.manga")}
            </button>
          </div>

          <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 hover:border-primary/50 hover:text-primary-dark">
            {stage === "loading" ? t("extracting") : t("takePhoto")}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              disabled={stage === "loading"}
              onChange={handleFile}
              className="hidden"
            />
          </label>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <button type="button" onClick={reset} className="mt-2 text-xs text-slate-500 hover:underline">
            {t("common:actions.cancel")}
          </button>
        </>
      )}

      {stage === "review" && result && (
        <div>
          <div className="flex gap-2">
            <img src={preview ?? undefined} alt="" className="h-20 w-20 shrink-0 rounded-md object-cover" />
            <p className="max-h-20 flex-1 overflow-y-auto whitespace-pre-wrap rounded-md bg-white p-1.5 text-xs text-slate-700">
              {result.text || t("noTextFound")}
            </p>
          </div>
          <label className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={keepPhoto} onChange={(e) => setKeepPhoto(e.target.checked)} />
            {t("keepPhoto")}
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (keepPhoto) onResult({ text: result.text, scanId: result.id });
                else {
                  discardResult();
                  onResult({ text: result.text });
                }
                reset();
              }}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-dark"
            >
              {t("useThisText")}
            </button>
            <button
              type="button"
              onClick={() => {
                discardResult();
                clearPreview();
                setResult(null);
                setStage("capture");
              }}
              className="text-xs text-slate-500 hover:underline"
            >
              {t("retake")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
