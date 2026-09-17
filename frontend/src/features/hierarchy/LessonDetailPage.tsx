import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { CardListSection } from "@/features/cards/CardListSection";
import { getCategory } from "@/features/categories/api";
import { getNode, updateNode } from "@/features/hierarchy/api";
import { NodeBreadcrumb } from "@/features/hierarchy/NodeBreadcrumb";
import { ImageUploadInput } from "@/features/images/ImageUploadInput";

type EditorView = "edit" | "preview";

export function LessonDetailPage() {
  const { t } = useTranslation(["hierarchy", "common"]);
  const { categoryId, nodeId } = useParams<{ categoryId: string; nodeId: string }>();
  const queryClient = useQueryClient();
  const [body, setBody] = useState<string | null>(null);
  const [view, setView] = useState<EditorView>("edit");

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

  const savedBody = node.body_markdown ?? "";
  const currentBody = body ?? savedBody;
  const isDirty = currentBody !== savedBody;

  return (
    <div className="mx-auto max-w-3xl">
      <NodeBreadcrumb
        categoryId={categoryId}
        categoryName={category.name}
        ancestors={node.ancestors}
        currentTitle={node.title}
      />
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{node.title}</h1>

      <section className="mt-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">{t("lesson.content")}</h2>

        <div className="mt-2 flex gap-1 lg:hidden">
          <button
            onClick={() => setView("edit")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              view === "edit" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {t("lesson.editTab")}
          </button>
          <button
            onClick={() => setView("preview")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              view === "preview" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {t("lesson.previewTab")}
          </button>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <textarea
            value={currentBody}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            placeholder={t("lesson.contentPlaceholder")}
            className={`w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm ${
              view === "preview" ? "hidden lg:block" : ""
            }`}
          />
          <div
            className={`rounded-lg border border-slate-200 bg-white p-3 ${
              view === "edit" ? "hidden lg:block" : ""
            }`}
          >
            {currentBody.trim() ? (
              <MarkdownContent markdown={currentBody} />
            ) : (
              <p className="text-sm text-slate-400">{t("lesson.previewEmpty")}</p>
            )}
          </div>
        </div>

        {isDirty && (
          <button
            onClick={() => saveBody.mutate(currentBody)}
            disabled={saveBody.isPending}
            className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {t("lesson.saveContent")}
          </button>
        )}
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
