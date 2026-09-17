import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { me } from "@/features/auth/api";
import { createCategory, listCategories, type Category } from "@/features/categories/api";
import { DEFAULT_CATEGORY_ICON } from "@/features/categories/iconOptions";
import { IconPicker } from "@/features/categories/IconPicker";
import { ThemeColorPicker } from "@/features/categories/ThemeColorPicker";
import { DueBanner } from "@/features/notifications/DueBanner";

function CategoryCard({ category, mine }: { category: Category; mine: boolean }) {
  const { t } = useTranslation(["categories", "common"]);
  return (
    <Link
      to={`/categories/${category.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-light text-2xl">
          {category.icon ?? "📚"}
        </span>
        <div className="flex items-center gap-2">
          {category.due_count > 0 && (
            <span
              className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white"
              title={t("categories:picker.dueCount", { count: category.due_count })}
            >
              {category.due_count}
            </span>
          )}
          {category.is_public && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {t("common:status.public")}
            </span>
          )}
        </div>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-slate-900">{category.name}</h3>
      {!mine && <p className="mt-1 text-xs text-slate-400">{t("categories:picker.sharedCategory")}</p>}
    </Link>
  );
}

function CreateCategoryForm() {
  const { t } = useTranslation(["categories", "common"]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(DEFAULT_CATEGORY_ICON);
  const [themeColor, setThemeColor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createCategory({ name, icon, theme_color: themeColor });
      setName("");
      setIcon(DEFAULT_CATEGORY_ICON);
      setThemeColor(null);
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["categories", "mine"] });
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex h-full min-h-[110px] w-full items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-primary/50 hover:text-primary-dark"
      >
        {t("categories:picker.newCategory")}
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-full flex-col justify-between gap-3 rounded-xl border border-primary/30 bg-white p-4 shadow-sm"
    >
      <div className="space-y-3">
        <input
          autoFocus
          required
          placeholder={t("categories:picker.namePlaceholder")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <IconPicker value={icon} onChange={setIcon} />
        <ThemeColorPicker value={themeColor} onChange={setThemeColor} />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {t("common:actions.create")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
        >
          {t("common:actions.cancel")}
        </button>
      </div>
    </form>
  );
}

export function CategoryPickerPage() {
  const { t } = useTranslation(["categories", "common"]);
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: me });
  const { data: mine } = useQuery({ queryKey: ["categories", "mine"], queryFn: () => listCategories("mine") });
  const { data: publicCategories } = useQuery({
    queryKey: ["categories", "public"],
    queryFn: () => listCategories("public"),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">
        {user
          ? t("categories:picker.welcomeBack", { name: user.display_name ?? user.email })
          : t("common:appName")}
      </h1>

      <div className="mt-6">
        <DueBanner />
      </div>

      <h2 className="mt-2 text-sm font-medium uppercase tracking-wide text-slate-400">
        {t("categories:picker.yourCategories")}
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {mine?.map((category) => (
          <CategoryCard key={category.id} category={category} mine />
        ))}
        <CreateCategoryForm />
      </div>

      {publicCategories && publicCategories.length > 0 && (
        <>
          <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-slate-400">
            {t("categories:picker.publicFromOthers")}
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {publicCategories.map((category) => (
              <CategoryCard key={category.id} category={category} mine={false} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
