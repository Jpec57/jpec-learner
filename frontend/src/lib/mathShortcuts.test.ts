import { describe, expect, it } from "vitest";

import { expandShortcut, insertSnippet, isInsideMath } from "@/lib/mathShortcuts";

describe("isInsideMath", () => {
  it("tracks inline and display math", () => {
    expect(isInsideMath("a $x", 4)).toBe(true);
    expect(isInsideMath("a $x$ b", 7)).toBe(false);
    expect(isInsideMath("$$\nx", 4)).toBe(true);
    expect(isInsideMath("$$\nx\n$$ after", 14)).toBe(false);
  });

  it("ignores escaped dollars", () => {
    expect(isInsideMath("costs \\$5 ", 10)).toBe(false);
  });
});

describe("expandShortcut", () => {
  const typed = (text: string) => expandShortcut(text, text.length);

  it("expands a word shortcut inside math", () => {
    const edit = typed("Let $alpha ");
    expect(edit?.value).toBe("Let $\\alpha ");
    expect(edit?.selectionStart).toBe(edit?.value.length);
  });

  it("expands symbol shortcuts, preferring the longest match", () => {
    expect(typed("$a <= ")?.value).toBe("$a \\leq ");
    expect(typed("$a <=> ")?.value).toBe("$a \\Leftrightarrow ");
    expect(typed("$x -> ")?.value).toBe("$x \\to ");
  });

  it("puts the caret inside the braces of a structure", () => {
    const edit = typed("$frac ");
    expect(edit?.value).toBe("$\\frac{}{}");
    expect(edit?.selectionStart).toBe("$\\frac{".length);
  });

  it("does nothing in plain text, or inside a longer word", () => {
    expect(typed("the alpha ")).toBeNull();
    expect(typed("$spi ")).toBeNull();
    expect(typed("$2pi ")?.value).toBe("$2\\pi ");
    expect(typed("$x = 1 ")).toBeNull();
  });
});

describe("insertSnippet", () => {
  it("wraps a symbol in $ outside math but not inside", () => {
    expect(insertSnippet("a ", 2, 2, "\\alpha").value).toBe("a $\\alpha$");
    expect(insertSnippet("a $x ", 5, 5, "\\alpha").value).toBe("a $x \\alpha");
  });

  it("moves the selection into the placeholder", () => {
    const edit = insertSnippet("x+1", 0, 3, "\\sqrt{|}");
    expect(edit.value).toBe("$\\sqrt{x+1}$");
    expect(edit.selectionStart).toBe("$\\sqrt{x+1".length);
  });

  it("puts the caret at the placeholder when nothing is selected", () => {
    const edit = insertSnippet("", 0, 0, "$|$", { bare: true });
    expect(edit.value).toBe("$$");
    expect(edit.selectionStart).toBe(1);
  });
});
