"""Imports the CAPES / agrégation maths course (backend/scripts/maths_course/*.md) into a deck.

Tree created in the deck (default "Maths"):
    Cours CAPES · Agrégation / <chapter> / <lesson>  (lesson = reviewable lesson node)
and each lesson holds its flashcards (definitions, theorem statements, proofs...).

Chapter file format (one file per chapter, named NN-slug.md; NN gives the order):

    # Algèbre linéaire                       <- chapter title
    Optional chapter description.

    ## Rang d'une application linéaire       <- lesson; text up to the first ### is its body
    ## Dualité @agreg                        <- @agreg: agrégation-only lesson (title gets " · Agrég")
    Lesson summary, $\\LaTeX$, ![légende](figures/05/rang.png) ...

    ### Théorème — Théorème du rang          <- one card block; "Kind — Title [@agreg]"
    Statement...
    > Indication : optional hint (any line starting like this)
    ---
    Proof...

Card kinds:
    Théorème / Proposition / Lemme / Corollaire / Développement:
        statement [--- proof]  -> card "title · énoncé" (+ card "statement · démonstration")
    Définition / Notation:
        definition             -> card "title · définition"
    anything else (Question, Exemple, Contre-exemple, Méthode, Remarque...):
        question --- answer    -> one card

Re-running is safe. Lessons are matched by title, and cards by their first line (the
bold title + "· énoncé" / "· démonstration" ...). Changed texts are updated in place,
so review progress is kept. Figures referenced as figures/... are uploaded to their
card or lesson, and the links are rewritten to the uploaded URL. Standard library only:

    python3 backend/scripts/import_maths_course.py --dry-run
    python3 backend/scripts/import_maths_course.py --chapter 05 --email me@example.com
    python3 backend/scripts/import_maths_course.py --json /tmp/course.json --dry-run   # for check_katex.mjs

Credentials can also come from JPECLEARNER_EMAIL / JPECLEARNER_PASSWORD.
"""

import argparse
import getpass
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

from jpec_api import DEFAULT_API, Api, ApiError

COURSE_DIR = Path(__file__).resolve().parent / "maths_course"
ROOT_GROUP = "Cours CAPES · Agrégation"
AGREG_SUFFIX = " · Agrég"
AGREG_BADGE = "**[Agrég]** "

THEOREM_KINDS = {"théorème", "proposition", "lemme", "corollaire", "développement", "propriété"}
DEFINITION_KINDS = {"définition", "notation"}
HINT_RE = re.compile(r"^>\s*Indication\s*:\s*(.*)$")
FIGURE_RE = re.compile(r"!\[([^\]]*)\]\((figures/[^)\s]+)\)")
LEVEL_RE = re.compile(r"\s*@(agreg|capes)\s*$", re.IGNORECASE)


# ------------------------------------------------------------------- model


@dataclass
class CardSpec:
    key: str  # first line of the front without the level badge; stable identity on re-runs
    front: str
    back: str
    hint: str | None
    agreg: bool


@dataclass
class Lesson:
    title: str
    agreg: bool
    body: str
    cards: list[CardSpec] = field(default_factory=list)

    @property
    def display_title(self) -> str:
        return self.title + (AGREG_SUFFIX if self.agreg else "")


@dataclass
class Chapter:
    number: int
    title: str
    description: str
    lessons: list[Lesson] = field(default_factory=list)
    source: Path | None = None

    @property
    def display_title(self) -> str:
        return f"{self.number:02d} · {self.title}"


# ------------------------------------------------------------------ parser


def _split_level(heading: str) -> tuple[str, bool]:
    match = LEVEL_RE.search(heading)
    if not match:
        return heading.strip(), False
    return heading[: match.start()].strip(), match.group(1).lower() == "agreg"


def _clean(lines: list[str]) -> str:
    return "\n".join(lines).strip()


