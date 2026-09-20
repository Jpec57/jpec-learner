import type { FlatHierarchyNode } from "@/features/hierarchy/api";

export interface TreeRow {
  node: FlatHierarchyNode;
  depth: number;
}

/** Orders a flat node list depth-first (every node right under its parent,
 * siblings by title) with each node's depth, ready to render as an indented
 * list. Nodes whose parent isn't in the list are treated as roots. */
export function flattenTree(nodes: FlatHierarchyNode[]): TreeRow[] {
  const ids = new Set(nodes.map((node) => node.id));
  const childrenOf = new Map<string | null, FlatHierarchyNode[]>();
  for (const node of nodes) {
    const key = node.parent_id && ids.has(node.parent_id) ? node.parent_id : null;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), node]);
  }

  const rows: TreeRow[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null, depth: number) => {
    const children = [...(childrenOf.get(parentId) ?? [])].sort((a, b) => a.title.localeCompare(b.title));
    for (const node of children) {
      if (visited.has(node.id)) continue; // defensive: never loop on bad data
      visited.add(node.id);
      rows.push({ node, depth });
      visit(node.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}
