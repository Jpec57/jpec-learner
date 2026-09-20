"""Imports the exercises of a bibmath.net "exercices corrigés" page as flashcards.

Each exercise becomes one card:
    Enoncé      -> front_text (recto), prefixed with the exercise title
    Indication  -> hint (shown on demand during review)
    Corrigé     -> back_text (verso)

The page's LaTeX ($...$ / $$...$$) is kept as-is -- the frontend renders it with
KaTeX -- and the HTML around it (lists, line breaks, emphasis) is converted to
Markdown. Cards land in a group tree mirroring the page:
    <category> / <page title, e.g. "Anneaux"> / <section, e.g. "Exemples d'anneaux ...">

Re-running is safe: a card whose front text already exists in the target group is
skipped. Standard library only, so it runs on the host (no container needed):

    # Preview the generated cards without touching the API
    python3 backend/scripts/import_bibmath.py --dry-run

    # Import (logs in with the account's email/password; prompts if not given)
    python3 backend/scripts/import_bibmath.py --email me@example.com --category Maths

    # Another bibmath page
    python3 backend/scripts/import_bibmath.py "https://www.bibmath.net/ressources/index.php?action=affiche&quoi=bde/algebre/groupes&type=fexo"

Credentials can also come from JPECLEARNER_EMAIL / JPECLEARNER_PASSWORD.
"""

import argparse
import getpass
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from html import unescape
from html.parser import HTMLParser
from typing import Iterator

DEFAULT_URL = "https://www.bibmath.net/ressources/index.php?action=affiche&quoi=bde/algebre/anneaux&type=fexo"
DEFAULT_API = "http://localhost:8000/api/v1"

VOID_TAGS = {"br", "img", "hr", "meta", "link", "input"}
SKIPPED_TAGS = {"script", "style"}


# ---------------------------------------------------------------- HTML -> tree


@dataclass
class Node:
    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    children: list["Node | str"] = field(default_factory=list)

    @property
    def classes(self) -> set[str]:
        return set(self.attrs.get("class", "").split())

    def walk(self) -> Iterator["Node"]:
        for child in self.children:
            if isinstance(child, Node):
                yield child
                yield from child.walk()

    def first(self, cls: str) -> "Node | None":
        return next((n for n in self.walk() if cls in n.classes), None)


