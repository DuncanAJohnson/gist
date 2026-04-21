"""
AI provider registry.

Each provider exposes an async `generate` coroutine with the shared signature:

    async def generate(
        messages: list[dict],
        model: str,
        max_tokens: int,
        instructions: str | None,
    ) -> dict  # {"type": "success", "content": str} | {"type": "error", "error": str}

`messages` is a list of `{"role": "user"|"assistant"|"system", "content": str}`.
Providers are responsible for mapping that into whatever shape their API wants
(e.g. OpenAI Responses API vs. OpenAI-compatible Chat Completions).
"""

import importlib


# Mapping provider key -> module name (within this package). The modules are
# imported lazily inside `dispatch` so a broken dependency or missing env var
# in one provider doesn't crash the whole dispatcher at import time.
PROVIDER_MODULES = {
    "openai": "openai_provider",
    "skolegpt": "skolegpt_provider",
}


async def dispatch(
    provider: str,
    messages: list[dict],
    model: str,
    max_tokens: int,
    instructions: str | None = None,
) -> dict:
    """Route a request to the named provider."""
    module_name = PROVIDER_MODULES.get(provider)
    if module_name is None:
        return {
            "type": "error",
            "error": f"Unknown provider '{provider}'. Known: {sorted(PROVIDER_MODULES)}",
        }
    try:
        module = importlib.import_module(f".{module_name}", package=__name__)
    except Exception as e:
        return {
            "type": "error",
            "error": f"Failed to load provider '{provider}': {e}",
        }
    return await module.generate(
        messages=messages,
        model=model,
        max_tokens=max_tokens,
        instructions=instructions,
    )
