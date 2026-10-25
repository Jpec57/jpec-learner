# Cours CAPES / Agrégation : suivi

This file is the single source of truth for building the maths course. To resume in a new
session, read it, then do the **Next step** below.

**Next step:** Step 2b. Write lesson summaries and source links for chapters 07–12, with the same style and checks as 01–06.

## Programs followed (session 2027)
- CAPES externe bac+3: https://www.devenirenseignant.gouv.fr/media/20674/download (published July 2026)
- Agrégation externe: https://www.devenirenseignant.gouv.fr/media/20311/download (published May 2026)

## Steps
| # | Step | Status |
|---|------|--------|
| 1 | Tooling: importer, figures, KaTeX check, 18-chapter outline | done |
| 2a | Lesson summaries + sources, chapters 01–06 | done (2026-10-25) |
| 2b | Lesson summaries + sources, chapters 07–12 | todo |
| 2c | Lesson summaries + sources, chapters 13–18 | todo |
| 3 | 05 Algèbre linéaire: cards + figures | todo |
| 4 | 06 Réduction: cards + figures | todo |
| 5 | 09 Suites et séries: cards + figures | todo |
| 6+ | Remaining chapters, one per step (CAPES-heavy first: 10, 02, 03, 07, 08, 11, 12, 17, 01, 04, 14, then Agrég-only 13, 15, 16, 18) | todo |

## Per-chapter status
| Chapter | Lessons | Summaries | Cards | Figures |
|---------|---------|-----------|-------|---------|
| 01 Fondements | 5 | done | 0 | 1 |
| 02 Arithmétique | 7 | done | 0 | 1 |
| 03 Groupes | 11 | done | 0 | 1 |
| 04 Anneaux, corps, polynômes | 10 | done | 0 | 1 |
| 05 Algèbre linéaire | 11 | done | 0 | 2 |
| 06 Réduction | 8 | done | 0 | 1 |
| 07 Espaces euclidiens | 11 | – | 0 | 0 |
| 08 Complexes et géométrie | 12 | – | 0 | 0 |
| 09 Suites et séries | 12 | – | 0 | 0 |
| 10 Fonctions réelles | 9 | – | 0 | 0 |
| 11 Intégration | 9 | – | 0 | 0 |
| 12 Suites et séries de fonctions | 6 | – | 0 | 0 |
| 13 Topologie | 9 | – | 0 | 0 |
| 14 Calcul différentiel, EDO | 10 | – | 0 | 0 |
| 15 Analyse complexe | 6 | – | 0 | 0 |
| 16 Fourier | 5 | – | 0 | 0 |
| 17 Probabilités, statistiques | 12 | – | 0 | 0 |
| 18 Méthodes numériques | 8 | – | 0 | 0 |

## Loop for every step
1. Write or extend the chapter file `NN-*.md`, plus figure scripts in `figures/NN/*.py`.
2. Render the figures: `backend/scripts/.venv/bin/python backend/scripts/render_figures.py NN`
   (first time only: `python3 -m venv backend/scripts/.venv && backend/scripts/.venv/bin/pip install -r backend/scripts/maths_course/requirements-figures.txt`).
3. Check the content:
   `python3 backend/scripts/import_maths_course.py --dry-run --chapter NN --json /tmp/course.json && node backend/scripts/check_katex.mjs /tmp/course.json`
   Expect no warnings and 0 KaTeX errors. Look at every new PNG.
4. Update the tables above and the **Next step** line.
5. Commit on branch `maths-course`.
6. Optionally import into the deck (needs `docker compose up`):
   `python3 backend/scripts/import_maths_course.py --chapter NN --email <you>`

## Writing conventions
- French, KaTeX math. Display math goes on its own `$$` lines.
- **Lesson body:** a short course summary with the key ideas, the main results named, and what to watch for (jury-report pitfalls). It ends with a `Sources :` line of links. Aim for 10–25 lines, plus about one figure per lesson when a picture helps.
- **Cards:**
  - `Théorème|Proposition|Lemme|Corollaire|Développement — Name` → statement `---` proof. Gives two cards: the énoncé card and the démonstration card.
  - `Définition — Name` → definition.
  - `Exemple|Contre-exemple|Méthode|Question — Name` → question `---` answer.
  - Put `> Indication : …` on a line for a hint on the proof card.
- **Levels:** `@agreg` on a lesson or card heading marks agrégation-only content. Everything else is the CAPES core, which agrégation candidates must also know. For CAPES, a result the program states as "admis" (e.g. Cayley-Hamilton) still gets its proof card, marked `@agreg`.
- **Proofs** are complete but concise, and highlight the key idea in the first line.
- **Développements** (agrég oral, 15 min) list the lessons they fit: `*Recasages : …*`.
- **Figures:** white background, colours from `figures/_style.py`. Reference them as `![légende](figures/NN/nom.png)`.
- **Sources:** links only, no copied text. Use, in order:
  - Le Frido (GNU FDL): https://laurent.claessens-donadello.eu/frido.html
  - Exo7 courses (CC BY-NC-SA): https://exo7.emath.fr/cours.html (did not respond on 2026-10-25; recheck before linking, fallback https://www.youtube.com/@Exo7Math)
  - Wikipédia FR
  - bibmath.net
  - Jury reports: agreg.org, capes-math.org
- Bibmath exercises for a chapter can be added with `backend/scripts/import_bibmath.py <url>`.

## Technical notes
- The importer puts everything under the root group `Cours CAPES · Agrégation` in the deck (default "Maths").
  - Lessons are matched by title, ignoring ` · Agrég`.
  - Cards are matched by their first line (the bold title + `· énoncé` / `· démonstration`). Renaming a card heading therefore creates a new card; delete the old one in the app.
- Figures are uploaded to the card or lesson, and their links are rewritten to `/media/...`. After re-rendering a figure, run with `--refresh-figures`.
- Review screens render the card Markdown only, so figures live inside the text. `MarkdownContent` resolves `/media/` links against the API origin.

## Lessons learned
- **Wikipédia links:** write parentheses in titles as `%28`/`%29`, e.g. `Groupe_%28math%C3%A9matiques%29`. Before committing, check every link returns 200:
  `grep -oh '](https://[^ ]*)' NN-*.md | sed 's/^](//; s/)$//' | sort -u | while read u; do curl -s -o /dev/null -w "%{http_code} $u\n" -A linkcheck "$u"; done | grep -v ^200`
- **Exo7 site:** still unreachable on 2026-10-25, so chapters 01–06 have no Exo7 links. They can be added later if it comes back.
- **matplotlib mathtext:** it lacks `\frac32` (use `\frac{3}{2}`) and `\begin{pmatrix}` (write the map out instead).
- **Figures:** look at every rendered PNG. Labels overlapping or overflowing shapes was the usual problem.
