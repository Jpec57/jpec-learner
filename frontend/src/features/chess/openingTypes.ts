// Shared shapes for opening courses (see openings.ts / openingLines.ts).

export type Lang = "en" | "fr";
export type L10n = Record<Lang, string>;

// [san, english note, french note]
type RawMove = [string, string, string];

export interface CourseMove {
  san: string;
  note: L10n;
}

export interface CourseLine {
  id: string;
  name: L10n;
  moves: CourseMove[];
}

export interface OpeningCourse {
  id: string;
  side: "w" | "b";
  eco: string;
  name: L10n;
  summary: L10n;
  ideas: L10n[];
  lines: CourseLine[];
}

export function line(id: string, en: string, fr: string, moves: RawMove[]): CourseLine {
  return { id, name: { en, fr }, moves: moves.map(([san, noteEn, noteFr]) => ({ san, note: { en: noteEn, fr: noteFr } })) };
}

export const t = (en: string, fr: string): L10n => ({ en, fr });
