import { api } from "@/lib/api";

export interface ThemeProgress {
  node_id: string;
  title: string;
  total_items: number;
  avg_level: number;
  due_count: number;
}

export interface CardProgress {
  card_id: string;
  front_text: string;
  back_text: string;
  current_level: number | null;
  due_at: string | null;
  repetitions: number | null;
  last_reviewed_at: string | null;
}

export interface LevelCount {
  level: number;
  count: number;
}

export interface Progression {
  category_id: string;
  streak_days: number;
  total_items: number;
  total_due: number;
  themes: ThemeProgress[];
  level_distribution: LevelCount[];
}

export interface LevelDefinition {
  level: number;
  name_en: string;
  name_fr: string;
  icon_key: string | null;
}

export async function getProgression(categoryId: string): Promise<Progression> {
  const { data } = await api.get<Progression>(`/progression/categories/${categoryId}`);
  return data;
}

export async function listLevels(): Promise<LevelDefinition[]> {
  const { data } = await api.get<LevelDefinition[]>("/progression/levels");
  return data;
}

export async function getNodeProgression(nodeId: string): Promise<ThemeProgress> {
  const { data } = await api.get<ThemeProgress>(`/progression/nodes/${nodeId}`);
  return data;
}

export async function getNodeCardsProgression(nodeId: string): Promise<CardProgress[]> {
  const { data } = await api.get<CardProgress[]>(`/progression/nodes/${nodeId}/cards`);
  return data;
}
