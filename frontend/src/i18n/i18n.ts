import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import assistantEn from "@/i18n/locales/en/assistant.json";
import authEn from "@/i18n/locales/en/auth.json";
import cardsEn from "@/i18n/locales/en/cards.json";
import categoriesEn from "@/i18n/locales/en/categories.json";
import commonEn from "@/i18n/locales/en/common.json";
import createEn from "@/i18n/locales/en/create.json";
import hierarchyEn from "@/i18n/locales/en/hierarchy.json";
import notificationsEn from "@/i18n/locales/en/notifications.json";
import ocrEn from "@/i18n/locales/en/ocr.json";
import planEn from "@/i18n/locales/en/plan.json";
import progressionEn from "@/i18n/locales/en/progression.json";
import reviewEn from "@/i18n/locales/en/review.json";
import srsGuideEn from "@/i18n/locales/en/srsGuide.json";
import assistantFr from "@/i18n/locales/fr/assistant.json";
import authFr from "@/i18n/locales/fr/auth.json";
import cardsFr from "@/i18n/locales/fr/cards.json";
import categoriesFr from "@/i18n/locales/fr/categories.json";
import commonFr from "@/i18n/locales/fr/common.json";
import createFr from "@/i18n/locales/fr/create.json";
import hierarchyFr from "@/i18n/locales/fr/hierarchy.json";
import notificationsFr from "@/i18n/locales/fr/notifications.json";
import ocrFr from "@/i18n/locales/fr/ocr.json";
import planFr from "@/i18n/locales/fr/plan.json";
import progressionFr from "@/i18n/locales/fr/progression.json";
import reviewFr from "@/i18n/locales/fr/review.json";
import srsGuideFr from "@/i18n/locales/fr/srsGuide.json";

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
    srsGuide: srsGuideEn,
    assistant: assistantEn,
    ocr: ocrEn,
    create: createEn,
    plan: planEn,
    notifications: notificationsEn,
  },
  fr: {
    common: commonFr,
    auth: authFr,
    categories: categoriesFr,
    hierarchy: hierarchyFr,
    cards: cardsFr,
    review: reviewFr,
    progression: progressionFr,
    srsGuide: srsGuideFr,
    assistant: assistantFr,
    ocr: ocrFr,
    create: createFr,
    plan: planFr,
    notifications: notificationsFr,
  },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    defaultNS,
    ns: [
      "common",
      "auth",
      "categories",
      "hierarchy",
      "cards",
      "review",
      "progression",
      "srsGuide",
      "assistant",
      "ocr",
      "create",
      "plan",
      "notifications",
    ],
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
