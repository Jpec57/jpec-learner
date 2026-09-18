import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { Outlet, useParams } from "react-router-dom";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { AssistantChatPanel } from "@/features/assistant/AssistantChatPanel";
import { getCategory } from "@/features/categories/api";
import { deckThemeVars } from "@/lib/deckTheme";

// Replaces AppLayout for /categories/:categoryId/* routes so the deck's
// theme gradient can live on <main> itself. Nesting the gradient as a child
// further down (inside AppLayout's padded <main>) clipped it to the padded
// content box instead of the full-bleed strip the app-wide decorative blobs
// get -- putting it here, as main's own background, sidesteps that.
export function DeckLayout() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: () => getCategory(categoryId!),
    enabled: !!categoryId,
  });

  const themeColor = category?.theme_color ?? null;
  const vars = themeColor ? (deckThemeVars(themeColor) as CSSProperties) : undefined;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden" style={vars}>
      <Header />
      <main
        className="relative flex-1 px-4 py-8"
        style={
          themeColor
            ? { background: "linear-gradient(180deg, rgb(var(--color-primary-light) / 0.7) 0%, transparent 420px)" }
            : undefined
        }
      >
        <Outlet />
      </main>
      <Footer />
      <AssistantChatPanel categoryId={categoryId} />
    </div>
  );
}
