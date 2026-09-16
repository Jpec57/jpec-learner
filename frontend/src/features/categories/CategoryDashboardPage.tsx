import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useConfirm } from "@/components/ui/useConfirm";
import { deleteCategory, getCategory, updateCategory, type Category } from "@/features/categories/api";
import { IconPicker } from "@/features/categories/IconPicker";
import { getProgression } from "@/features/progression/api";
import { StreakIndicator } from "@/features/progression/StreakIndicator";
import { getErrorMessage } from "@/lib/errors";

function EditCategoryForm({ category, onDone }: { category: Category; onDone: () => void }) {
  const { t } = useTranslation(["categories", "common"]);
  const queryClient = useQueryClient();
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon ?? "📚");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => updateCategory(category.id, { name, icon }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["category", category.id] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      onDone();
    },
    onError: (err) => setError(getErrorMessage(err, t("common:errors.generic"))),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    save.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-xl border border-primary/30 bg-white p-4">
      <input
        autoFocus
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <IconPicker value={icon} onChange={setIcon} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {t("common:actions.save")}
        </button>
        <button type="button" onClick={onDone} className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">
          {t("common:actions.cancel")}
        </button>
      </div>
    </form>
  );
}

export function CategoryDashboardPage() {
  const { t } = useTranslation(["categories", "common"]);
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState(false);

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
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
        ← {t("common:nav.allCategories")}
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-3xl">
            {category.icon ?? "📚"}
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{category.name}</h1>
            <p className="text-sm text-slate-400">/{category.slug}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            {t("common:actions.edit")}
          </button>
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

      {editing && <EditCategoryForm category={category} onDone={() => setEditing(false)} />}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          to={`/categories/${category.id}/browse`}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
        >
          <h3 className="font-semibold text-slate-900">{t("categories:dashboard.browse.title")}</h3>
          <p className="mt-1 text-sm text-slate-500">{t("categories:dashboard.browse.subtitle")}</p>
        </Link>
        <Link
          to={`/categories/${category.id}/review`}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">{t("categories:dashboard.review.title")}</h3>
            {!!progression?.total_due && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
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
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
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
      {dialog}
    </div>
  );
}
