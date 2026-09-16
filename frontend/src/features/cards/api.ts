import { api } from "@/lib/api";
import type { ImageOut } from "@/features/images/api";

export interface Card {
  id: string;
  category_id: string;
  lesson_node_id: string | null;
  owner_id: string;
  front_text: string;
  back_text: string;
  is_public: boolean;
  images: ImageOut[];
  created_at: string;
  updated_at: string;
}

export async function listCards(input: {
  categoryId: string;
  lessonNodeId?: string | null;
  owner?: "me" | "public";
  search?: string;
}): Promise<Card[]> {
  const { data } = await api.get<Card[]>("/cards", {
    params: {
      category_id: input.categoryId,
      lesson_node_id: input.lessonNodeId ?? undefined,
      owner: input.owner ?? "me",
      search: input.search || undefined,
    },
  });
  return data;
}

export async function createCard(input: {
  category_id: string;
  lesson_node_id?: string | null;
  front_text: string;
  back_text: string;
  is_public?: boolean;
}): Promise<Card> {
  const { data } = await api.post<Card>("/cards", input);
  return data;
}

export async function updateCard(
  id: string,
  input: { front_text?: string; back_text?: string; is_public?: boolean }
): Promise<Card> {
  const { data } = await api.patch<Card>(`/cards/${id}`, input);
  return data;
}

export async function deleteCard(id: string): Promise<void> {
  await api.delete(`/cards/${id}`);
}
