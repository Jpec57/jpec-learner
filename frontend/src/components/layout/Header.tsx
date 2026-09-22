import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { me } from "@/features/auth/api";
import { useAuthStore } from "@/lib/authStore";

export function Header() {
  const { t } = useTranslation("common");
  const clearTokens = useAuthStore((state) => state.clearTokens);
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: me });
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="text-xl">📚</span>
          <span>{t("appName")}</span>
        </Link>

        <nav className="hidden items-center gap-4 text-sm sm:flex">
          {user && (
            <span className="hidden text-slate-500 sm:inline">{user.display_name ?? user.email}</span>
          )}
          <Link to="/srs-guide" className="text-slate-500 hover:text-primary">
            {t("nav.srsGuide")}
          </Link>
          <Link to="/settings" className="text-slate-500 hover:text-primary">
            {t("nav.settings")}
          </Link>
          <button onClick={() => clearTokens()} className="text-slate-500 hover:text-primary">
            {t("nav.logOut")}
          </button>
        </nav>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label={t("nav.menu")}
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 sm:hidden"
        >
          {menuOpen ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      {menuOpen && (
        <nav className="flex flex-col gap-1 border-t border-slate-200/80 bg-white px-4 py-3 text-sm sm:hidden">
          {user && (
            <span className="px-1 py-1 text-slate-500">{user.display_name ?? user.email}</span>
          )}
          <Link
            to="/srs-guide"
            onClick={() => setMenuOpen(false)}
            className="rounded-md px-1 py-2 text-slate-600 hover:bg-slate-100 hover:text-primary"
          >
            {t("nav.srsGuide")}
          </Link>
          <Link
            to="/settings"
            onClick={() => setMenuOpen(false)}
            className="rounded-md px-1 py-2 text-slate-600 hover:bg-slate-100 hover:text-primary"
          >
            {t("nav.settings")}
          </Link>
          <button
            onClick={() => {
              setMenuOpen(false);
              clearTokens();
            }}
            className="rounded-md px-1 py-2 text-left text-slate-600 hover:bg-slate-100 hover:text-primary"
          >
            {t("nav.logOut")}
          </button>
        </nav>
      )}
    </header>
  );
}
