"""Optional helpers used by some pipelines but not all.

DocRouter is for the tutor pipeline (runtime selection of doc bundles).
to_danish is a single-call translation helper for the sim pipeline's final stage.
"""

import json
import logging

from .llm import call_gemma

logger = logging.getLogger(__name__)


class DocRouter:
    """Selects which doc bundle(s) apply to a query.

    Bundles are a name -> doc-text map. The router asks Gemma to emit a JSON
    array of bundle names; unknown names and parse failures fall back to [].
    """

    def __init__(self, bundles: dict[str, str]):
        self.bundles = bundles

    async def select(self, query: str) -> list[str]:
        bundle_names = list(self.bundles.keys())
        prompt = (
            "You are a router. Given a user query, return ONLY a JSON array of "
            "the bundle names that are relevant to it. "
            f"Valid bundle names: {json.dumps(bundle_names)}. "
            "Return [] if none apply.\n\n"
            f"User query: {query}\n\n"
            "JSON array:"
        )
        response = await call_gemma(
            [{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.0,
        )
        cleaned = response.strip()
        if cleaned.startswith("```"):
            parts = cleaned.split("```")
            cleaned = parts[1] if len(parts) > 1 else cleaned
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        try:
            selected = json.loads(cleaned.strip())
        except json.JSONDecodeError as e:
            logger.warning("DocRouter: failed to parse %r: %s", cleaned[:100], e)
            return []
        if not isinstance(selected, list):
            return []
        return [n for n in selected if isinstance(n, str) and n in self.bundles]

    def texts_for(self, names: list[str]) -> list[str]:
        return [self.bundles[n] for n in names if n in self.bundles]


async def to_danish(text: str) -> str:
    """Translate text to Danish, preserving fenced code/JSON blocks unchanged."""
    return await call_gemma(
        [
            {
                "role": "system",
                "content": (
                    "You are a translator. Translate the user's text to Danish (Dansk). "
                    "Preserve any code blocks, JSON, or fenced content unchanged. "
                    "Output only the Danish translation, no preamble or explanation."
                ),
            },
            {"role": "user", "content": text},
        ],
        temperature=0.3,
    )
