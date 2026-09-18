import { api } from "@/lib/api";

export type OcrMode = "general" | "manga";

export interface OcrScanOut {
  id: string;
  mode: OcrMode;
  text: string;
  image_url: string;
  card_id: string | null;
  lesson_node_id: string | null;
  created_at: string;
}

export async function extractOcr(file: File, mode: OcrMode): Promise<OcrScanOut> {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", mode);
  const { data } = await api.post<OcrScanOut>("/ocr/extract", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function linkOcrScan(
  scanId: string,
  target: { card_id: string } | { lesson_node_id: string }
): Promise<OcrScanOut> {
  const { data } = await api.patch<OcrScanOut>(`/ocr/scans/${scanId}/link`, target);
  return data;
}

export async function listOcrScans(
  target: { card_id: string } | { lesson_node_id: string }
): Promise<OcrScanOut[]> {
  const { data } = await api.get<OcrScanOut[]>("/ocr/scans", { params: target });
  return data;
}
