"""Free translation providers. Each returns None when it doesn't support the
language pair or finds nothing, so the service can fall through to the next
one; network/HTTP trouble is handled the same way (a flaky free service must
never turn into a 500)."""

import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_SECONDS = 8.0
MAX_ALTERNATIVES = 6


@dataclass
class ProviderResult:
    translation: str
    # Every value that is a *valid answer* to the text (Jisho's definitions of a
    # word, or its written form and reading) -- safe to accept when typed.
    answers: list[str]
    # Wider candidates to choose from; may include wrong ones (MyMemory's
    # matches on a single word are uneven), so never accepted automatically.
    alternatives: list[str]


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        cleaned = value.strip()
        if cleaned and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            out.append(cleaned)
    return out


def _base(code: str) -> str:
    return code.split("-")[0].lower()


def _forms(entry: dict) -> set[str]:
    """Every written form and reading of a Jisho entry."""
    forms: set[str] = set()
    for japanese in entry.get("japanese") or []:
        forms.update(value for value in (japanese.get("word"), japanese.get("reading")) if value)
    return forms


def _prefer_common(entries: list[dict]) -> dict | None:
    """Jisho's own order, but a common word beats an obscure one."""
    return next((e for e in entries if e.get("is_common")), entries[0] if entries else None)


class JishoProvider:
    """jisho.org's word dictionary -- Japanese <-> English only, but far better
    than machine translation for vocabulary (readings, several senses)."""

    name = "jisho"
    URL = "https://jisho.org/api/v1/search/words"

    def supports(self, source: str, target: str) -> bool:
        return {_base(source), _base(target)} == {"ja", "en"}

    async def translate(self, client: httpx.AsyncClient, text: str, source: str, target: str) -> ProviderResult | None:
        response = await client.get(self.URL, params={"keyword": text})
        response.raise_for_status()
        entries = response.json().get("data") or []
        query = text.strip()

        if _base(target) == "en":
            # Only a dictionary entry that *is* the query counts: for a sentence
            # Jisho matches stray words ("あの" -> "that"), which is worse than
            # falling through to machine translation.
            matching = [e for e in entries if query in _forms(e)]
            entry = _prefer_common(matching)
            if entry is None:
                return None
            senses = entry.get("senses") or []
            per_sense = [sense.get("english_definitions") or [] for sense in senses]
            per_sense = [definitions for definitions in per_sense if definitions]
            if not per_sense:
                return None
            # First sense reads as the translation; every definition of the
            # first few senses is offered as an alternative.
            translation = "; ".join(per_sense[0])
            alternatives = _dedupe([d for definitions in per_sense[:3] for d in definitions])
            answers = alternatives[:MAX_ALTERNATIVES]
            return ProviderResult(translation, answers, answers)

        # English -> Japanese: entries listing the query as a definition; the
        # word, then its reading, then other matches.
        wanted = query.lower()
        matching = [
            e
            for e in entries
            if any(
                definition.lower() == wanted
                for sense in e.get("senses") or []
                for definition in sense.get("english_definitions") or []
            )
        ]
        chosen = _prefer_common(matching)
        if chosen is None:
            return None
        ordered = [chosen, *[e for e in matching if e is not chosen]]
        candidates: list[str] = []
        for candidate in ordered[:3]:
            for japanese in candidate.get("japanese") or []:
                candidates.extend([japanese.get("word") or "", japanese.get("reading") or ""])
        candidates = _dedupe(candidates)
        if not candidates:
            return None
        # The chosen entry's word and reading are the valid answers; other
        # matching entries are only suggestions.
        forms = _dedupe(
            [
                value
                for japanese in chosen.get("japanese") or []
                for value in (japanese.get("word") or "", japanese.get("reading") or "")
            ]
        )
        return ProviderResult(candidates[0], forms or candidates[:1], candidates[:MAX_ALTERNATIVES])


class MyMemoryProvider:
    """api.mymemory.translated.net -- keyless, any pair. Quality on single
    words is uneven, so every distinct candidate is returned for the user to
    pick from."""

    name = "mymemory"
    URL = "https://api.mymemory.translated.net/get"

    def supports(self, source: str, target: str) -> bool:
        return _base(source) != _base(target)

    async def translate(self, client: httpx.AsyncClient, text: str, source: str, target: str) -> ProviderResult | None:
        response = await client.get(self.URL, params={"q": text, "langpair": f"{_base(source)}|{_base(target)}"})
        response.raise_for_status()
        body = response.json()
        if body.get("quotaFinished"):
            return None

        matches = body.get("matches") or []
        ranked = sorted(matches, key=lambda m: (-float(m.get("match") or 0), -int(m.get("usage-count") or 0)))
        candidates = [m.get("translation") or "" for m in ranked]
        primary = (body.get("responseData") or {}).get("translatedText") or ""
        candidates = _dedupe([primary, *candidates])
        # MyMemory reports failures (e.g. an unsupported pair) inside a 200.
        if not candidates or str(body.get("responseStatus")) not in ("200", "None"):
            return None
        return ProviderResult(candidates[0], [candidates[0]], candidates[:MAX_ALTERNATIVES])


async def run_provider(provider, text: str, source: str, target: str) -> ProviderResult | None:
    if not provider.supports(source, target):
        return None
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            return await provider.translate(client, text, source, target)
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        logger.warning("Translation provider %s failed: %s: %s", provider.name, type(exc).__name__, exc)
        return None
