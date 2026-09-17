import { isAxiosError } from "axios";

import { api } from "@/lib/api";

export type ReviewItemType = "card" | "lesson";
export const ALL_REVIEW_ITEM_TYPES: ReviewItemType[] = ["card", "lesson"];

export type AnswerMode = "reveal" | "typed";

export interface DueItem {
  review_state_id: string;
  item_kind: ReviewItemType;
  card_id: string | null;
  lesson_node_id: string | null;
  front_text: string | null;
  back_text: string | null;
  title: string | null;
  body_markdown: string | null;
  answer_mode: AnswerMode;
  accepted_answers: string[];
  answer_language: string | null;
  hint: string | null;
  due_at: string;
  current_level: number;
}

export interface UpcomingBucket {
  hour: string;
  count: number;
}

export interface ReviewInsightItem {
  review_state_id: string;
  item_kind: ReviewItemType;
  card_id: string | null;
  lesson_node_id: string | null;
  front_text: string | null;
  title: string | null;
  ease_factor: number;
  repetitions: number;
  last_reviewed_at: string | null;
  current_level: number;
}

export interface ReviewInsights {
  struggling: ReviewInsightItem[];
  stale: ReviewInsightItem[];
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

export async function getDue(
  categoryId: string,
  types: ReviewItemType[] = ALL_REVIEW_ITEM_TYPES,
  limit = 100
): Promise<DueItem[]> {
  const { data } = await api.get<DueItem[]>("/reviews/due", {
    params: { category_id: categoryId, types, limit },
  });
  return data;
}

export async function getUpcoming(categoryId: string, hours = 24): Promise<UpcomingBucket[]> {
  const { data } = await api.get<UpcomingBucket[]>("/reviews/upcoming", {
    params: { category_id: categoryId, hours },
  });
  return data;
}

export async function getInsights(categoryId: string, limit = 5): Promise<ReviewInsights> {
  const { data } = await api.get<ReviewInsights>("/reviews/insights", {
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

export async function getReviewState(
  target: { card_id: string } | { lesson_node_id: string }
): Promise<ReviewState | null> {
  try {
    const { data } = await api.get<ReviewState>("/reviews/state", { params: target });
    return data;
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}
