import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listChildren } from "@/features/hierarchy/api";
import { ProgressionTreeNode } from "@/features/progression/ProgressionTreeNode";

export function ProgressionTree({ categoryId }: { categoryId: string }) {
  const { t } = useTranslation("hierarchy");
  const { data: roots } = useQuery({
    queryKey: ["hierarchy", categoryId, null],
    queryFn: () => listChildren(categoryId, null),
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      {roots?.map((node) => (
        <ProgressionTreeNode key={node.id} node={node} categoryId={categoryId} />
      ))}
      {roots?.length === 0 && <p className="py-2 text-sm text-slate-400">{t("browse.noThemes")}</p>}
    </div>
  );
}
