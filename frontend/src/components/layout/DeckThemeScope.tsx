import type { CSSProperties, ReactNode } from "react";

import { deckThemeVars } from "@/lib/deckTheme";

// Wraps a deck's pages so `text-primary`/`bg-primary`/etc. classes anywhere
// inside pick up the deck's own color instead of the app default -- CSS
// custom properties cascade from whichever ancestor last set them, so this
// needs no changes to the components rendered inside. The gradient behind
// the content reuses the same "fade to transparent" idea as the global body
// background, just recolored and scoped to this section.
export function DeckThemeScope({ themeColor, children }: { themeColor: string | null; children: ReactNode }) {
  if (!themeColor) return <>{children}</>;

  const vars = deckThemeVars(themeColor);

  return (
    <div className="relative" style={vars as CSSProperties}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]"
        style={{
          background: "linear-gradient(180deg, rgb(var(--color-primary-light) / 0.7) 0%, transparent 100%)",
        }}
      />
      {children}
    </div>
  );
}
