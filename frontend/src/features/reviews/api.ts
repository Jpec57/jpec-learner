import { api } from "@/lib/api";

export interface DueItem {
  review_state_id: string;
  item_kind: "card" | "lesson";
  card_id: string | null;
  lesson_node_id: string | null;
  front_text: string | null;
  back_text: string | null;
  title: string | null;
  body_markdown: string | null;
  due_at: string;
  current_level: number;
}

export interface ReviewState {
  id: string;
  user_id: string;
  card_id: string | null;
  lesson_node_id: string | null;
  repetitions: number;
  ease_factor: number;
  interval_days: number;
  due_at: string;
  last_reviewed_at: string | null;
  last_rating: number | null;
  current_level: number;
  created_at: string;
  updated_at: string;
}

export async function getDue(categoryId: string, limit = 100): Promise<DueItem[]> {
  const { data } = await api.get<DueItem[]>("/reviews/due", {
    params: { category_id: categoryId, limit },
  });
  return data;
}

export async function submitReview(reviewStateId: string, rating: number): Promise<ReviewState> {
  const { data } = await api.post<ReviewState>(`/reviews/${reviewStateId}/submit`, { rating });
  return data;
}

export async function enroll(target: { card_id: string } | { lesson_node_id: string }): Promise<ReviewState> {
  const { data } = await api.post<ReviewState>("/reviews/enroll", target);
  return data;
}
