export interface FuriganaSegment {
  text: string;
  reading?: string;
}

// Inline furigana notation: 漢字[かんじ] -- the bracketed reading applies to
// the run of kanji immediately before it, so plain text (including kana
// particles) and annotated words mix freely without ambiguity, e.g.
// "私は勉強[べんきょう]します". Restricted to the Han script specifically
// (rather than "any non-whitespace run") because with no spaces between
// words, a looser match would swallow preceding kana into the annotation too.
const FURIGANA_PATTERN = /([\p{Script=Han}]+)\[([^\]]+)\]/gu;

export function stripFurigana(source: string): string {
  return parseFurigana(source)
    .map((segment) => segment.text)
    .join("");
}

export function parseFurigana(source: string): FuriganaSegment[] {
  const segments: FuriganaSegment[] = [];
  let lastIndex = 0;
  for (const match of source.matchAll(FURIGANA_PATTERN)) {
    const [full, text, reading] = match;
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ text: source.slice(lastIndex, index) });
    }
    segments.push({ text, reading });
    lastIndex = index + full.length;
  }
  if (lastIndex < source.length) {
    segments.push({ text: source.slice(lastIndex) });
  }
  return segments;
}

export interface ReadingToken {
  text: string;
  /** True for a run of kanji, which can carry a reading. */
  kanji: boolean;
  reading?: string;
}

const HAN_RUN = /(\p{Script=Han}+)/u;

// Splits text into kanji runs (with their reading, if annotated) and the plain
// text between them. joinReadings(tokenizeReadings(s)) === s, so a reading
// field can edit one run's reading without touching the rest of the text.
export function tokenizeReadings(source: string): ReadingToken[] {
  const tokens: ReadingToken[] = [];
  for (const segment of parseFurigana(source)) {
    if (segment.reading !== undefined) {
      tokens.push({ text: segment.text, kanji: true, reading: segment.reading });
      continue;
    }
    for (const part of segment.text.split(HAN_RUN)) {
      if (part) tokens.push({ text: part, kanji: HAN_RUN.test(part) });
    }
  }
  return tokens;
}

export function joinReadings(tokens: ReadingToken[]): string {
  return tokens
    .map((token) => (token.kanji && token.reading ? `${token.text}[${token.reading}]` : token.text))
    .join("");
}
