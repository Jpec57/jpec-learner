import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { CardListSection } from "@/features/cards/CardListSection";
import { getCategory } from "@/features/categories/api";
import { getNode, updateNode } from "@/features/hierarchy/api";
import { ImageUploadInput } from "@/features/images/ImageUploadInput";

export function LessonDetailPage() {
  const { t } = useTranslation(["hierarchy", "common"]);
  const { categoryId, nodeId } = useParams<{ categoryId: string; nodeId: string }>();
  const queryClient = useQueryClient();
  const [body, setBody] = useState<string | null>(null);

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

  const saveBody = useMutation({
    mutationFn: (value: string) => updateNode(nodeId!, { body_markdown: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hierarchyNode", nodeId] }),
  });

  if (!categoryId || !nodeId || !category || !node) return null;

  const currentBody = body ?? node.body_markdown ?? "";

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={`/categories/${categoryId}/browse`} className="text-sm text-slate-500 hover:text-slate-800">
        ← {t("lesson.backToBrowse", { name: category.name })}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{node.title}</h1>

      <section className="mt-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">{t("lesson.content")}</h2>
        <textarea
          value={currentBody}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder={t("lesson.contentPlaceholder")}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm"
        />
        <button
          onClick={() => saveBody.mutate(currentBody)}
          disabled={saveBody.isPending}
          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {t("lesson.saveContent")}
        </button>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">{t("lesson.images")}</h2>
        <div className="mt-2">
          <ImageUploadInput
            images={node.images ?? []}
            target={{ lesson_node_id: nodeId }}
            onChange={() => queryClient.invalidateQueries({ queryKey: ["hierarchyNode", nodeId] })}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
          {t("lesson.cardsInLesson")}
        </h2>
        <div className="mt-2">
          <CardListSection categoryId={categoryId} lessonNodeId={nodeId} />
        </div>
      </section>
    </div>
  );
}
