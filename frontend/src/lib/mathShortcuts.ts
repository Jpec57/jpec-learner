// LaTeX writing helpers for scientific decks. "|" in a snippet marks where the
// caret lands (a selection is moved there); no "|" leaves the caret at the end.
const CARET = "|";

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Whether `position` is inside a $...$ or $$...$$ span. */
export function isInsideMath(text: string, position: number): boolean {
  let inline = false;
  let display = false;
  for (let i = 0; i < position; i++) {
    if (text[i] === "\\") {
      i++; // an escaped character (\$) never opens or closes math
    } else if (text[i] === "$" && text[i + 1] === "$" && i + 1 < position) {
      display = !display;
      i++;
    } else if (text[i] === "$") {
      inline = !inline;
    }
  }
  return inline || display;
}

/** Inserts `snippet` over the selection. Outside math the snippet is wrapped in
 * $...$ unless `bare` (used for things that carry their own delimiters). */
export function insertSnippet(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  snippet: string,
  { bare = false }: { bare?: boolean } = {}
): TextEdit {
  const selected = value.slice(selectionStart, selectionEnd);
  const wrapped = bare || isInsideMath(value, selectionStart) ? snippet : `$${snippet}$`;
  const markerAt = wrapped.indexOf(CARET);

  let inserted: string;
  let caret: number;
  if (markerAt === -1) {
    inserted = wrapped;
    caret = selectionStart + inserted.length;
  } else {
    inserted = wrapped.replace(CARET, selected);
    caret = selectionStart + markerAt + (selected ? selected.length : 0);
  }
  return {
    value: value.slice(0, selectionStart) + inserted + value.slice(selectionEnd),
    selectionStart: caret,
    selectionEnd: caret,
  };
}

// Typed inside math, followed by a space.
export const SHORTCUTS: Record<string, string> = {
  "->": "\\to",
  "=>": "\\Rightarrow",
  "<=>": "\\Leftrightarrow",
  "<=": "\\leq",
  ">=": "\\geq",
  "!=": "\\neq",
  "~=": "\\approx",
  "+-": "\\pm",
  "...": "\\ldots",
  inf: "\\infty",
  frac: "\\frac{|}{}",
  sqrt: "\\sqrt{|}",
  sum: "\\sum_{i=1}^{n} ",
  int: "\\int_{a}^{b} | \\, dx",
  lim: "\\lim_{x \\to |}",
  vec: "\\vec{|}",
  alpha: "\\alpha",
  beta: "\\beta",
  gamma: "\\gamma",
  delta: "\\delta",
  epsilon: "\\varepsilon",
  theta: "\\theta",
  lambda: "\\lambda",
  mu: "\\mu",
  pi: "\\pi",
  sigma: "\\sigma",
  phi: "\\varphi",
  omega: "\\omega",
};

const TRIGGERS = Object.keys(SHORTCUTS).sort((a, b) => b.length - a.length);
const isLetter = (char: string | undefined) => !!char && /[A-Za-z]/.test(char);

/**
 * Called after the user typed a space at `caret - 1`: expands a shortcut
 * ("alpha " -> "\alpha ") when one ends right before it and the caret is in
 * math. Returns null when nothing applies.
 */
export function expandShortcut(value: string, caret: number): TextEdit | null {
  if (value[caret - 1] !== " ") return null;
  const before = value.slice(0, caret - 1);
  if (!isInsideMath(value, caret - 1)) return null;

  for (const trigger of TRIGGERS) {
    if (!before.endsWith(trigger)) continue;
    const start = before.length - trigger.length;
    // A word trigger must be a whole word ("pi" in "spi" is not a shortcut).
    if (isLetter(trigger[0]) && isLetter(before[start - 1])) continue;

    const snippet = SHORTCUTS[trigger];
    const markerAt = snippet.indexOf(CARET);
    const expansion = markerAt === -1 ? `${snippet} ` : snippet.replace(CARET, "");
    const newCaret = start + (markerAt === -1 ? expansion.length : markerAt);
    return {
      value: before.slice(0, start) + expansion + value.slice(caret),
      selectionStart: newCaret,
      selectionEnd: newCaret,
    };
  }
  return null;
}

export interface MathButton {
  label: string;
  snippet: string;
  bare?: boolean;
}

export const STRUCTURE_BUTTONS: MathButton[] = [
  { label: "$x$", snippet: "$|$", bare: true },
  { label: "$$", snippet: "\n$$\n|\n$$\n", bare: true },
  { label: "a⁄b", snippet: "\\frac{|}{}" },
  { label: "√", snippet: "\\sqrt{|}" },
  { label: "xⁿ", snippet: "^{|}" },
  { label: "xₙ", snippet: "_{|}" },
  { label: "Σ", snippet: "\\sum_{i=1}^{n} |" },
  { label: "∫", snippet: "\\int_{a}^{b} | \\, dx" },
  { label: "lim", snippet: "\\lim_{x \\to |}" },
  { label: "( )", snippet: "\\begin{pmatrix} | \\end{pmatrix}" },
  { label: "v⃗", snippet: "\\vec{|}" },
];

const symbol = (label: string, latex: string): MathButton => ({ label, snippet: latex });

export const SYMBOL_BUTTONS: MathButton[] = [
  symbol("α", "\\alpha"),
  symbol("β", "\\beta"),
  symbol("γ", "\\gamma"),
  symbol("δ", "\\delta"),
  symbol("ε", "\\varepsilon"),
  symbol("θ", "\\theta"),
  symbol("λ", "\\lambda"),
  symbol("μ", "\\mu"),
  symbol("π", "\\pi"),
  symbol("σ", "\\sigma"),
  symbol("φ", "\\varphi"),
  symbol("ω", "\\omega"),
  symbol("Δ", "\\Delta"),
  symbol("Ω", "\\Omega"),
  symbol("∞", "\\infty"),
  symbol("≤", "\\leq"),
  symbol("≥", "\\geq"),
  symbol("≠", "\\neq"),
  symbol("≈", "\\approx"),
  symbol("±", "\\pm"),
  symbol("→", "\\to"),
  symbol("⇒", "\\Rightarrow"),
  symbol("∈", "\\in"),
  symbol("∀", "\\forall"),
  symbol("∃", "\\exists"),
  symbol("∂", "\\partial"),
  symbol("∇", "\\nabla"),
  symbol("×", "\\times"),
  symbol("·", "\\cdot"),
];
