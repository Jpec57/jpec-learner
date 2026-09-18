import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listOcrScans } from "@/features/ocr/api";

export function ScannedFromThumbnails({
  target,
}: {
  target: { card_id: string } | { lesson_node_id: string };
}) {
  const { t } = useTranslation("ocr");
  const queryKey =
    "card_id" in target ? ["ocrScans", "card", target.card_id] : ["ocrScans", "lesson", target.lesson_node_id];

  const { data: scans } = useQuery({
    queryKey,
    queryFn: () => listOcrScans(target),
  });

  if (!scans || scans.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">{t("scannedFrom")}</span>
      {scans.map((scan) => (
        <a key={scan.id} href={scan.image_url} target="_blank" rel="noreferrer">
          <img src={scan.image_url} alt="" className="h-12 w-12 rounded-md border border-slate-200 object-cover" />
        </a>
      ))}
    </div>
  );
}
