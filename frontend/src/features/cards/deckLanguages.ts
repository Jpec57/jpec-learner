export interface DeckLanguage {
  code: string;
  flag: string;
  label: string;
}

// Plain ISO 639-1 languages for a language deck's source/target -- the
// translation services work on these (a card's answer *script*, e.g.
// "ja-romaji", is a separate, finer setting; see answerLanguages.ts).
export const DECK_LANGUAGES: DeckLanguage[] = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "pt", flag: "🇵🇹", label: "Português" },
  { code: "nl", flag: "🇳🇱", label: "Nederlands" },
  { code: "ru", flag: "🇷🇺", label: "Русский" },
  { code: "zh", flag: "🇨🇳", label: "中文" },
  { code: "ko", flag: "🇰🇷", label: "한국어" },
  { code: "ar", flag: "🇸🇦", label: "العربية" },
];
