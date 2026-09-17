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
