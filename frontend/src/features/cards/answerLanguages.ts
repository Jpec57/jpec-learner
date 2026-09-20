import { DECK_LANGUAGES } from "@/features/cards/deckLanguages";

export interface AnswerLanguageOption {
  code: string;
  flag: string;
  label: string;
}

// Deliberately a flat list of (language, script) pairs rather than two
// separate fields -- for Japanese specifically, the *script* (kanji vs
// hiragana vs katakana vs romaji) matters as much as the language, since a
// vocab card's answer is expected in exactly one of them.
export const ANSWER_LANGUAGE_OPTIONS: AnswerLanguageOption[] = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "ja-kanji", flag: "🇯🇵", label: "Kanji" },
  { code: "ja-hiragana", flag: "🇯🇵", label: "Hiragana" },
  { code: "ja-katakana", flag: "🇯🇵", label: "Katakana" },
  { code: "ja-romaji", flag: "🇯🇵", label: "Rōmaji" },
];

// A language deck stores its plain target language ("ja", "es") as the answer
// language, so those display too -- script-specific entries win on a clash.
const BY_CODE = new Map<string, AnswerLanguageOption>([
  ...DECK_LANGUAGES.map((language): [string, AnswerLanguageOption] => [language.code, language]),
  ...ANSWER_LANGUAGE_OPTIONS.map((option): [string, AnswerLanguageOption] => [option.code, option]),
]);

export function answerLanguageDisplay(code: string): AnswerLanguageOption {
  return BY_CODE.get(code) ?? { code, flag: "🏳️", label: code };
}
