"""Graphs fill stage: full GraphConfig[] from the skeleton's graph_intents."""

import json

from pipeline import Scratch

from gist_instructions import graphs_fill_fragment  # type: ignore[import-not-found]

from ._base import JsonStage


class GraphsFillStage(JsonStage):
    name = "graphs"
    output_budget = 2000
    stage_fragment = graphs_fill_fragment

    def build_user_messages(self, scratch: Scratch) -> list[dict]:
        skeleton = scratch.artifacts.get("skeleton", {})
        objects = scratch.artifacts.get("objects", {}).get("objects", [])
        intents = skeleton.get("graph_intents", [])
        ctx = {
            "role": "user",
            "content": (
                "Produce one GraphConfig per intent below. Each intent's `tracks` "
                "list maps directly to that graph's `lines`. Match each line's "
                "color to the corresponding object's color when reasonable.\n\n"
                f"graph_intents:\n```json\n{json.dumps(intents, indent=2)}\n```\n\n"
                f"objects:\n```json\n{json.dumps(objects, indent=2)}\n```"
            ),
        }
        return [*scratch.history, ctx]
