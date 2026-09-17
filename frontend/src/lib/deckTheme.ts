type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace("#", "");
  return [
    parseInt(normalized.substring(0, 2), 16),
    parseInt(normalized.substring(2, 4), 16),
    parseInt(normalized.substring(4, 6), 16),
  ];
}

function mixToward([r, g, b]: Rgb, target: number, amount: number): Rgb {
  return [
    Math.round(r + (target - r) * amount),
    Math.round(g + (target - g) * amount),
    Math.round(b + (target - b) * amount),
  ];
}

function toVar([r, g, b]: Rgb): string {
  return `${r} ${g} ${b}`;
}

// Derives the same light/DEFAULT/dark trio the app's default palette uses
// (see index.css --color-primary-*) from a single user-picked hex color, so
// a deck theme only needs one input instead of three.
export function deckThemeVars(hex: string): Record<string, string> {
  const rgb = hexToRgb(hex);
  return {
    "--color-primary-light": toVar(mixToward(rgb, 255, 0.85)),
    "--color-primary": toVar(rgb),
    "--color-primary-dark": toVar(mixToward(rgb, 0, 0.25)),
  };
}
