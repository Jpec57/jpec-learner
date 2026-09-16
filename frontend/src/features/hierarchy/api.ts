import { api } from "@/lib/api";

export type NodeKind = "group" | "lesson";

export interface HierarchyNode {
  id: string;
  category_id: string;
  parent_id: string | null;
  node_kind: NodeKind;
  title: string;
  description: string | null;
  order_index: number;
  owner_id: string;
  is_public: boolean;
  has_children: boolean;
  body_markdown: string | null;
  created_at: string;
  updated_at: string;
}

export async function listChildren(categoryId: string, parentId: string | null): Promise<HierarchyNode[]> {
  const { data } = await api.get<HierarchyNode[]>("/hierarchy", {
    params: { category_id: categoryId, parent_id: parentId ?? undefined },
  });
  return data;
}

export async function getNode(id: string): Promise<HierarchyNode> {
  const { data } = await api.get<HierarchyNode>(`/hierarchy/${id}`);
  return data;
}

export async function createNode(input: {
  category_id: string;
  parent_id?: string | null;
  node_kind: NodeKind;
  title: string;
  description?: string;
  is_public?: boolean;
  body_markdown?: string;
}): Promise<HierarchyNode> {
  const { data } = await api.post<HierarchyNode>("/hierarchy", input);
  return data;
}

export async function updateNode(
  id: string,
  input: { title?: string; description?: string; is_public?: boolean; body_markdown?: string }
): Promise<HierarchyNode> {
  const { data } = await api.patch<HierarchyNode>(`/hierarchy/${id}`, input);
  return data;
}

export async function deleteNode(id: string): Promise<void> {
  await api.delete(`/hierarchy/${id}`);
}

export async function moveNode(
  id: string,
  input: { new_parent_id?: string | null; new_order_index?: number }
): Promise<HierarchyNode> {
  const { data } = await api.post<HierarchyNode>(`/hierarchy/${id}/move`, input);
  return data;
}
