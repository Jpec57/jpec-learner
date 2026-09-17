import { describe, expect, it } from "vitest";

import { classifyAnswer, levenshteinDistance, normalizeAnswer } from "@/lib/textMatch";

describe("normalizeAnswer", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeAnswer("  Benkyou  ")).toBe("benkyou");
    expect(normalizeAnswer("ben   kyou")).toBe("ben kyou");
  });
});

describe("levenshteinDistance", () => {
  it("is zero for identical strings", () => {
    expect(levenshteinDistance("benkyou", "benkyou")).toBe(0);
  });

  it("counts single-character edits", () => {
    expect(levenshteinDistance("benkyou", "benkyo")).toBe(1);
    expect(levenshteinDistance("benkyou", "benkyuu")).toBe(1);
  });

  it("handles completely different strings", () => {
    expect(levenshteinDistance("cat", "dog")).toBeGreaterThanOrEqual(3);
  });
});

describe("classifyAnswer", () => {
  it("marks an exact match (after normalization) as correct", () => {
    expect(classifyAnswer("  Benkyou ", ["benkyou"]).verdict).toBe("correct");
  });

  it("matches against any accepted answer, not just the first", () => {
    const result = classifyAnswer("benkyō", ["benkyou", "benkyō"]);
    expect(result.verdict).toBe("correct");
    expect(result.closest).toBe("benkyō");
  });

  it("flags a small typo instead of marking it outright wrong", () => {
    const result = classifyAnswer("benkyuo", ["benkyou"]);
    expect(result.verdict).toBe("typo");
    expect(result.closest).toBe("benkyou");
  });

  it("marks an unrelated answer as wrong", () => {
    expect(classifyAnswer("apple", ["benkyou"]).verdict).toBe("wrong");
  });

  it("treats empty input as wrong rather than crashing", () => {
    expect(classifyAnswer("   ", ["benkyou"]).verdict).toBe("wrong");
  });

  it("is wrong (not a crash) when there are no accepted answers at all", () => {
    expect(classifyAnswer("anything", []).verdict).toBe("wrong");
  });
});