def _build_cards(heading: str, lines: list[str], lesson_agreg: bool, warn) -> list[CardSpec]:
    title, agreg = _split_level(heading)
    agreg = agreg or lesson_agreg
    if " — " in title:
        kind, name = (part.strip() for part in title.split(" — ", 1))
    else:
        kind, name = "Question", title
    hint = None
    parts: list[list[str]] = [[]]
    for line in lines:
        hint_match = HINT_RE.match(line.strip())
        if hint_match:
            hint = hint_match.group(1).strip()
        elif line.strip() == "---":
            parts.append([])
        else:
            parts[-1].append(line)
    texts = [_clean(part) for part in parts]
    if not texts[0]:
        warn(f"card '{title}': empty first part, skipped")
        return []
    badge = AGREG_BADGE if agreg else ""
    head = f"**{kind} — {name}**" if kind != "Question" else f"**{name}**"
    kind_key = kind.casefold()

    def card(suffix: str, front_body: str | None, back: str, card_hint: str | None) -> CardSpec:
        key = f"{head} · {suffix}" if suffix else head
        front = key + (f"\n\n{front_body}" if front_body else "")
        return CardSpec(key, badge + front, back, card_hint, agreg)

    if kind_key in THEOREM_KINDS:
        cards = [card("énoncé", None, texts[0], None)]
        if len(texts) > 1 and texts[1]:
            cards.append(card("démonstration", texts[0], "\n\n".join(t for t in texts[1:] if t), hint))
        return cards
    if kind_key in DEFINITION_KINDS:
        return [card("définition" if kind_key == "définition" else "notation", None, "\n\n".join(texts), hint)]
    if len(texts) < 2 or not texts[1]:
        warn(f"card '{title}': needs 'question --- answer', skipped")
        return []
    return [card("", texts[0], "\n\n".join(t for t in texts[1:] if t), hint)]


def parse_chapter(path: Path, warnings: list[str]) -> Chapter:
    number = int(path.name.split("-", 1)[0])

    def warn(message: str) -> None:
        warnings.append(f"{path.name}: {message}")

    chapter: Chapter | None = None
    description: list[str] = []
    lesson: Lesson | None = None
    lesson_body: list[str] = []
    card_heading: str | None = None
    card_lines: list[str] = []
    in_fence = False

    def flush_card() -> None:
        nonlocal card_heading, card_lines
        if card_heading is not None and lesson is not None:
            lesson.cards.extend(_build_cards(card_heading, card_lines, lesson.agreg, warn))
        card_heading, card_lines = None, []

    def flush_lesson() -> None:
        nonlocal lesson, lesson_body
        flush_card()
        if lesson is not None and chapter is not None:
            lesson.body = _clean(lesson_body)
            chapter.lessons.append(lesson)
        lesson, lesson_body = None, []

    for raw in path.read_text(encoding="utf-8").splitlines():
        if raw.lstrip().startswith("```"):
            in_fence = not in_fence
        heading = None if in_fence else re.match(r"^(#{1,3}) (.+)$", raw)
        if heading and len(heading.group(1)) == 1:
            chapter = Chapter(number, heading.group(2).strip(), "", source=path)
            continue
        if heading and len(heading.group(1)) == 2:
            flush_lesson()
            title, agreg = _split_level(heading.group(2))
            lesson = Lesson(title, agreg, "")
            continue
        if heading and len(heading.group(1)) == 3:
            flush_card()
            if lesson is None:
                warn(f"card '{heading.group(2)}' outside a lesson, skipped")
                continue
            card_heading = heading.group(2)
            continue
        if card_heading is not None:
            card_lines.append(raw)
        elif lesson is not None:
            lesson_body.append(raw)
        elif chapter is not None:
            description.append(raw)
    flush_lesson()

    if chapter is None:
        raise ValueError(f"{path.name}: missing '# Chapter title' line")
    chapter.description = _clean(description)
    _validate(chapter, warn)
    return chapter


def _unbalanced_math(text: str) -> bool:
    text = re.sub(r"\\\$", "", text)
    if text.count("$$") % 2:
        return True
    return text.replace("$$", "").count("$") % 2 == 1


def _validate(chapter: Chapter, warn) -> None:
    seen_lessons: set[str] = set()
    for lesson in chapter.lessons:
        if lesson.title.casefold() in seen_lessons:
            warn(f"duplicate lesson '{lesson.title}'")
        seen_lessons.add(lesson.title.casefold())
        if _unbalanced_math(lesson.body):
            warn(f"lesson '{lesson.title}': unbalanced $ in body")
        for figure in _figures(lesson.body):
            _check_figure(figure, warn)
        seen_cards: set[str] = set()
        for card in lesson.cards:
            if card.key in seen_cards:
                warn(f"lesson '{lesson.title}': duplicate card '{card.key}'")
            seen_cards.add(card.key)
            for label, text in (("front", card.front), ("back", card.back), ("hint", card.hint or "")):
                if _unbalanced_math(text):
                    warn(f"card '{card.key}': unbalanced $ in {label}")
            if not card.back.strip():
                warn(f"card '{card.key}': empty back")
            for figure in _figures(card.front + "\n" + card.back):
                _check_figure(figure, warn)


