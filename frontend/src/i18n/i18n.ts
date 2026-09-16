import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import authEn from "@/i18n/locales/en/auth.json";
import cardsEn from "@/i18n/locales/en/cards.json";
import categoriesEn from "@/i18n/locales/en/categories.json";
import commonEn from "@/i18n/locales/en/common.json";
import hierarchyEn from "@/i18n/locales/en/hierarchy.json";
import progressionEn from "@/i18n/locales/en/progression.json";
import reviewEn from "@/i18n/locales/en/review.json";
import authFr from "@/i18n/locales/fr/auth.json";
import cardsFr from "@/i18n/locales/fr/cards.json";
import categoriesFr from "@/i18n/locales/fr/categories.json";
import commonFr from "@/i18n/locales/fr/common.json";
import hierarchyFr from "@/i18n/locales/fr/hierarchy.json";
import progressionFr from "@/i18n/locales/fr/progression.json";
import reviewFr from "@/i18n/locales/fr/review.json";

export const defaultNS = "common";

export const resources = {
  en: {
    common: commonEn,
    auth: authEn,
    categories: categoriesEn,
    hierarchy: hierarchyEn,
    cards: cardsEn,
    review: reviewEn,
    progression: progressionEn,
  },
  fr: {
    common: commonFr,
    auth: authFr,
    categories: categoriesFr,
    hierarchy: hierarchyFr,
    cards: cardsFr,
    review: reviewFr,
    progression: progressionFr,
  },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    defaultNS,
    ns: ["common", "auth", "categories", "hierarchy", "cards", "review", "progression"],
    interpolation: { escapeValue: false },
    detection: {
      // Once the user's profile loads, App.tsx calls i18n.changeLanguage(user.locale)
      // and that write-through updates this same localStorage key, so it becomes
      // the source of truth on every later load without waiting on the network.
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "jpeclearner.locale",
      caches: ["localStorage"],
    },
  });

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
