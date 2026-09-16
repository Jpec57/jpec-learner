import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AddChildForm } from "@/features/hierarchy/AddChildForm";
import { createNode, listChildren, moveNode, type NodeKind } from "@/features/hierarchy/api";
import { TreeNode } from "@/features/hierarchy/TreeNode";
import { getErrorMessage } from "@/lib/errors";

export function HierarchyTreeView({ categoryId }: { categoryId: string }) {
  const { t } = useTranslation("hierarchy");
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<NodeKind | null>(null);
  const [movingNodeId, setMovingNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [browsePath, setBrowsePath] = useState<{ id: string; title: string }[]>([]);
  const currentParentId = browsePath.length > 0 ? browsePath[browsePath.length - 1].id : null;

  const { data: roots } = useQuery({
    queryKey: ["hierarchy", categoryId, currentParentId],
    queryFn: () => listChildren(categoryId, currentParentId),
  });

  const addRoot = useMutation({
    mutationFn: (input: { title: string; body_markdown?: string }) =>
      createNode({
        category_id: categoryId,
        parent_id: currentParentId,
        node_kind: adding!,
        title: input.title,
        body_markdown: input.body_markdown,
      }),
    onSuccess: () => {
      setAdding(null);
      queryClient.invalidateQueries({ queryKey: ["hierarchy", categoryId] });
    },
  });

  const moveToRoot = useMutation({
    mutationFn: () => moveNode(movingNodeId!, { new_parent_id: null }),
    onSuccess: () => {
      setMovingNodeId(null);
      queryClient.invalidateQueries({ queryKey: ["hierarchy", categoryId] });
    },
    onError: (err) => {
      setError(getErrorMessage(err, t("tree.moveError")));
      setMovingNodeId(null);
    },
  });

  return (
    <div>
      {movingNodeId && (
        <div className="mb-3 flex items-center justify-between rounded-md bg-primary-light px-3 py-2 text-sm text-primary-dark">
          <span>{t("tree.moveInstructions")}</span>
          <div className="flex gap-3">
            <button onClick={() => moveToRoot.mutate()} className="font-medium hover:underline">
              {t("tree.moveToTopLevel")}
            </button>
            <button onClick={() => setMovingNodeId(null)} className="hover:underline">
              {t("common:actions.cancel")}
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}{" "}
          <button onClick={() => setError(null)} className="ml-2 underline">
            {t("tree.dismiss")}
          </button>
        </div>
      )}

      {browsePath.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1 text-sm text-slate-500">
          <button onClick={() => setBrowsePath([])} className="hover:text-primary hover:underline">
            {t("browse.root")}
          </button>
          {browsePath.map((crumb, index) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <ChevronRight size={14} className="text-slate-300" />
              {index === browsePath.length - 1 ? (
                <span className="font-medium text-slate-700">{crumb.title}</span>
              ) : (
                <button
                  onClick={() => setBrowsePath(browsePath.slice(0, index + 1))}
                  className="hover:text-primary hover:underline"
                >
                  {crumb.title}
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        {roots?.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            categoryId={categoryId}
            movingNodeId={movingNodeId}
            setMovingNodeId={setMovingNodeId}
            onMoveError={setError}
            onBrowseFrom={(id, title) => setBrowsePath([...browsePath, { id, title }])}
          />
        ))}
        {roots?.length === 0 && !adding && (
          <p className="py-2 text-sm text-slate-400">{t("browse.noThemes")}</p>
        )}

        {adding ? (
          <AddChildForm kind={adding} onSubmit={(input) => addRoot.mutateAsync(input)} onCancel={() => setAdding(null)} />
        ) : (
          <div className="mt-2 flex gap-3">
            <button onClick={() => setAdding("group")} className="text-sm text-primary hover:underline">
              {t("browse.addGroup")}
            </button>
            <button onClick={() => setAdding("lesson")} className="text-sm text-primary hover:underline">
              {t("browse.addLesson")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