def _figures(text: str) -> list[str]:
    return [match.group(2) for match in FIGURE_RE.finditer(text)]


def _check_figure(relative: str, warn) -> None:
    if not (COURSE_DIR / relative).is_file():
        warn(f"missing figure {relative} (run render_figures.py)")


def load_course(chapter_filter: list[int] | None, warnings: list[str]) -> list[Chapter]:
    files = sorted(p for p in COURSE_DIR.glob("[0-9][0-9]-*.md"))
    chapters = [parse_chapter(p, warnings) for p in files]
    if chapter_filter:
        chapters = [c for c in chapters if c.number in chapter_filter]
    return chapters


def filter_level(chapters: list[Chapter], level: str) -> None:
    if level == "all":
        return
    for chapter in chapters:
        if level == "capes":
            chapter.lessons = [lesson for lesson in chapter.lessons if not lesson.agreg]
            for lesson in chapter.lessons:
                lesson.cards = [card for card in lesson.cards if not card.agreg]


# ----------------------------------------------------------------- figures


def _strip_badge(text: str) -> str:
    return text[len(AGREG_BADGE):] if text.startswith(AGREG_BADGE) else text


def _resolve_figures(api: Api, texts: list[str], existing_images: list[dict], owner: dict, refresh: bool) -> list[str]:
    """Uploads the figures referenced in `texts` to the card/lesson `owner` (one image per
    reference, in order) and returns the texts with local paths replaced by media URLs."""
    references = [ref for text in texts for ref in _figures(text)]
    if not references:
        return texts
    images = list(existing_images)
    if refresh:
        for image in images:
            api.delete_image(image["id"])
        images = []
    while len(images) < len(references):
        images.append(api.upload_image(COURSE_DIR / references[len(images)], **owner))
    urls = iter(image["url"] for image in images[: len(references)])
    replaced = []
    for text in texts:
        replaced.append(FIGURE_RE.sub(lambda m: f"![{m.group(1)}]({next(urls)})", text))
    return replaced


# ------------------------------------------------------------------ import


@dataclass
class Stats:
    lessons_created: int = 0
    lessons_updated: int = 0
    cards_created: int = 0
    cards_updated: int = 0
    unchanged: int = 0


def import_course(api: Api, category_name: str, chapters: list[Chapter], refresh_figures: bool) -> Stats:
    stats = Stats()
    category_id = api.find_or_create_category(category_name, deck_type="scientific")
    root, _ = api.find_or_create_node(category_id, None, ROOT_GROUP)
    root_children = api.children(category_id, root["id"])
    for chapter in chapters:
        chapter_node, _ = api.find_or_create_node(
            category_id, root["id"], chapter.display_title, order_index=chapter.number, siblings=root_children
        )
        existing_lessons = {
            node["title"].removesuffix(AGREG_SUFFIX).casefold(): node
            for node in api.children(category_id, chapter_node["id"])
            if node["node_kind"] == "lesson"
        }
        for index, lesson in enumerate(chapter.lessons):
            node = existing_lessons.get(lesson.title.casefold())
            if node is None:
                node, _ = api.find_or_create_node(
                    category_id, chapter_node["id"], lesson.display_title, "lesson",
                    order_index=index, body_markdown=lesson.body or None, siblings=[],
                )
                stats.lessons_created += 1
                created = True
            else:
                created = False
            [body] = _resolve_figures(
                api, [lesson.body], node.get("images") or [], {"lesson_node_id": node["id"]}, refresh_figures
            )
            changes = {}
            if (node.get("body_markdown") or "") != body:
                changes["body_markdown"] = body
            if node["title"] != lesson.display_title:
                changes["title"] = lesson.display_title
            if changes:
                api.update_node(node["id"], **changes)
                if not created:
                    stats.lessons_updated += 1
            _import_cards(api, category_id, node["id"], lesson.cards, refresh_figures, stats)
        print(f"  {chapter.display_title}: {len(chapter.lessons)} lessons", file=sys.stderr)
    return stats


