import { useQuery } from "@tanstack/react-query";
import { Outlet, useParams } from "react-router-dom";

import { DeckThemeScope } from "@/components/layout/DeckThemeScope";
import { getCategory } from "@/features/categories/api";

export function CategoryLayout() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: () => getCategory(categoryId!),
    enabled: !!categoryId,
  });

  return (
    <DeckThemeScope themeColor={category?.theme_color ?? null}>
      <Outlet />
    </DeckThemeScope>
  );
}
