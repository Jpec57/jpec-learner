import { describe, expect, it } from "vitest";

import { deckThemeVars } from "@/lib/deckTheme";

describe("deckThemeVars", () => {
  it("passes the exact color through as the DEFAULT variant", () => {
    const vars = deckThemeVars("#8b5cf6");
    expect(vars["--color-primary"]).toBe("139 92 246");
  });

  it("lightens toward white for the light variant", () => {
    const vars = deckThemeVars("#8b5cf6");
    const [r, g, b] = vars["--color-primary-light"].split(" ").map(Number);
    expect(r).toBeGreaterThan(139);
    expect(g).toBeGreaterThan(92);
    expect(b).toBeGreaterThan(246 - 1); // already close to 255, allow rounding
  });

  it("darkens toward black for the dark variant", () => {
    const vars = deckThemeVars("#8b5cf6");
    const [r, g, b] = vars["--color-primary-dark"].split(" ").map(Number);
    expect(r).toBeLessThan(139);
    expect(g).toBeLessThan(92);
    expect(b).toBeLessThan(246);
  });

  it("handles pure black without going out of the 0-255 range", () => {
    const vars = deckThemeVars("#000000");
    expect(vars["--color-primary"]).toBe("0 0 0");
    expect(vars["--color-primary-dark"]).toBe("0 0 0");
  });
});
