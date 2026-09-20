import { describe, expect, it } from "vitest";

import { hasGap, splitGaps } from "@/lib/gaps";

describe("gaps", () => {
  it("splits a sentence around its gap", () => {
    expect(splitGaps("あの試合は__見たい")).toEqual(["あの試合は", "見たい"]);
  });

  it("treats any run of 2+ underscores as one gap", () => {
    expect(splitGaps("a ______ b")).toEqual(["a ", " b"]);
  });

  it("supports several gaps and a gap at either end", () => {
    expect(splitGaps("__a__b__")).toEqual(["", "a", "b", ""]);
  });

  it("leaves text without a gap untouched", () => {
    expect(splitGaps("snake_case")).toEqual(["snake_case"]);
    expect(hasGap("snake_case")).toBe(false);
    expect(hasGap("a __ b")).toBe(true);
  });
});
