import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { listChildren, type HierarchyNode } from "@/features/hierarchy/api";
import { getNodeCardsProgression, getNodeProgression } from "@/features/progression/api";
import { LevelBadge } from "@/features/progression/LevelBadge";
import { ProgressBar } from "@/features/progression/ProgressBar";
import { formatDateTime } from "@/lib/formatDate";

export function ProgressionTreeNode({ node, categoryId }: { node: HierarchyNode; categoryId: string }) {
  const { t, i18n } = useTranslation(["hierarchy", "progression"]);
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

  const { data: cards } = useQuery({
    queryKey: ["nodeCardsProgression", node.id],
    queryFn: () => getNodeCardsProgression(node.id),
    enabled: expanded,
  });

  const expandable = node.node_kind === "group" || node.has_children || node.child_counts.cards > 0;
  const nodeLink = `/categories/${categoryId}/${node.node_kind === "lesson" ? "lessons" : "groups"}/${node.id}`;

  return (
    <div className="border-l border-slate-100 pl-3">
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
        {expandable ? (
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
          to={nodeLink}
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
          {cards?.map((card) => (
            <div
              key={card.card_id}
              className="ml-2 flex items-center gap-2 rounded-md border-l border-slate-100 px-2 py-1 pl-3 hover:bg-slate-50"
            >
              <span className="w-4" />
              <span>🃏</span>
              <Link
                to={`${nodeLink}?cardQuery=${encodeURIComponent(card.front_text.split("\n")[0])}`}
                className="min-w-0 truncate text-sm text-slate-700 hover:text-primary hover:underline"
              >
                {card.front_text.split("\n")[0]}
              </Link>
              <div className="ml-auto flex shrink-0 items-center gap-3">
                {card.current_level === null ? (
                  <span className="text-xs text-slate-400">{t("progression:notEnrolled")}</span>
                ) : (
                  <>
                    {card.repetitions === 0 ? (
                      <span className="text-xs text-slate-400">{t("progression:newCard")}</span>
                    ) : (
                      card.due_at && (
                        <span className="text-xs text-slate-400">
                          {new Date(card.due_at) <= new Date()
                            ? t("progression:dueLabel")
                            : t("progression:nextReview", { date: formatDateTime(card.due_at, i18n.language) })}
                        </span>
                      )
                    )}
                    <div className="w-20">
                      <ProgressBar value={card.current_level} />
                    </div>
                    <LevelBadge level={card.current_level} />
                  </>
                )}
              </div>
            </div>
          ))}
          {children?.length === 0 && cards?.length === 0 && (
            <p className="py-1 pl-6 text-xs text-slate-400">{t("tree.empty")}</p>
          )}
        </div>
      )}
    </div>
  );
}
