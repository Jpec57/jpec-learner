from dataclasses import dataclass

from app.services.translation.providers import JishoProvider, MyMemoryProvider, run_provider

# Tried in order; the first that returns something wins.
PROVIDERS = [JishoProvider(), MyMemoryProvider()]


class TranslationUnavailableError(RuntimeError):
    """No provider could translate this text (unsupported pair, no result, or
    every service down)."""


@dataclass
class TranslationResult:
    translation: str
    answers: list[str]
    alternatives: list[str]
    provider: str


async def translate(text: str, source: str, target: str) -> TranslationResult:
    for provider in PROVIDERS:
        result = await run_provider(provider, text, source, target)
        if result is not None and result.translation:
            return TranslationResult(result.translation, result.answers, result.alternatives, provider.name)
    raise TranslationUnavailableError(f"No translation available for {source} -> {target}")
