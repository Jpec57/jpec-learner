import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { me } from "@/features/auth/api";
import { useAuthStore } from "@/lib/authStore";

export function Header() {
  const { t } = useTranslation("common");
  const clearTokens = useAuthStore((state) => state.clearTokens);
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: me });

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="text-xl">📚</span>
          <span>{t("appName")}</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
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
      </div>
    </header>
  );
}
