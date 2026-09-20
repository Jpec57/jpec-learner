import { api } from "@/lib/api";

export interface Translation {
  translation: string;
  /** Valid answers (e.g. every definition of a word) -- become typed answers. */
  answers: string[];
  /** Suggestions, some possibly wrong -- offered, never accepted automatically. */
  alternatives: string[];
  provider: string;
}

export async function translateText(input: { text: string; source: string; target: string }): Promise<Translation> {
  const { data } = await api.post<Translation>("/translate", input);
  return data;
}
