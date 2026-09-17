import { stripFurigana } from "@/lib/furigana";
import { classifyAnswer, type AnswerVerdict } from "@/lib/textMatch";

export function acceptedAnswersFor(backText: string, extraAcceptedAnswers: string[]): string[] {
  return [backText, ...extraAcceptedAnswers].filter(Boolean);
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
