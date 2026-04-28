"""Token budgeting helpers.

Token counting is approximate (chars/4). Precision doesn't matter for budgeting —
headroom does. If you need precise counts, swap count_tokens for a tokenizer-backed
implementation; nothing else here depends on the unit.
"""

import logging
from typing import Awaitable, Callable

logger = logging.getLogger(__name__)


def count_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def count_messages_tokens(messages: list[dict]) -> int:
    """Approximate tokens for a message list, including a per-message overhead."""
    return sum(count_tokens(m.get("content", "")) for m in messages) + 4 * len(messages)


def fit(messages: list[dict], budget: int) -> list[dict]:
    """Trim oldest non-system messages until the list fits within budget.

    System messages are always preserved. If even the system messages exceed the
    budget, returns them anyway and logs a warning — the caller should handle
    that case (e.g. by summarizing or shrinking system content).
    """
    system = [m for m in messages if m.get("role") == "system"]
    rest = [m for m in messages if m.get("role") != "system"]
    while count_messages_tokens(system + rest) > budget and rest:
        rest.pop(0)
    if count_messages_tokens(system + rest) > budget:
        logger.warning(
            "fit: system messages alone exceed budget=%d (tokens=%d)",
            budget,
            count_messages_tokens(system),
        )
    return system + rest


async def summarize_if_over(
    history: list[dict],
    *,
    threshold: int,
    summarize: Callable[[list[dict]], Awaitable[str]],
) -> list[dict]:
    """If history exceeds threshold tokens, replace it with a single system summary.

    `summarize` is an async callable that takes the history and returns a summary
    string — typically a closure over a Stage's call_gemma. Keeping it injected
    here means budget.py has no LLM dependency and can be unit-tested in isolation.
    """
    if count_messages_tokens(history) <= threshold:
        return history
    summary = await summarize(history)
    return [
        {
            "role": "system",
            "content": f"Earlier conversation summary:\n{summary}",
        }
    ]
