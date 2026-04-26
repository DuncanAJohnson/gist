"""Outputs fill stage: full OutputGroupConfig[] from the skeleton's output_intents."""

import json

from pipeline import Scratch

from gist_instructions import outputs_fill_fragment  # type: ignore[import-not-found]

from ._base import JsonStage


class OutputsFillStage(JsonStage):
    name = "outputs"
    output_budget = 1500
    stage_fragment = outputs_fill_fragment

    def build_user_messages(self, scratch: Scratch) -> list[dict]:
        skeleton = scratch.artifacts.get("skeleton", {})
        intents = skeleton.get("output_intents", [])
        ctx = {
            "role": "user",
            "content": (
                "Produce one OutputGroupConfig per intent below. Each intent's "
                "`values` list maps directly to that group's `values`.\n\n"
                f"output_intents:\n```json\n{json.dumps(intents, indent=2)}\n```"
            ),
        }
        return [*scratch.history, ctx]
