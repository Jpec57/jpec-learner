import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { listChildren, type HierarchyNode } from "@/features/hierarchy/api";
import { getNodeProgression } from "@/features/progression/api";
import { LevelBadge } from "@/features/progression/LevelBadge";
import { ProgressBar } from "@/features/progression/ProgressBar";

export function ProgressionTreeNode({ node, categoryId }: { node: HierarchyNode; categoryId: string }) {
  const { t } = useTranslation(["hierarchy", "progression"]);
  const [expanded, setExpanded] = useState(false);

  const { data: progress } = useQuery({
    queryKey: ["nodeProgression", node.id],
    queryFn: () => getNodeProgression(node.id),
  });

  const { data: children } = useQuery({
    queryKey: ["hierarchy", categoryId, node.id],
    queryFn: () => listChildren(categoryId, node.id),
    enabled: expanded,
  });

  return (
    <div className="border-l border-slate-100 pl-3">
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
        {node.node_kind === "group" ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-4 text-slate-400"
            aria-label={expanded ? t("tree.collapse") : t("tree.expand")}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <span>{node.node_kind === "group" ? "📁" : "📄"}</span>

        <Link
          to={`/categories/${categoryId}/${node.node_kind === "lesson" ? "lessons" : "groups"}/${node.id}`}
          className="text-sm font-medium text-slate-800 hover:text-primary hover:underline"
        >
          {node.title}
        </Link>

        {progress && progress.total_items > 0 && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-400">
              {t("progression:itemsTracked", { count: progress.total_items })}
            </span>
            {progress.due_count > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {progress.due_count}
              </span>
            )}
            <div className="w-20">
              <ProgressBar value={progress.avg_level} />
            </div>
            <LevelBadge level={progress.avg_level} />
          </div>
        )}
      </div>

      {expanded && (
        <div className="ml-2">
          {children?.map((child) => (
            <ProgressionTreeNode key={child.id} node={child} categoryId={categoryId} />
          ))}
          {children?.length === 0 && <p className="py-1 pl-6 text-xs text-slate-400">{t("tree.empty")}</p>}
        </div>
      )}
    </div>
  );
}
