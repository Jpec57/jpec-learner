import { stripFurigana } from "@/lib/furigana";
import { classifyAnswer, type AnswerVerdict } from "@/lib/textMatch";

// A typed card's explicit accepted answers are the complete set of typeable
// answers -- back_text is then display-only context (markdown) that need not
// be typed. Without any, back_text itself is the answer.
export function acceptedAnswersFor(backText: string, acceptedAnswers: string[]): string[] {
  const explicit = acceptedAnswers.filter(Boolean);
  return explicit.length > 0 ? explicit : [backText].filter(Boolean);
}

// Accepted answers may carry furigana markup (e.g. a reverse card's back_text
// is the original front_text, "食[た]べる") which a typed answer never will --
// strip it before comparing so an exact kanji match isn't misread as wrong.
export function classifyTypedAnswer(
  input: string,
  rawAcceptedAnswers: string[]
): { verdict: AnswerVerdict; closest: string | null } {
  return classifyAnswer(input, rawAcceptedAnswers.map(stripFurigana));
}
