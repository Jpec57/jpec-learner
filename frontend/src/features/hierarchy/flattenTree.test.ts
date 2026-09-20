import { describe, expect, it } from "vitest";

import type { FlatHierarchyNode } from "@/features/hierarchy/api";
import { flattenTree } from "@/features/hierarchy/flattenTree";

const node = (id: string, title: string, parent_id: string | null = null): FlatHierarchyNode => ({
  id,
  title,
  parent_id,
  node_kind: "group",
});

describe("flattenTree", () => {
  it("puts children right under their parent, sorted by title, with depths", () => {
    const rows = flattenTree([
      node("l1", "Matrices", "a"),
      node("b", "Analysis"),
      node("a", "Algebra"),
      node("l2", "Determinants", "a"),
      node("s", "Suites", "b"),
      node("d", "Deep", "l2"),
    ]);
    expect(rows.map((r) => [r.node.title, r.depth])).toEqual([
      ["Algebra", 0],
      ["Determinants", 1],
      ["Deep", 2],
      ["Matrices", 1],
      ["Analysis", 0],
      ["Suites", 1],
    ]);
  });

  it("treats nodes with a missing parent as roots and survives cycles", () => {
    expect(flattenTree([node("x", "Orphan", "gone")]).map((r) => r.depth)).toEqual([0]);
    expect(flattenTree([node("p", "P", "q"), node("q", "Q", "p")])).toEqual([]);
  });
});
