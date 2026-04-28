"""Base class and shared helpers for sim-pipeline stages.

Every sim stage produces JSON. JsonStage handles the boilerplate: post-processing
the model's text response into a parsed dict via a balanced-brace extractor that
mirrors the frontend's extractJSON (`src/components/CreateSimulation.tsx:89`),
so we tolerate the same kinds of stray prose / code fences.
"""

import json
import logging
import re
from typing import Any

from pipeline import Scratch, Stage

from gist_instructions import shared_preamble  # type: ignore[import-not-found]
from ._context import schema_block

logger = logging.getLogger(__name__)


def extract_json(text: str) -> Any:
    """Pull the first parseable JSON object out of free-form model output.

    Strips triple-backtick fences, then scans for the first balanced {...} block
    whose contents parse as JSON. Returns the parsed value (typically a dict).
    Raises ValueError if nothing parses.
    """
    fence_stripped = re.sub(
        r"```(?:json)?\s*([\s\S]*?)```", r"\1", text, flags=re.IGNORECASE
    )

    candidates: list[str] = []
    i = 0
    while i < len(fence_stripped):
        if fence_stripped[i] != "{":
            i += 1
            continue
        depth = 0
        in_string = False
        escape = False
        end = -1
        for j in range(i, len(fence_stripped)):
            ch = fence_stripped[j]
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = j
                    break
        if end >= 0:
            candidates.append(fence_stripped[i : end + 1])
            i = end + 1
        else:
            break

    for cand in candidates:
        try:
            return json.loads(cand)
        except json.JSONDecodeError:
            continue
    raise ValueError(
        f"sim_pipeline.extract_json: no parseable JSON in response (first 200 chars): {text[:200]!r}"
    )


class JsonStage(Stage):
    """A pipeline Stage whose response is parsed as JSON.

    Subclasses set `name`, `output_budget`, override `stage_fragment` (the
    stage-specific instructions appended after the shared preamble), and override
    `build_user_messages(scratch)` to return the per-stage user/assistant turns.

    The system prompt is composed as: shared_preamble + stage_fragment +
    schema_block + (optional `extra_blocks(scratch)` — used by the renderables
    stage to attach the manifest).
    """

    stage_fragment: str = ""

    def system_prompt(self, scratch: Scratch) -> str:
        parts = [shared_preamble.strip(), self.stage_fragment.strip(), schema_block()]
        extra = self.extra_blocks(scratch)
        if extra:
            parts.append(extra)
        return "\n\n".join(parts)

    def extra_blocks(self, scratch: Scratch) -> str:
        return ""

    def build_user_messages(self, scratch: Scratch) -> list[dict]:
        # Default: pass through whatever the caller stored on scratch.history.
        return list(scratch.history)

    def build_messages(self, scratch: Scratch) -> list[dict]:
        return [
            {"role": "system", "content": self.system_prompt(scratch)},
            *self.build_user_messages(scratch),
        ]

    def parse(self, response: str) -> Any:
        try:
            value = extract_json(response)
        except ValueError:
            logger.exception(
                "%s.parse: extract_json failed (response %d chars, preview=%r)",
                self.name,
                len(response),
                response[:300],
            )
            raise
        size_summary: str
        if isinstance(value, dict):
            size_summary = f"dict keys={list(value.keys())}"
        elif isinstance(value, list):
            size_summary = f"list len={len(value)}"
        else:
            size_summary = f"{type(value).__name__}"
        logger.info("%s.parse: extracted %s", self.name, size_summary)
        return value