def _import_cards(api: Api, category_id: str, node_id: str, cards: list[CardSpec], refresh: bool, stats: Stats) -> None:
    existing = {}
    for card in api.cards(category_id, node_id):
        existing[_strip_badge(card["front_text"].split("\n", 1)[0])] = card
    for spec in cards:
        current = existing.get(spec.key)
        if current is None:
            # Placeholders keep the local figure paths until the card exists and can own uploads.
            current = api.create_card(category_id, node_id, spec.front, spec.back, spec.hint)
            stats.cards_created += 1
            created = True
        else:
            created = False
        front, back = _resolve_figures(
            api, [spec.front, spec.back], current.get("images") or [], {"card_id": current["id"]}, refresh
        )
        changes = {}
        if current["front_text"] != front:
            changes["front_text"] = front
        if current["back_text"] != back:
            changes["back_text"] = back
        if (current.get("hint") or None) != spec.hint:
            changes["hint"] = spec.hint
        if changes:
            api.update_card(current["id"], **changes)
            if not created:
                stats.cards_updated += 1
        elif not created:
            stats.unchanged += 1


# --------------------------------------------------------------------- CLI


def print_tree(chapters: list[Chapter], verbose: bool) -> None:
    total_lessons = total_cards = total_figures = 0
    for chapter in chapters:
        n_cards = sum(len(lesson.cards) for lesson in chapter.lessons)
        n_agreg = sum(1 for lesson in chapter.lessons for card in lesson.cards if card.agreg)
        n_figures = sum(
            len(_figures(lesson.body)) + sum(len(_figures(c.front + c.back)) for c in lesson.cards)
            for lesson in chapter.lessons
        )
        total_lessons += len(chapter.lessons)
        total_cards += n_cards
        total_figures += n_figures
        print(f"{chapter.display_title}: {len(chapter.lessons)} lessons, {n_cards} cards ({n_agreg} Agrég), {n_figures} figures")
        for lesson in chapter.lessons:
            print(f"    - {lesson.display_title} ({len(lesson.cards)} cards)")
            if verbose:
                for card in lesson.cards:
                    print(f"\n{'=' * 78}\n--- RECTO ---\n{card.front}")
                    if card.hint:
                        print(f"--- INDICATION ---\n{card.hint}")
                    print(f"--- VERSO ---\n{card.back}")
    print(f"\nTotal: {len(chapters)} chapters, {total_lessons} lessons, {total_cards} cards, {total_figures} figures")


def to_json(chapters: list[Chapter]) -> list[dict]:
    return [
        {
            "chapter": chapter.display_title,
            "description": chapter.description,
            "lessons": [
                {
                    "title": lesson.display_title,
                    "body": lesson.body,
                    "cards": [{"front": c.front, "back": c.back, "hint": c.hint} for c in lesson.cards],
                }
                for lesson in chapter.lessons
            ],
        }
        for chapter in chapters
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Import the CAPES / agrégation maths course as lessons and cards.")
    parser.add_argument("--api-url", default=os.environ.get("JPECLEARNER_API_URL", DEFAULT_API))
    parser.add_argument("--email", default=os.environ.get("JPECLEARNER_EMAIL"))
    parser.add_argument("--password", default=os.environ.get("JPECLEARNER_PASSWORD"))
    parser.add_argument("--category", default="Maths", help="deck to import into (created if missing)")
    parser.add_argument("--chapter", action="append", type=int, help="only this chapter number (repeatable)")
    parser.add_argument("--level", choices=["all", "capes"], default="all", help="'capes' skips Agrég-only content")
    parser.add_argument("--dry-run", action="store_true", help="print the tree instead of importing")
    parser.add_argument("--verbose", action="store_true", help="with --dry-run, also print every card")
    parser.add_argument("--json", metavar="FILE", help="write the parsed course to FILE as JSON")
    parser.add_argument("--refresh-figures", action="store_true", help="re-upload figures (after re-rendering them)")
    args = parser.parse_args()

    warnings: list[str] = []
    chapters = load_course(args.chapter, warnings)
    filter_level(chapters, args.level)
    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)
    if not chapters:
        print("Nothing to import: no chapter files matched.", file=sys.stderr)
        return 1

    if args.json:
        Path(args.json).write_text(json.dumps(to_json(chapters), ensure_ascii=False, indent=2), encoding="utf-8")

    if args.dry_run:
        print_tree(chapters, args.verbose)
        return 1 if warnings else 0

    email = args.email or input("Email: ")
    password = args.password or getpass.getpass("Password: ")
    api = Api(args.api_url)
    try:
        api.login(email, password)
        stats = import_course(api, args.category, chapters, args.refresh_figures)
    except ApiError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(
        f"Done: lessons {stats.lessons_created} created / {stats.lessons_updated} updated; "
        f"cards {stats.cards_created} created / {stats.cards_updated} updated / {stats.unchanged} unchanged."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
