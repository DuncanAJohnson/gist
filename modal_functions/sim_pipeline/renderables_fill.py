"""Renderables fill stage: top-level renderables[] (one per object), pulling visual.name from manifest."""

import json

from pipeline import Scratch

from gist_instructions import renderables_fill_fragment  # type: ignore[import-not-found]

from ._base import JsonStage
from ._context import renderables_block


class RenderablesFillStage(JsonStage):
    name = "renderables"
    output_budget = 2000
    stage_fragment = renderables_fill_fragment

    def extra_blocks(self, scratch: Scratch) -> str:
        return renderables_block()

    def build_user_messages(self, scratch: Scratch) -> list[dict]:
        objects = scratch.artifacts.get("objects", {}).get("objects", [])
        ctx = {
            "role": "user",
            "content": (
                "Produce one renderable per object below. Match each renderable's "
                "width/height to the object's body geometry.\n\n"
                f"```json\n{json.dumps(objects, indent=2)}\n```"
            ),
        }
        return [*scratch.history, ctx]
