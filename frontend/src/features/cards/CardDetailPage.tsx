import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import { CardRow } from "@/features/cards/CardListSection";
import { getCard } from "@/features/cards/api";
import { getNode } from "@/features/hierarchy/api";

export function CardDetailPage() {
  const { t } = useTranslation("cards");
  const { categoryId, cardId } = useParams<{ categoryId: string; cardId: string }>();
  const navigate = useNavigate();

  // Nested under ["cards", categoryId] so CardRow's invalidation refreshes it.
  const { data: card, isError } = useQuery({
    queryKey: ["cards", categoryId, "detail", cardId],
    queryFn: () => getCard(cardId!),
    enabled: !!cardId,
  });

  const { data: node } = useQuery({
    queryKey: ["hierarchyNode", card?.lesson_node_id],
    queryFn: () => getNode(card!.lesson_node_id!),
    enabled: !!card?.lesson_node_id,
  });

  if (!categoryId || !cardId) return null;
  if (isError) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <p className="text-sm text-slate-500">{t("detail.notFound")}</p>
        <Link to={`/categories/${categoryId}`} className="text-sm text-primary hover:underline">
          {t("detail.back")}
        </Link>
      </div>
    );
  }
  if (!card) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4">
      <button onClick={() => navigate(-1)} className="text-xs text-slate-400 hover:text-primary">
        ← {t("detail.back")}
      </button>
      <CardRow
        standalone
        card={card}
        categoryId={categoryId}
        nodeInfo={
          node ? { title: node.title, href: `/categories/${categoryId}/lessons/${node.id}` } : undefined
        }
        onDeleted={() => navigate(`/categories/${categoryId}`, { replace: true })}
      />
    </div>
  );
}
