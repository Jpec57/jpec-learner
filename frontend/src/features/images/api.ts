import { api } from "@/lib/api";

export interface ImageOut {
  id: string;
  url: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export async function uploadImage(
  file: File,
  target: { card_id: string } | { lesson_node_id: string }
): Promise<ImageOut> {
  const form = new FormData();
  form.append("file", file);
  if ("card_id" in target) {
    form.append("card_id", target.card_id);
  } else {
    form.append("lesson_node_id", target.lesson_node_id);
  }
  const { data } = await api.post<ImageOut>("/images", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteImage(id: string): Promise<void> {
  await api.delete(`/images/${id}`);
}

export function mediaUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1").replace(/\/api\/v1\/?$/, "");
  return `${base}${path}`;
}
