export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[rows - 1][cols - 1];
}

export type AnswerVerdict = "correct" | "typo" | "wrong";

const TYPO_DISTANCE_RATIO = 0.3;
const MIN_TYPO_DISTANCE = 1;

function closestAccepted(input: string, acceptedAnswers: string[]): { answer: string; distance: number } | null {
  const normalizedInput = normalizeAnswer(input);
  let closest: { answer: string; distance: number } | null = null;
  for (const accepted of acceptedAnswers) {
    const distance = levenshteinDistance(normalizedInput, normalizeAnswer(accepted));
    if (!closest || distance < closest.distance) {
      closest = { answer: accepted, distance };
    }
  }
  return closest;
}

export function classifyAnswer(
  input: string,
  acceptedAnswers: string[]
): { verdict: AnswerVerdict; closest: string | null } {
  if (normalizeAnswer(input).length === 0) return { verdict: "wrong", closest: null };
  const closest = closestAccepted(input, acceptedAnswers);
  if (!closest) return { verdict: "wrong", closest: null };
  if (closest.distance === 0) return { verdict: "correct", closest: closest.answer };
  const threshold = Math.max(MIN_TYPO_DISTANCE, Math.floor(closest.answer.length * TYPO_DISTANCE_RATIO));
  return { verdict: closest.distance <= threshold ? "typo" : "wrong", closest: closest.answer };
}
