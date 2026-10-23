// Opening-course progress, kept in this browser only (a convenience, not synced).
const KEY = "jpeclearner.chess.progress";

export interface LineProgress {
  completed: number; // times finished
  flawless: number; // times finished without a wrong move
}

type ProgressMap = Record<string, LineProgress>; // key: `${courseId}/${lineId}`

export function loadProgress(): ProgressMap {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

export function recordLineResult(courseId: string, lineId: string, flawless: boolean): ProgressMap {
  const progress = loadProgress();
  const key = `${courseId}/${lineId}`;
  const current = progress[key] ?? { completed: 0, flawless: 0 };
  progress[key] = { completed: current.completed + 1, flawless: current.flawless + (flawless ? 1 : 0) };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Storage unavailable (private mode): progress just isn't remembered.
  }
  return progress;
}

/** A line counts as mastered once it has been played through without a mistake. */
export function isMastered(progress: ProgressMap, courseId: string, lineId: string): boolean {
  return (progress[`${courseId}/${lineId}`]?.flawless ?? 0) > 0;
}
