import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { CardListSection } from "@/features/cards/CardListSection";
import { getCategory } from "@/features/categories/api";
import { getNode } from "@/features/hierarchy/api";
import { HierarchyTreeView } from "@/features/hierarchy/HierarchyTreeView";

export function GroupDetailPage() {
  const { t } = useTranslation("hierarchy");
  const { categoryId, nodeId } = useParams<{ categoryId: string; nodeId: string }>();

  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: () => getCategory(categoryId!),
    enabled: !!categoryId,
  });

  const { data: node } = useQuery({
    queryKey: ["hierarchyNode", nodeId],
    queryFn: () => getNode(nodeId!),
    enabled: !!nodeId,
  });

  if (!categoryId || !nodeId || !category || !node) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={`/categories/${categoryId}/browse`} className="text-sm text-slate-500 hover:text-slate-800">
        ← {t("lesson.backToBrowse", { name: category.name })}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{node.title}</h1>

      <section className="mt-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">{t("group.subgroups")}</h2>
        <div className="mt-2">
          <HierarchyTreeView categoryId={categoryId} rootNodeId={nodeId} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">{t("group.cardsInGroup")}</h2>
        <div className="mt-2">
          <CardListSection categoryId={categoryId} lessonNodeId={nodeId} />
        </div>
      </section>
    </div>
  );
}
