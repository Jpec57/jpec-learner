# JpecLearner Design System

Practical reference for building UI in this app. Goal: **professional but punchy** —
not a bare admin panel, not a loud consumer app. When in doubt, prefer the
simpler option; this doc describes the default, not a rulebook to fight.

## Palette

Brand colors live as CSS variables in `frontend/src/index.css` (`:root`), wired
into Tailwind via `frontend/tailwind.config.js`. **Never hardcode a Tailwind
color name (`indigo-600`, `orange-500`, ...) for brand elements** — use the
`primary`/`accent` tokens so the whole site can be reskinned by editing one
file.

| Token | Use for |
|---|---|
| `primary` (indigo) | Main actions, links, active states, brand identity. The default choice. |
| `accent` (orange) | Sparingly, for warmth/energy: streaks, celebratory moments, "you're on a roll" states. Not a second primary button color. |
| `slate-*` (plain Tailwind) | Neutral text, borders, backgrounds. Grays are not themed — only brand colors are. |
| `emerald` / `red` / `amber` (plain Tailwind) | Semantic-only: success/public badges, destructive actions, warnings. Never used for brand/navigation. |

Rating buttons (Again/Hard/Good/Easy/Perfect) keep their own red→orange→amber→lime→emerald
spectrum — that's meaningful signal (bad→good), not brand color, and stays
literal Tailwind classes.

## Layout shell

Every authenticated page renders inside `components/layout/AppLayout.tsx`:
sticky `Header`, page content, `Footer`. **Pages do not repeat the page shell**
(no `min-h-screen`, no background color) — a page component's root element is
just its own content container (typically `mx-auto max-w-3xl`, or narrower for
focused flows like the review session). The shell owns the background and
chrome; pages own their content width.

Background is a single soft gradient wash defined once on `body` (index.css),
not repeated per-page. `AppLayout` adds two low-opacity blurred color blobs
(`primary`/`accent`) behind the header for depth — decorative only, `aria-hidden`,
never behind interactive content.

Unauthenticated pages (login/register) get the same `body` background but no
Header/Footer chrome — just the centered form card.

## Typography & spacing

- No custom font — system font stack (Tailwind default) keeps load fast and
  looks native everywhere.
- Page title: `text-2xl font-semibold text-slate-900`.
- Section label: `text-sm font-medium uppercase tracking-wide text-slate-400`.
- Body text: `text-sm text-slate-600` / muted secondary: `text-slate-400` or `text-slate-500`.
- Spacing scale: stick to Tailwind's default scale (2, 3, 4, 6, 8, 10). Don't
  invent arbitrary pixel values unless matching an external constraint (icon
  sizes, etc).

## Surfaces & elevation

- Cards: `rounded-xl border border-slate-200 bg-white p-5 shadow-sm`.
- Interactive/clickable cards additionally get: `transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md`.
- Modals/dialogs: Radix primitives only (`@radix-ui/react-*`), never
  `window.confirm`/`window.alert` — those block the page and can't be driven
  by tests or automation. See `components/ui/ConfirmDialog.tsx` /
  `useConfirm.tsx` for the established pattern.

## Motion

Use `framer-motion`, already a dependency. Rules of thumb:

- Entrance animations are short (`duration: 0.15–0.25`) and subtle (fade + 4–8px
  translate). Nothing should feel like it's "flying in."
- Only animate things that change state in response to a user action (reveal,
  submit, new item appearing) — don't animate on every render.
- Prefer `initial`/`animate` (mount-in) over `AnimatePresence` + `exit` unless
  you genuinely need an exit transition — `AnimatePresence` adds real
  complexity and has already caused one real bug here (see memory: a
  `height: "auto"` exit animation got stuck permanently invisible). If you
  reach for `AnimatePresence`, test the actual browser behavior, not just that
  it compiles.
- Hover micro-interactions (card lift, button color) are plain Tailwind
  `transition` + `hover:`, not Framer Motion — cheaper and simpler for
  hover-only state.

## Icons

- Category icons: user-picked emoji from a small curated set (see
  `features/categories/iconOptions.ts`), rendered inside a `primary-light`
  circular badge, not bare on the page background.
- UI chrome icons (nav, buttons): `lucide-react`, already a dependency. Don't
  mix emoji and lucide icons in the same row of controls.

## Forms & feedback

- Every mutation that can fail (network error, validation conflict like the
  hierarchy sibling-title uniqueness constraint) must surface an inline error
  message near the control that triggered it — never swallow the rejection
  silently. Use `lib/errors.ts`'s `getErrorMessage()` to extract a
  backend-provided message when available, falling back to a generic string.
- Destructive actions go through `useConfirm()` (see Surfaces above), not a
  native dialog.

## Accessibility baseline

- Text on `primary`/`accent` backgrounds must be white or `primary-dark`/`accent-dark`
  for contrast — never `primary`-on-`primary-light` at default weight for body text.
- Every icon-only button needs an `aria-label` (translated).
- Focus states rely on the browser default outline — don't remove it without
  providing an equivalent (`focus-visible:ring-2 ring-primary` if you must
  restyle).

## When adding a new feature

1. Reuse an existing pattern from this doc before inventing a new one.
2. If you need a genuinely new pattern (a new card style, a new motion type),
   add it here in the same PR/commit, not as a one-off.
3. Keep the "professional but punchy" bar: color and motion should draw the
   eye to what matters (due counts, streaks, success states), not decorate
   everything uniformly.
