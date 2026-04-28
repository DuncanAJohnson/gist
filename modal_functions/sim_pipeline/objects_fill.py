"""Objects fill stage: full ObjectConfig[] derived from the skeleton's object_skeletons.

Each object is described by id, x, y, width, height, svg + physics fields. The
skeleton already chose `svg`, `x`, `y` and the environment's `pixelsPerUnit`;
this stage chooses the bounding-box `width`/`height` (using world knowledge of
typical real-world object sizes for the chosen svg) and the physics tuning.
"""

import json

from pipeline import Scratch

from gist_instructions import objects_fill_fragment  # type: ignore[import-not-found]

from ._base import JsonStage
from ._context import (
    SIMULATION_HEIGHT_PX,
    SIMULATION_WIDTH_PX,
    manifest_names_block,
)


class ObjectsFillStage(JsonStage):
    name = "objects"
    output_budget = 3000
    stage_fragment = objects_fill_fragment

    def extra_blocks(self, scratch: Scratch) -> str:
        return manifest_names_block()

    def build_user_messages(self, scratch: Scratch) -> list[dict]:
        skeleton = scratch.artifacts.get("skeleton", {})
        env = skeleton.get("environment", {}) if isinstance(skeleton, dict) else {}
        ppu = env.get("pixelsPerUnit", 10) or 10
        unit = env.get("unit", "m")
        try:
            ppu_val = float(ppu)
        except (TypeError, ValueError):
            ppu_val = 10.0
        canvas_w_si = SIMULATION_WIDTH_PX / ppu_val
        canvas_h_si = SIMULATION_HEIGHT_PX / ppu_val

        skeleton_msg = {
            "role": "user",
            "content": (
                "The skeleton stage produced this outline. Use the object IDs, "
                "`svg`, and (x, y) positions exactly as listed; produce one "
                "ObjectConfig per entry in `object_skeletons`.\n\n"
                f"The scene's canvas spans 0 to {canvas_w_si:g} {unit} "
                f"horizontally and 0 to {canvas_h_si:g} {unit} vertically "
                "(origin at bottom-left, Y up). This was sized for the "
                "scene's dominant axis already — the largest object in the "
                "scene should naturally fit this canvas. Pick each object's "
                "`width` and `height` to match the typical real-world "
                "bounding-box of the chosen svg (e.g. soccer_ball "
                "~0.22 m, brick_block ~0.5 m, boat ~5 m, person ~1.8 m tall, "
                "airplane ~30 m wingspan). Emit `width` and `height` in the "
                f"configured unit ({unit}).\n\n"
                f"```json\n{json.dumps(skeleton, indent=2)}\n```"
            ),
        }
        return [*scratch.history, skeleton_msg]
