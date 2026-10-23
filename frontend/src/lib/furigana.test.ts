import { describe, expect, it } from "vitest";

import { joinReadings, parseFurigana, stripFurigana, tokenizeReadings } from "@/lib/furigana";

describe("parseFurigana", () => {
  it("returns a single plain segment when there is no annotation", () => {
    expect(parseFurigana("hello")).toEqual([{ text: "hello" }]);
  });

  it("parses a single annotated word", () => {
    expect(parseFurigana("勉強[べんきょう]")).toEqual([{ text: "勉強", reading: "べんきょう" }]);
  });

  it("mixes plain and annotated segments in order", () => {
    expect(parseFurigana("私は勉強[べんきょう]します")).toEqual([
      { text: "私は" },
      { text: "勉強", reading: "べんきょう" },
      { text: "します" },
    ]);
  });

  it("handles multiple annotated words", () => {
    expect(parseFurigana("勉強[べんきょう]と日本語[にほんご]")).toEqual([
      { text: "勉強", reading: "べんきょう" },
      { text: "と" },
      { text: "日本語", reading: "にほんご" },
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseFurigana("")).toEqual([]);
  });
});

describe("stripFurigana", () => {
  it("removes bracketed readings, keeping only the visible text", () => {
    expect(stripFurigana("食[た]べる")).toBe("食べる");
    expect(stripFurigana("私は勉強[べんきょう]します")).toBe("私は勉強します");
  });

  it("leaves plain text untouched", () => {
    expect(stripFurigana("benkyou")).toBe("benkyou");
  });
});

describe("tokenizeReadings / joinReadings", () => {
  it("splits kanji runs from kana and keeps existing readings", () => {
    expect(tokenizeReadings("私は勉強[べんきょう]します")).toEqual([
      { text: "私", kanji: true },
      { text: "は", kanji: false },
      { text: "勉強", kanji: true, reading: "べんきょう" },
      { text: "します", kanji: false },
    ]);
  });

  it("round-trips any text unchanged", () => {
    for (const text of ["", "hello", "私は勉強[べんきょう]します", "a[b] 漢字 [x]"]) {
      expect(joinReadings(tokenizeReadings(text))).toBe(text);
    }
  });

  it("writes a new reading as inline notation", () => {
    const tokens = tokenizeReadings("私は");
    tokens[0].reading = "わたし";
    expect(joinReadings(tokens)).toBe("私[わたし]は");
  });
});
