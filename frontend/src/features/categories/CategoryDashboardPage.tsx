import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { deleteCategory, getCategory, updateCategory } from "@/features/categories/api";
import { getDue } from "@/features/reviews/api";

export function CategoryDashboardPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: () => getCategory(categoryId!),
    enabled: !!categoryId,
  });

  const { data: due } = useQuery({
    queryKey: ["reviewsDue", categoryId],
    queryFn: () => getDue(categoryId!),
    enabled: !!categoryId,
  });

  const togglePublic = useMutation({
    mutationFn: () => updateCategory(categoryId!, { is_public: !category?.is_public }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["category", categoryId] }),
  });

  const remove = useMutation({
    mutationFn: () => deleteCategory(categoryId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      navigate("/");
    },
  });

  if (!category) return null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← All categories
        </Link>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{category.icon ?? "📚"}</span>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{category.name}</h1>
              <p className="text-sm text-slate-400">/{category.slug}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => togglePublic.mutate()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              {category.is_public ? "Make private" : "Make public"}
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete "${category.name}"? This can't be undone from the UI yet.`)) {
                  remove.mutate();
                }
              }}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            to={`/categories/${category.id}/browse`}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-300"
          >
            <h3 className="font-semibold text-slate-900">Browse</h3>
            <p className="mt-1 text-sm text-slate-500">Themes, sections and lessons</p>
          </Link>
          <Link
            to={`/categories/${category.id}/review`}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-300"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Review</h3>
              {!!due?.length && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {due.length}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {due?.length ? `${due.length} due now` : "Nothing due right now"}
            </p>
          </Link>
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 opacity-60">
            <h3 className="font-semibold text-slate-900">Progression</h3>
            <p className="mt-1 text-sm text-slate-500">Coming in Phase 5</p>
          </div>
        </div>
      </div>
    </div>
  );
}
