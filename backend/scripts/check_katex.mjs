// Checks that every $...$ / $$...$$ formula of the maths course compiles with KaTeX,
// the same renderer the app uses (frontend/node_modules/katex).
//
//   python3 backend/scripts/import_maths_course.py --dry-run --json /tmp/course.json
//   node backend/scripts/check_katex.mjs /tmp/course.json
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../frontend/package.json"));
const katex = require("katex");

const course = JSON.parse(readFileSync(process.argv[2], "utf8"));
let formulas = 0;
const errors = [];

function check(where, text) {
  if (!text) return;
  const source = text.replace(/\\\$/g, "");
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  for (const match of source.matchAll(pattern)) {
    const displayMode = match[1] !== undefined;
    const tex = displayMode ? match[1] : match[2];
    formulas += 1;
    try {
      katex.renderToString(tex, { displayMode, throwOnError: true, strict: "ignore" });
    } catch (error) {
      errors.push(`${where}\n    ${tex.trim().slice(0, 120)}\n    -> ${error.message}`);
    }
  }
}

for (const chapter of course) {
  check(`${chapter.chapter} (description)`, chapter.description);
  for (const lesson of chapter.lessons) {
    const where = `${chapter.chapter} / ${lesson.title}`;
    check(`${where} (body)`, lesson.body);
    for (const card of lesson.cards) {
      const title = card.front.split("\n", 1)[0];
      check(`${where} / ${title} (front)`, card.front);
      check(`${where} / ${title} (back)`, card.back);
      check(`${where} / ${title} (hint)`, card.hint);
    }
  }
}

for (const error of errors) console.error(error);
console.log(`${formulas} formulas checked, ${errors.length} errors`);
process.exit(errors.length ? 1 : 0);
