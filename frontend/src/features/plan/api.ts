import { api } from "@/lib/api";

export type SectionStatus = "no_content" | "not_started" | "weak" | "in_progress" | "solid";

export interface Plan {
  goal: string | null;
  plan_markdown: string | null;
}

export interface PlanSectionProgress {
  level: 2 | 3;
  title: string;
  node_id: string | null;
  status: SectionStatus;
  total_items: number;
  reviewed_items: number;
  avg_level: number;
  due_count: number;
  lapse_rate: number | null;
  weakness_score: number;
  last_reviewed_at: string | null;
  checklist: { text: string; done: boolean }[];
}

export interface WeakCard {
  card_id: string;
  front_text: string;
  lesson_node_id: string | null;
  current_level: number;
  ease_factor: number;
  lapses: number;
}

export interface PlanProgress {
  goal: string | null;
  sections: PlanSectionProgress[];
  weakest_cards: WeakCard[];
  total_due: number;
}

export async function getPlan(categoryId: string): Promise<Plan> {
  const { data } = await api.get<Plan>(`/categories/${categoryId}/plan`);
  return data;
}

// Only the fields present are changed server-side; null/blank clears one.
export async function updatePlan(categoryId: string, input: Partial<Plan>): Promise<Plan> {
  const { data } = await api.put<Plan>(`/categories/${categoryId}/plan`, input);
  return data;
}

export async function getPlanProgress(categoryId: string): Promise<PlanProgress> {
  const { data } = await api.get<PlanProgress>(`/categories/${categoryId}/plan/progress`);
  return data;
}