class _TreeBuilder(HTMLParser):
    """Forgiving DOM builder. bibmath's markup leaves <li> unclosed and mixes
    quoted/unquoted attributes, which html.parser tolerates but doesn't nest."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.stack = [self.root]
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in SKIPPED_TAGS:
            self._skip_depth += 1
            return
        node = Node(tag, {k: v or "" for k, v in attrs})
        if tag == "li":
            # An <li> implicitly closes the previous sibling <li> (and anything
            # left open inside it) but never a list it's nested in.
            while len(self.stack) > 1 and self.stack[-1].tag not in ("ol", "ul"):
                self.stack.pop()
        self.stack[-1].children.append(node)
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in SKIPPED_TAGS:
            return
        self.stack[-1].children.append(Node(tag, {k: v or "" for k, v in attrs}))

    def handle_endtag(self, tag: str) -> None:
        if tag in SKIPPED_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if tag in VOID_TAGS:
            return
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            self.stack[-1].children.append(data)


def parse_html(html: str) -> Node:
    builder = _TreeBuilder()
    builder.feed(html)
    return builder.root


# ------------------------------------------------------ math protection (LaTeX)

# Math is lifted out before HTML parsing: it contains `<`, `>` and `&` (matrix
# column separators) that the parser would mangle, and its `_`/`*` must not be
# treated as Markdown emphasis. Each span becomes an opaque token that survives
# text escaping and is swapped back in at the end.
_DISPLAY_MATH = re.compile(r"\$\$(.+?)\$\$", re.DOTALL)
_INLINE_MATH = re.compile(r"\$([^$]+?)\$", re.DOTALL)
_TOKEN = re.compile(r"@@MATH(\d+)@@")


def _clean_math(source: str) -> str:
    cleaned = unescape(source.replace("<br>", " ").replace("<br/>", " ")).replace("\xa0", " ").strip()
    return cleaned.replace("′", "'")  # U+2032 has no KaTeX glyph; ASCII ' renders as a prime


def protect_math(html: str) -> tuple[str, list[tuple[bool, str]]]:
    spans: list[tuple[bool, str]] = []

    def stash(display: bool):
        def replace(match: re.Match) -> str:
            spans.append((display, _clean_math(match.group(1))))
            return f"@@MATH{len(spans) - 1}@@"

        return replace

    html = _DISPLAY_MATH.sub(stash(True), html)
    html = _INLINE_MATH.sub(stash(False), html)
    return html, spans


# ------------------------------------------------------------ tree -> Markdown

_MD_SPECIALS = re.compile(r"([\\`*_\[\]<>])")


class MarkdownRenderer:
    def __init__(self, math_spans: list[tuple[bool, str]], base_url: str) -> None:
        self.math_spans = math_spans
        self.base_url = base_url
        self.warnings: set[str] = set()

    # -- inline -----------------------------------------------------------

    def _inline(self, children: list["Node | str"]) -> str:
        parts: list[str] = []
        for child in children:
            if isinstance(child, str):
                text = re.sub(r"[ \t\r\n]+", " ", child)
                parts.append(_MD_SPECIALS.sub(r"\\\1", text))
                continue
            tag = child.tag
            if tag == "br":
                parts.append("\n")
            elif tag in ("em", "i"):
                parts.append(f"*{self._inline(child.children).strip()}*")
            elif tag in ("b", "strong"):
                parts.append(f"**{self._inline(child.children).strip()}**")
            elif tag == "img":
                src = child.attrs.get("src", "")
                if src:
                    parts.append(f"![]({self._absolute(src)})")
            elif tag in ("span", "a", "font", "u", "div", "p"):
                parts.append(self._inline(child.children))
            elif tag in ("ol", "ul"):
                parts.append(self._inline(child.children))
            else:
                self.warnings.add(f"unhandled <{tag}> (rendered as plain text)")
                parts.append(self._inline(child.children))
        return "".join(parts)

    def inline_text(self, node: Node, skip: tuple[str, ...] = ("a", "script")) -> str:
        """Single-line Markdown for a heading: math restored, links/scripts dropped."""
        kept = Node(node.tag, node.attrs, [c for c in node.children if isinstance(c, str) or c.tag not in skip])
        return self._paragraph(self._inline(kept.children)).replace("\n", " ")

    def _absolute(self, src: str) -> str:
        return urllib.parse.urljoin(self.base_url, src)

    # -- blocks -----------------------------------------------------------

    def render(self, node: Node) -> str:
        return self._blocks(node.children, in_list_item=False)

    def _blocks(self, children: list["Node | str"], in_list_item: bool) -> str:
        blocks: list[tuple[str, bool]] = []  # (markdown, is_list)
        buffer: list["Node | str"] = []

        def flush() -> None:
            if not buffer:
                return
            text = self._paragraph(self._inline(buffer))
            buffer.clear()
            if text:
                blocks.append((text, False))

        for child in children:
            if isinstance(child, Node) and child.tag in ("ol", "ul"):
                flush()
                blocks.append((self._list(child), True))
            else:
                buffer.append(child)
        flush()

        out = ""
        for index, (text, is_list) in enumerate(blocks):
            if index:
                # Tight inside list items (so nested lists stay compact), loose at
                # the top level where a paragraph must be separated from a list.
                out += "\n" if in_list_item and is_list else "\n\n"
            out += text
        return out

    def _paragraph(self, text: str) -> str:
        """Tidies whitespace and restores math; display math gets its own
        `$$` lines, which is the only form remark-math treats as a block."""

        def restore(match: re.Match) -> str:
            display, source = self.math_spans[int(match.group(1))]
            return f"\n\n$$\n{source}\n$$\n\n" if display else f"${source}$"

        text = _TOKEN.sub(restore, text)
        text = re.sub(r"[ \t]*\n[ \t]*", "\n", text)  # <br> leaves stray spaces around breaks
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _list(self, node: Node) -> str:
        ordered = node.tag == "ol"
        lines: list[str] = []
        number = 0
        for item in node.children:
            if not isinstance(item, Node) or item.tag != "li":
                continue
            number += 1
            marker = f"{number}. " if ordered else "- "
            body = self._blocks(item.children, in_list_item=True)
            if not body:
                body = "–"  # keep numbering when a sub-question has no content
            indent = " " * len(marker)
            first, *rest = body.split("\n")
            lines.append(marker + first)
            lines.extend((indent + line) if line else "" for line in rest)
        return "\n".join(lines)


# ------------------------------------------------------------------- scraping


@dataclass
class Exercise:
    section: str
    number: str
    title: str
    statement: str
    hint: str | None
    solution: str

    @property
    def front(self) -> str:
        return f"**Exercice {self.number} – {self.title}**\n\n{self.statement}" if self.title else self.statement


@dataclass
class Page:
    title: str
    exercises: list[Exercise]
    warnings: list[str]


def _text(node: Node, skip: tuple[str, ...] = ("a", "script")) -> str:
    parts: list[str] = []
    for child in node.children:
        if isinstance(child, str):
            parts.append(child)
        elif child.tag not in skip:
            parts.append(_text(child, skip))
    return "".join(parts)


def _inner(container: Node | None) -> Node | None:
    return container.first("inner") if container else None


def scrape(html: str, base_url: str) -> Page:
    html, math_spans = protect_math(html)
    root = parse_html(html)
    renderer = MarkdownRenderer(math_spans, base_url)

    h1 = next((n for n in root.walk() if n.tag == "h1"), None)
    page_title = re.sub(r"^Exercices?\s+corrigés?\s*-\s*", "", _text(h1).strip()) if h1 else "Exercices"

    exercises: list[Exercise] = []
    section = page_title
    for node in root.walk():
        if "titrepartie" in node.classes:
            section = renderer.inline_text(node) or page_title
        elif "exo" in node.classes:
            header = node.first("titreexo")
            match = re.match(r"\s*Exercice\s+(\d+)\s*(?:-\s*(.*))?", renderer.inline_text(header) if header else "")
            number, title = (match.group(1), (match.group(2) or "").strip()) if match else ("?", "")

            statement_node = _inner(node.first("enonce"))
            solution_node = _inner(node.first("corrige"))
            if statement_node is None or solution_node is None:
                renderer.warnings.add(f"exercise {number}: missing énoncé or corrigé, skipped")
                continue
            statement = renderer.render(statement_node)
            solution = renderer.render(solution_node)
            hint_node = _inner(node.first("indication"))
            hint = renderer.render(hint_node) if hint_node else ""
            # A hint made only of empty sub-questions renders as "1. –\n2. –": no hint.
            if not re.sub(r"[\d.\s–-]", "", hint):
                hint = ""
            if not statement or not solution:
                renderer.warnings.add(f"exercise {number}: empty énoncé or corrigé, skipped")
                continue
            exercises.append(Exercise(section, number, title, statement, hint or None, solution))

    return Page(page_title, exercises, sorted(renderer.warnings))


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "jpeclearner-importer/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")
    except urllib.error.URLError as error:
        if not isinstance(error.reason, ssl.SSLCertVerificationError) or not shutil.which("curl"):
            raise
        # python.org builds on macOS ship without a CA bundle until "Install
        # Certificates.command" is run; curl uses the system trust store instead.
        result = subprocess.run(["curl", "-fsSL", url], capture_output=True, check=True, timeout=60)
        return result.stdout.decode("utf-8", errors="replace")


# ------------------------------------------------------------------------ API


class ApiError(RuntimeError):
    pass


class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.token: str | None = None

    def request(self, method: str, path: str, body: dict | None = None, params: dict | None = None):
        url = self.base + path
        if params:
            url += "?" + "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items() if v is not None)
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = response.read()
        except urllib.error.HTTPError as error:
            raise ApiError(f"{method} {path} -> {error.code}: {error.read().decode(errors='replace')}") from error
        except urllib.error.URLError as error:
            raise ApiError(f"Cannot reach the API at {self.base} ({error.reason}). Is `docker compose up` running?") from error
        return json.loads(payload) if payload else None

    def login(self, email: str, password: str) -> None:
        self.token = self.request("POST", "/auth/login", {"email": email, "password": password})["access_token"]

    def find_or_create_category(self, name: str) -> str:
        for category in self.request("GET", "/categories"):
            if category["name"].casefold() == name.casefold():
                return category["id"]
        return self.request("POST", "/categories", {"name": name})["id"]

    def find_or_create_group(self, category_id: str, parent_id: str | None, title: str) -> str:
        siblings = self.request("GET", "/hierarchy", params={"category_id": category_id, "parent_id": parent_id})
        for node in siblings:
            if node["node_kind"] == "group" and node["title"].casefold() == title.casefold():
                return node["id"]
        body = {"category_id": category_id, "parent_id": parent_id, "node_kind": "group", "title": title[:200]}
        return self.request("POST", "/hierarchy", body)["id"]

    def existing_fronts(self, category_id: str, node_id: str) -> set[str]:
        fronts: set[str] = set()
        offset = 0
        while True:
            page = self.request(
                "GET",
                "/cards",
                params={"category_id": category_id, "lesson_node_id": node_id, "limit": 100, "offset": offset},
            )
            fronts.update(card["front_text"] for card in page["items"])
            offset += 100
            if offset >= page["total"]:
                return fronts

    def create_card(self, category_id: str, node_id: str, exercise: Exercise) -> None:
        self.request(
            "POST",
            "/cards",
            {
                "category_id": category_id,
                "lesson_node_id": node_id,
                "front_text": exercise.front,
                "back_text": exercise.solution,
                "hint": exercise.hint,
                "answer_mode": "reveal",
            },
        )


# ------------------------------------------------------------------------ CLI


def import_page(api: Api, category_name: str, page: Page) -> tuple[int, int]:
    category_id = api.find_or_create_category(category_name)
    root_id = api.find_or_create_group(category_id, None, page.title)
    created = skipped = 0
    group_ids: dict[str, str] = {}
    known_fronts: dict[str, set[str]] = {}
    for exercise in page.exercises:
        if exercise.section not in group_ids:
            group_id = api.find_or_create_group(category_id, root_id, exercise.section)
            group_ids[exercise.section] = group_id
            known_fronts[group_id] = api.existing_fronts(category_id, group_id)
        group_id = group_ids[exercise.section]
        if exercise.front in known_fronts[group_id]:
            skipped += 1
            continue
        api.create_card(category_id, group_id, exercise)
        known_fronts[group_id].add(exercise.front)
        created += 1
    return created, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description="Import a bibmath.net exercise page as flashcards.")
    parser.add_argument("url", nargs="?", default=DEFAULT_URL, help="bibmath page (default: the 'anneaux' exercises)")
    parser.add_argument("--api-url", default=os.environ.get("JPECLEARNER_API_URL", DEFAULT_API))
    parser.add_argument("--email", default=os.environ.get("JPECLEARNER_EMAIL"))
    parser.add_argument("--password", default=os.environ.get("JPECLEARNER_PASSWORD"))
    parser.add_argument("--category", default="Maths", help="category to import into (created if missing)")
    parser.add_argument("--dry-run", action="store_true", help="print the cards instead of importing them")
    parser.add_argument("--json", metavar="FILE", help="also write the parsed exercises to FILE as JSON")
    args = parser.parse_args()

    page = scrape(fetch(args.url), args.url)
    print(f"Page '{page.title}': {len(page.exercises)} exercises", file=sys.stderr)
    for warning in page.warnings:
        print(f"warning: {warning}", file=sys.stderr)
    if not page.exercises:
        print("Nothing to import: no exercises found on that page.", file=sys.stderr)
        return 1

    if args.json:
        with open(args.json, "w", encoding="utf-8") as handle:
            json.dump(
                [
                    {"section": e.section, "front": e.front, "hint": e.hint, "back": e.solution}
                    for e in page.exercises
                ],
                handle,
                ensure_ascii=False,
                indent=2,
            )

    if args.dry_run:
        for exercise in page.exercises:
            print(f"\n{'=' * 78}\n[{exercise.section}]\n\n--- RECTO ---\n{exercise.front}")
            print(f"\n--- INDICATION ---\n{exercise.hint or '(none)'}\n\n--- VERSO ---\n{exercise.solution}")
        return 0

    email = args.email or input("Email: ")
    password = args.password or getpass.getpass("Password: ")
    api = Api(args.api_url)
    try:
        api.login(email, password)
        created, skipped = import_page(api, args.category, page)
    except ApiError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"Done: {created} cards created, {skipped} already present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
