import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useConfirm } from "@/components/ui/useConfirm";
import { deleteCategory, getCategory, updateCategory } from "@/features/categories/api";
import { getProgression } from "@/features/progression/api";
import { StreakIndicator } from "@/features/progression/StreakIndicator";

export function CategoryDashboardPage() {
  const { t } = useTranslation(["categories", "common"]);
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: () => getCategory(categoryId!),
    enabled: !!categoryId,
  });

  const { data: progression } = useQuery({
    queryKey: ["progression", categoryId],
    queryFn: () => getProgression(categoryId!),
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
          ← {t("common:nav.allCategories")}
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
              {category.is_public
                ? t("categories:dashboard.makePrivate")
                : t("categories:dashboard.makePublic")}
            </button>
            <button
              onClick={async () => {
                if (await confirm(t("common:actions.delete"), t("categories:dashboard.deleteConfirm", { name: category.name }))) {
                  remove.mutate();
                }
              }}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              {t("common:actions.delete")}
            </button>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            to={`/categories/${category.id}/browse`}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-300"
          >
            <h3 className="font-semibold text-slate-900">{t("categories:dashboard.browse.title")}</h3>
            <p className="mt-1 text-sm text-slate-500">{t("categories:dashboard.browse.subtitle")}</p>
          </Link>
          <Link
            to={`/categories/${category.id}/review`}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-300"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{t("categories:dashboard.review.title")}</h3>
              {!!progression?.total_due && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {progression.total_due}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {progression?.total_due
                ? t("categories:dashboard.review.dueNow", { count: progression.total_due })
                : t("categories:dashboard.review.nothingDue")}
            </p>
          </Link>
          <Link
            to={`/categories/${category.id}/progression`}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-300"
          >
            <h3 className="font-semibold text-slate-900">{t("categories:dashboard.progression.title")}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {progression
                ? t("categories:dashboard.progression.itemsTracked", { count: progression.total_items })
                : "…"}
            </p>
          </Link>
        </div>

        {progression && (
          <div className="mt-4">
            <StreakIndicator days={progression.streak_days} />
          </div>
        )}
      </div>
      {dialog}
    </div>
  );
}
