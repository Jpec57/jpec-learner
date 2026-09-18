import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { CardRow } from "@/features/cards/CardListSection";
import { LanguageSelect } from "@/features/cards/LanguageSelect";
import { listCards } from "@/features/cards/api";
import { getCategory } from "@/features/categories/api";
import { listFlat, searchLessons, type FlatHierarchyNode } from "@/features/hierarchy/api";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

type SearchMode = "cards" | "lessons";

function groupNodeHref(categoryId: string, node: FlatHierarchyNode): string {
  return node.node_kind === "lesson"
    ? `/categories/${categoryId}/lessons/${node.id}`
    : `/categories/${categoryId}/groups/${node.id}`;
}

function CardResults({
  categoryId,
  search,
  page,
  setPage,
}: {
  categoryId: string;
  search: string;
  page: number;
  setPage: (updater: (p: number) => number) => void;
}) {
  const { t } = useTranslation(["cards", "common"]);
  const [answerLanguage, setAnswerLanguage] = useState("");

  const { data: flatNodes } = useQuery({
    queryKey: ["hierarchyFlat", categoryId],
    queryFn: () => listFlat(categoryId),
  });
  const nodesById = new Map((flatNodes ?? []).map((node) => [node.id, node]));

  const { data } = useQuery({
    queryKey: ["cards", categoryId, "search", search, answerLanguage, page],
    queryFn: () =>
      listCards({
        categoryId,
        owner: "me",
        search,
        answerLanguage,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });
  const cards = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min(total, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <>
      <div className="mt-3">
        <LanguageSelect
          value={answerLanguage}
          onChange={(value) => {
            setAnswerLanguage(value);
            setPage(() => 0);
          }}
          placeholder={t("search.allLanguages")}
        />
      </div>

      <div className="mt-4 space-y-3">
        {cards.map((card) => {
          const node = card.lesson_node_id ? nodesById.get(card.lesson_node_id) : undefined;
          const href = node
            ? `${groupNodeHref(categoryId, node)}?cardQuery=${encodeURIComponent(card.front_text)}`
            : undefined;
          return (
            <CardRow
              key={card.id}
              card={card}
              categoryId={categoryId}
              nodeInfo={node && href ? { title: node.title, href } : undefined}
            />
          );
        })}
        {total === 0 && <p className="text-sm text-slate-400">{t("noSearchResults")}</p>}

        {total > PAGE_SIZE && (
          <PaginationBar pageStart={pageStart} pageEnd={pageEnd} total={total} page={page} setPage={setPage} />
        )}
      </div>
    </>
  );
}

function LessonResults({
  categoryId,
  search,
  page,
  setPage,
}: {
  categoryId: string;
  search: string;
  page: number;
  setPage: (updater: (p: number) => number) => void;
}) {
  const { t } = useTranslation(["hierarchy", "common"]);

  const { data } = useQuery({
    queryKey: ["hierarchy", categoryId, "search", search, page],
    queryFn: () => searchLessons({ categoryId, search, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const lessons = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min(total, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="mt-4 space-y-3">
      {lessons.map((lesson) => (
        <Link
          key={lesson.id}
          to={`/categories/${categoryId}/lessons/${lesson.id}`}
          className="block rounded-lg border border-slate-200 p-3 hover:border-primary/50"
        >
          <p className="text-sm font-medium text-slate-800">{lesson.title}</p>
          {lesson.ancestors.length > 0 && (
            <p className="mt-0.5 text-xs text-slate-400">
              {lesson.ancestors.map((ancestor) => ancestor.title).join(" › ")}
            </p>
          )}
          {lesson.description && <p className="mt-1 text-xs text-slate-500">{lesson.description}</p>}
        </Link>
      ))}
      {total === 0 && <p className="text-sm text-slate-400">{t("hierarchy:search.noResults")}</p>}

      {total > PAGE_SIZE && (
        <PaginationBar pageStart={pageStart} pageEnd={pageEnd} total={total} page={page} setPage={setPage} />
      )}
    </div>
  );
}

function PaginationBar({
  pageStart,
  pageEnd,
  total,
  page,
  setPage,
}: {
  pageStart: number;
  pageEnd: number;
  total: number;
  page: number;
  setPage: (updater: (p: number) => number) => void;
}) {
  const { t } = useTranslation("cards");
  return (
    <div className="flex items-center justify-between text-xs text-slate-500">
      <span>{t("pageRange", { start: pageStart, end: pageEnd, total })}</span>
      <div className="flex gap-2">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="rounded-md px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
        >
          {t("common:pagination.previous")}
        </button>
        <button
          onClick={() => setPage((p) => (pageEnd < total ? p + 1 : p))}
          disabled={pageEnd >= total}
          className="rounded-md px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
        >
          {t("common:pagination.next")}
        </button>
      </div>
    </div>
  );
}

export function CardSearchPage() {
  const { t } = useTranslation(["cards", "hierarchy", "common"]);
  const { categoryId } = useParams<{ categoryId: string }>();
  const [mode, setMode] = useState<SearchMode>("cards");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: () => getCategory(categoryId!),
    enabled: !!categoryId,
  });

  if (!categoryId || !category) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={`/categories/${categoryId}`} className="text-sm text-slate-500 hover:text-slate-800">
        ← {category.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{t("search.title")}</h1>

      <div className="mt-4 flex gap-1">
        <button
          onClick={() => {
            setMode("cards");
            setPage(0);
          }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            mode === "cards" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          {t("search.modeCards")}
        </button>
        <button
          onClick={() => {
            setMode("lessons");
            setPage(0);
          }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            mode === "lessons" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          {t("search.modeLessons")}
        </button>
      </div>

      <input
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder={mode === "cards" ? t("searchPlaceholder") : t("hierarchy:search.placeholder")}
        className="mt-3 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />

      {mode === "cards" ? (
        <CardResults categoryId={categoryId} search={search} page={page} setPage={setPage} />
      ) : (
        <LessonResults categoryId={categoryId} search={search} page={page} setPage={setPage} />
      )}
    </div>
  );
}
