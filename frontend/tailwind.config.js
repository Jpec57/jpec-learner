/** @type {import('tailwindcss').Config} */

// Brand colors are backed by CSS variables (defined in src/index.css :root) so
// the palette can be restyled later by editing values in one place instead of
// hunting for hardcoded Tailwind color names across components. Neutral grays
// stay as Tailwind's standard slate scale -- only the brand identity colors
// need to be swappable.
function cssVarColor(variable) {
  return `rgb(var(${variable}) / <alpha-value>)`;
}

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          light: cssVarColor("--color-primary-light"),
          DEFAULT: cssVarColor("--color-primary"),
          dark: cssVarColor("--color-primary-dark"),
        },
        accent: {
          light: cssVarColor("--color-accent-light"),
          DEFAULT: cssVarColor("--color-accent"),
          dark: cssVarColor("--color-accent-dark"),
        },
      },
    },
  },
  plugins: [],
};
