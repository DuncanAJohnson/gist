"""Router stage: classify which slices of the parent simulation an edit touches.

Tiny, fast LLM call. Reads `scratch.meta["parent_json"]` plus the edit prompt
from `scratch.history`, returns:

    {"needs_skeleton": bool, "fills": ["objects", "controls", ...], "reason": "..."}

The orchestrator (`sim_pipeline_remix/__init__.py`) interprets the result:
- needs_skeleton=True → emit a `fallback` SSE event so the frontend re-calls /generate
- otherwise → run only the named fills, in parallel, then assemble.
"""

import logging
from typing import Any

from pipeline import Scratch

from gist_instructions import (  # type: ignore[import-not-found]
    router_fragment,
    shared_router_preamble,
)
from sim_pipeline._base import JsonStage

from ._base import parent_summary_for_router, _last_user_message

logger = logging.getLogger(__name__)


VALID_FILLS = ("objects", "controls", "graphs", "outputs")


class RouterStage(JsonStage):
    name = "router"
    # Tiny output: the JSON object is well under 200 tokens. Headroom for the
    # `reason` field plus any reasoning trace we don't end up using.
    output_budget = 600
    # Force minimal reasoning — the router is a classifier, not a writer.
    reasoning_effort = "minimal"

    def system_prompt(self, scratch: Scratch) -> str:
        # Override the JsonStage default: router doesn't need the schema_block
        # (it's not emitting SimulationConfig fragments) and shouldn't get
        # `shared_preamble` either (different framing — it's not a writer).
        return f"{shared_router_preamble.strip()}\n\n{router_fragment.strip()}"

    def build_user_messages(self, scratch: Scratch) -> list[dict]:
        parent = scratch.meta.get("parent_json", {}) or {}
        summary = parent_summary_for_router(parent)
        edit_prompt = _last_user_message(scratch.history)
        return [
            {
                "role": "user",
                "content": (
                    f"PARENT SIMULATION (summary):\n{summary}\n\n"
                    f"USER EDIT REQUEST:\n{edit_prompt}\n\n"
                    "Return only the JSON object described in your instructions."
                ),
            }
        ]

    def parse(self, response: str) -> Any:
        value = super().parse(response)
        return _normalize_router_result(value)


def _normalize_router_result(value: Any) -> dict:
    """Coerce the router's output into a strict {needs_skeleton, fills, reason} shape.

    Tolerates extra keys, missing keys, and casing variants. Filters fills down
    to the four valid slice names. If needs_skeleton is true, force fills=[].
    """
    if not isinstance(value, dict):
        logger.warning("router.parse: non-dict response %r — defaulting to all fills", value)
        return {
            "needs_skeleton": False,
            "fills": list(VALID_FILLS),
            "reason": "router returned non-dict; running all fills as a safety net",
        }

    needs_skeleton = bool(value.get("needs_skeleton", False))
    raw_fills = value.get("fills", [])
    if not isinstance(raw_fills, list):
        raw_fills = []
    seen: set[str] = set()
    fills: list[str] = []
    for f in raw_fills:
        if not isinstance(f, str):
            continue
        normalized = f.strip().lower()
        if normalized in VALID_FILLS and normalized not in seen:
            seen.add(normalized)
            fills.append(normalized)

    if needs_skeleton:
        fills = []  # invariant: fallback path doesn't need fills

    reason = value.get("reason")
    if not isinstance(reason, str):
        reason = ""

    return {"needs_skeleton": needs_skeleton, "fills": fills, "reason": reason}
