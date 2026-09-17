import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import type { Ancestor } from "@/features/hierarchy/api";

export function NodeBreadcrumb({
  categoryId,
  categoryName,
  ancestors,
  currentTitle,
}: {
  categoryId: string;
  categoryName: string;
  ancestors: Ancestor[];
  currentTitle: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
      <Link to={`/categories/${categoryId}/browse`} className="hover:text-primary hover:underline">
        {categoryName}
      </Link>
      {ancestors.map((ancestor) => (
        <span key={ancestor.id} className="flex items-center gap-1">
          <ChevronRight size={14} className="text-slate-300" />
          <Link
            to={`/categories/${categoryId}/groups/${ancestor.id}`}
            className="hover:text-primary hover:underline"
          >
            {ancestor.title}
          </Link>
        </span>
      ))}
      <span className="flex items-center gap-1">
        <ChevronRight size={14} className="text-slate-300" />
        <span className="font-medium text-slate-700">{currentTitle}</span>
      </span>
    </div>
  );
}
