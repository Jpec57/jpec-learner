import { api } from "@/lib/api";

export async function getDueCount(): Promise<number> {
  const { data } = await api.get<{ total_due: number }>("/reviews/due-count");
  return data.total_due;
}
