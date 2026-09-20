import { describe, expect, it } from "vitest";

import { acceptedAnswersFor, classifyTypedAnswer } from "@/features/reviews/answerGrading";

describe("acceptedAnswersFor", () => {
  it("uses only the explicit accepted answers, leaving back_text as display-only context", () => {
    expect(acceptedAnswersFor("**Fast** (adj.) — see also *lent*", ["rapide", "prompt", "véloce"])).toEqual([
      "rapide",
      "prompt",
      "véloce",
    ]);
  });

  it("falls back to back_text when no accepted answers are set", () => {
    expect(acceptedAnswersFor("benkyou", [])).toEqual(["benkyou"]);
  });

  it("returns nothing for an empty back_text with no accepted answers", () => {
    expect(acceptedAnswersFor("", [])).toEqual([]);
  });
});

describe("classifyTypedAnswer", () => {
  it("regression: an exact kanji match against a furigana-marked accepted answer is correct", () => {
    // This is exactly a reverse card's shape: front_text "taberu", back_text
    // carries the original furigana-annotated kanji.
    const result = classifyTypedAnswer("食べる", ["食[た]べる"]);
    expect(result.verdict).toBe("correct");
  });

  it("still flags a typo once furigana is stripped", () => {
    const result = classifyTypedAnswer("食べるる", ["食[た]べる"]);
    expect(result.verdict).toBe("typo");
  });

  it("matches plain (non-furigana) accepted answers as before", () => {
    expect(classifyTypedAnswer("benkyou", ["benkyou", "benkyō"]).verdict).toBe("correct");
  });
});
