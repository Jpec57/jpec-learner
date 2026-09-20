import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation("common");
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white/70 py-6 text-center">
      <p className="text-xs text-slate-400">{t("footer.tagline")}</p>
      <p className="mt-1 text-xs text-slate-300">© {new Date().getFullYear()} JpecLearner / ETM</p>
    </footer>
  );
}
