import { api } from "@/lib/api";

export interface ThemeProgress {
  node_id: string;
  title: string;
  total_items: number;
  avg_level: number;
  due_count: number;
}

export interface Progression {
  category_id: string;
  streak_days: number;
  total_items: number;
  total_due: number;
  themes: ThemeProgress[];
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
