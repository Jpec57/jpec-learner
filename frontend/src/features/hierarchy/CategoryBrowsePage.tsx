import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { getCategory } from "@/features/categories/api";
import { HierarchyTreeView } from "@/features/hierarchy/HierarchyTreeView";

export function CategoryBrowsePage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: () => getCategory(categoryId!),
    enabled: !!categoryId,
  });

  if (!categoryId || !category) return null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link to={`/categories/${categoryId}`} className="text-sm text-slate-500 hover:text-slate-800">
          ← {category.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Browse {category.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Build out your theme / section / lesson hierarchy. Cards and full lesson editing land in Phase 3.
        </p>
        <div className="mt-6">
          <HierarchyTreeView categoryId={categoryId} />
        </div>
      </div>
    </div>
  );
}
