import { api } from "@/lib/api";

export interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  owner_id: string;
  is_public: boolean;
  due_count: number;
  created_at: string;
  updated_at: string;
}

export async function listCategories(scope: "mine" | "public"): Promise<Category[]> {
  const { data } = await api.get<Category[]>("/categories", { params: { scope } });
  return data;
}

export async function getCategory(id: string): Promise<Category> {
  const { data } = await api.get<Category>(`/categories/${id}`);
  return data;
}

export async function createCategory(input: {
  name: string;
  icon?: string;
  is_public?: boolean;
}): Promise<Category> {
  const { data } = await api.post<Category>("/categories", input);
  return data;
}

export async function updateCategory(
  id: string,
  input: { name?: string; icon?: string; is_public?: boolean }
): Promise<Category> {
  const { data } = await api.patch<Category>(`/categories/${id}`, input);
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/categories/${id}`);
}
