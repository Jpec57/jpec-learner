import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AddChildForm } from "@/features/hierarchy/AddChildForm";
import { createNode, listChildren, moveNode, type NodeKind } from "@/features/hierarchy/api";
import { TreeNode } from "@/features/hierarchy/TreeNode";
import { getErrorMessage } from "@/lib/errors";

export function HierarchyTreeView({
  categoryId,
  rootNodeId = null,
}: {
  categoryId: string;
  rootNodeId?: string | null;
}) {
  const { t } = useTranslation("hierarchy");
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<NodeKind | null>(null);
  const [movingNodeId, setMovingNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: roots } = useQuery({
    queryKey: ["hierarchy", categoryId, rootNodeId],
    queryFn: () => listChildren(categoryId, rootNodeId),
  });

  const addRoot = useMutation({
    mutationFn: (input: { title: string; body_markdown?: string }) =>
      createNode({
        category_id: categoryId,
        parent_id: rootNodeId,
        node_kind: adding!,
        title: input.title,
        body_markdown: input.body_markdown,
      }),
    onSuccess: () => {
      setAdding(null);
      queryClient.invalidateQueries({ queryKey: ["hierarchy", categoryId] });
    },
    onError: (err) => setError(getErrorMessage(err, t("common:errors.generic"))),
  });

  const moveToRoot = useMutation({
    mutationFn: () => moveNode(movingNodeId!, { new_parent_id: rootNodeId }),
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

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        {roots?.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            categoryId={categoryId}
            movingNodeId={movingNodeId}
            setMovingNodeId={setMovingNodeId}
            onMoveError={setError}
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
