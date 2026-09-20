import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { FlatHierarchyNode } from "@/features/hierarchy/api";
import { flattenTree } from "@/features/hierarchy/flattenTree";

// Restricts the review queue to one group/lesson and everything under it.
export function NodeFilter({
  nodes,
  value,
  onChange,
}: {
  nodes: FlatHierarchyNode[];
  value: string | null;
  onChange: (nodeId: string | null) => void;
}) {
  const { t } = useTranslation("review");
  const rows = useMemo(() => flattenTree(nodes), [nodes]);

  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-500">
      {t("nodeFilter.label")}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="max-w-[16rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
      >
        <option value="">{t("nodeFilter.wholeDeck")}</option>
        {rows.map(({ node, depth }) => (
          <option key={node.id} value={node.id}>
            {"  ".repeat(depth)}
            {node.node_kind === "group" ? "📁" : "📖"} {node.title}
          </option>
        ))}
      </select>
    </label>
  );
}
