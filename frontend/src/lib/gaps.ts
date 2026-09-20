// A gap ("fill in the blank") in card text is a run of two or more underscores,
// e.g. "あの試合は__見たい". Only meaningful in a card's front -- elsewhere
// underscores keep their markdown meaning (__bold__).
const GAP_PATTERN = /_{2,}/;

/** Text on either side of each gap; a single element means "no gap". */
export function splitGaps(text: string): string[] {
  return text.split(new RegExp(GAP_PATTERN, "g"));
}

export function hasGap(text: string): boolean {
  return GAP_PATTERN.test(text);
}
