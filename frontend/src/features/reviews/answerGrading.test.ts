import { describe, expect, it } from "vitest";

import { acceptedAnswersFor, classifyTypedAnswer } from "@/features/reviews/answerGrading";

describe("acceptedAnswersFor", () => {
  it("combines back_text with any extra accepted answers", () => {
    expect(acceptedAnswersFor("benkyou", ["benkyō"])).toEqual(["benkyou", "benkyō"]);
  });

  it("drops an empty back_text instead of including a blank entry", () => {
    expect(acceptedAnswersFor("", ["benkyō"])).toEqual(["benkyō"]);
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
