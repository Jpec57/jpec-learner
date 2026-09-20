import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { getNodeProgression } from "@/features/progression/api";

// Shown next to a group/lesson title only when something under it is due, and
// opens the review page already scoped to that node.
export function NodeReviewButton({ categoryId, nodeId }: { categoryId: string; nodeId: string }) {
  const { t } = useTranslation("hierarchy");
  const { data: progress } = useQuery({
    queryKey: ["nodeProgression", nodeId],
    queryFn: () => getNodeProgression(nodeId),
  });

  if (!progress || progress.due_count <= 0) return null;

  return (
    <Link
      to={`/categories/${categoryId}/review?node=${nodeId}`}
      className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
    >
      {t("node.review", { count: progress.due_count })}
    </Link>
  );
}
