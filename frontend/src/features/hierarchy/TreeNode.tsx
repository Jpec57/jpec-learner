import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useConfirm } from "@/components/ui/useConfirm";
import { AddChildForm } from "@/features/hierarchy/AddChildForm";
import {
  createNode,
  deleteNode,
  listChildren,
  moveNode,
  updateNode,
  type HierarchyNode,
  type NodeKind,
} from "@/features/hierarchy/api";

function invalidateTree(queryClient: ReturnType<typeof useQueryClient>, categoryId: string) {
  return queryClient.invalidateQueries({ queryKey: ["hierarchy", categoryId] });
}

export function TreeNode({
  node,
  categoryId,
  movingNodeId,
  setMovingNodeId,
  onMoveError,
}: {
  node: HierarchyNode;
  categoryId: string;
  movingNodeId: string | null;
  setMovingNodeId: (id: string | null) => void;
  onMoveError: (message: string) => void;
}) {
  const { t } = useTranslation(["hierarchy", "common"]);
  const { confirm, dialog } = useConfirm();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState<NodeKind | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(node.title);

  const { data: children } = useQuery({
    queryKey: ["hierarchy", categoryId, node.id],
    queryFn: () => listChildren(categoryId, node.id),
    enabled: expanded,
  });

  const addChild = useMutation({
    mutationFn: (input: { title: string; body_markdown?: string }) =>
      createNode({
        category_id: categoryId,
        parent_id: node.id,
        node_kind: adding!,
        title: input.title,
        body_markdown: input.body_markdown,
      }),
    onSuccess: () => {
      setAdding(null);
      setExpanded(true);
      invalidateTree(queryClient, categoryId);
    },
  });

  const rename = useMutation({
    mutationFn: () => updateNode(node.id, { title: editTitle }),
    onSuccess: () => {
      setEditing(false);
      invalidateTree(queryClient, categoryId);
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteNode(node.id),
    onSuccess: () => invalidateTree(queryClient, categoryId),
  });

  const moveHere = useMutation({
    mutationFn: (targetParentId: string | null) => moveNode(movingNodeId!, { new_parent_id: targetParentId }),
    onSuccess: () => {
      setMovingNodeId(null);
      invalidateTree(queryClient, categoryId);
    },
    onError: () => {
      onMoveError(t("tree.moveError"));
      setMovingNodeId(null);
    },
  });

  const isBeingMoved = movingNodeId === node.id;
  const isMoveTarget = movingNodeId !== null && !isBeingMoved && node.node_kind === "group";

  return (
    <div className="border-l border-slate-100 pl-3">
      <div
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
          isBeingMoved ? "bg-primary-light" : "hover:bg-slate-50"
        }`}
      >
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

        {editing ? (
          <>
            <input
              autoFocus
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              className="rounded-md border border-slate-300 px-2 py-0.5 text-sm"
            />
            <button
              onClick={() => rename.mutate()}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t("common:actions.save")}
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:underline">
              {t("common:actions.cancel")}
            </button>
          </>
        ) : (
          node.node_kind === "lesson" ? (
            <Link
              to={`/categories/${categoryId}/lessons/${node.id}`}
              className="text-sm font-medium text-slate-800 hover:text-primary hover:underline"
            >
              {node.title}
            </Link>
          ) : (
            <span className="text-sm font-medium text-slate-800">{node.title}</span>
          )
        )}

        {node.is_public && (
          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            {t("common:status.public")}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isMoveTarget && (
            <button
              onClick={() => moveHere.mutate(node.id)}
              className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-white hover:bg-primary-dark"
            >
              {t("tree.moveHere")}
            </button>
          )}
          {!editing && !isBeingMoved && movingNodeId === null && (
            <>
              {node.node_kind === "group" && (
                <>
                  <button
                    onClick={() => {
                      setExpanded(true);
                      setAdding("group");
                    }}
                    className="text-xs text-slate-400 hover:text-primary"
                  >
                    {t("tree.addGroupChild")}
                  </button>
                  <button
                    onClick={() => {
                      setExpanded(true);
                      setAdding("lesson");
                    }}
                    className="text-xs text-slate-400 hover:text-primary"
                  >
                    {t("tree.addLessonChild")}
                  </button>
                </>
              )}
              <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-primary">
                {t("common:actions.rename")}
              </button>
              <button
                onClick={() => setMovingNodeId(node.id)}
                className="text-xs text-slate-400 hover:text-primary"
              >
                {t("tree.move")}
              </button>
              <button
                onClick={async () => {
                  if (await confirm(t("common:actions.delete"), t("tree.deleteConfirm", { title: node.title }))) {
                    remove.mutate();
                  }
                }}
                className="text-xs text-slate-400 hover:text-red-600"
              >
                {t("common:actions.delete")}
              </button>
            </>
          )}
          {isBeingMoved && (
            <button onClick={() => setMovingNodeId(null)} className="text-xs text-primary hover:underline">
              {t("tree.cancelMove")}
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div className="ml-6">
          <AddChildForm
            kind={adding}
            onSubmit={(input) => addChild.mutateAsync(input)}
            onCancel={() => setAdding(null)}
          />
        </div>
      )}

      {expanded && (
        <div className="ml-2">
          {children?.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              categoryId={categoryId}
              movingNodeId={movingNodeId}
              setMovingNodeId={setMovingNodeId}
              onMoveError={onMoveError}
            />
          ))}
          {children?.length === 0 && !adding && (
            <p className="py-1 pl-6 text-xs text-slate-400">{t("tree.empty")}</p>
          )}
        </div>
      )}
      {dialog}
    </div>
  );
}
