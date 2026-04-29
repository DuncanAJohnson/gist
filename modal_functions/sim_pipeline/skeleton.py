"""Skeleton stage: top-level outline with object IDs, svg, position, and intent for each detail.

The LLM emits a `scene_dimension: {axis, size}` describing how many configured
units span the dominant axis of the scene. Post-parse, this stage derives
`environment.pixelsPerUnit = canvas_dim_px / size` so the LLM never has to do
that conversion in its head.
"""

import logging
from typing import Any

from pipeline import Scratch

from gist_instructions import skeleton_fragment  # type: ignore[import-not-found]

from ._base import JsonStage
from ._context import (
    SIMULATION_HEIGHT_PX,
    SIMULATION_WIDTH_PX,
    manifest_names_block,
)

logger = logging.getLogger(__name__)

DEFAULT_PIXELS_PER_UNIT = 100.0


class SkeletonStage(JsonStage):
    name = "skeleton"
    output_budget = 2000
    stage_fragment = skeleton_fragment

    def extra_blocks(self, scratch: Scratch) -> str:
        return manifest_names_block()

    def parse(self, response: str) -> Any:
        value = super().parse(response)
        if isinstance(value, dict):
            _inject_pixels_per_unit(value)
        return value


def _inject_pixels_per_unit(skeleton: dict) -> None:
    """Compute and write `environment.pixelsPerUnit` from `scene_dimension`.

    Falls back to DEFAULT_PIXELS_PER_UNIT (with a warning) when the LLM omits
    or malforms scene_dimension. Strips any pixelsPerUnit the LLM may have
    written despite instructions, so the derived value always wins.
    """
    env = skeleton.setdefault("environment", {})
    if not isinstance(env, dict):
        env = {}
        skeleton["environment"] = env

    scene = skeleton.get("scene_dimension")
    ppu: float | None = None
    if isinstance(scene, dict):
        axis = scene.get("axis")
        try:
            size = float(scene.get("size", 0))
        except (TypeError, ValueError):
            size = 0.0
        if size > 0:
            if axis == "width":
                ppu = SIMULATION_WIDTH_PX / size
            elif axis == "height":
                ppu = SIMULATION_HEIGHT_PX / size
            else:
                logger.warning(
                    "skeleton: scene_dimension.axis=%r is not 'width' or 'height'; "
                    "falling back to default pixelsPerUnit",
                    axis,
                )
        else:
            logger.warning(
                "skeleton: scene_dimension.size=%r is not positive; "
                "falling back to default pixelsPerUnit",
                scene.get("size"),
            )
    else:
        logger.warning(
            "skeleton: missing/invalid scene_dimension; "
            "falling back to default pixelsPerUnit"
        )

    if ppu is None or ppu <= 0:
        ppu = DEFAULT_PIXELS_PER_UNIT

    env["pixelsPerUnit"] = ppu
