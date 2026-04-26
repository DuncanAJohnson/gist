"""Objects fill stage: full ObjectConfig[] derived from the skeleton's object_skeletons."""

import json

from pipeline import Scratch

from gist_instructions import objects_fill_fragment  # type: ignore[import-not-found]

from ._base import JsonStage


class ObjectsFillStage(JsonStage):
    name = "objects"
    output_budget = 3000
    stage_fragment = objects_fill_fragment

    def build_user_messages(self, scratch: Scratch) -> list[dict]:
        skeleton = scratch.artifacts.get("skeleton", {})
        skeleton_msg = {
            "role": "user",
            "content": (
                "The skeleton stage produced this outline. Use the object IDs and "
                "shape hints exactly as listed; produce one ObjectConfig per entry "
                "in `object_skeletons`.\n\n"
                f"```json\n{json.dumps(skeleton, indent=2)}\n```"
            ),
        }
        return [*scratch.history, skeleton_msg]
