"""Compose the final SimulationConfig from the per-stage artifacts in scratch.

Pure-Python — no LLM. Runs after `Linear` drains. The stages each emit a slice
of the schema; this module just slots them into one dict.
"""

from typing import Any


def assemble_simulation_config(artifacts: dict[str, Any]) -> dict:
    """Merge skeleton + objects + the four detail stages into a SimulationConfig.

    `artifacts` is the same scratch.artifacts the pipeline wrote into. Detail
    stages run inside a FanOut named "details", so their parsed outputs are at
    `artifacts["renderables"]`, `artifacts["controls"]`, etc., next to the
    FanOut's own assembled value at `artifacts["details"]`.
    """
    skeleton = artifacts.get("skeleton") or {}
    objects_blob = artifacts.get("objects") or {}
    controls_blob = artifacts.get("controls") or {}
    graphs_blob = artifacts.get("graphs") or {}
    outputs_blob = artifacts.get("outputs") or {}

    return {
        "title": skeleton.get("title", "Untitled simulation"),
        "description": skeleton.get("description", ""),
        "environment": skeleton.get("environment", {}),
        "objects": objects_blob.get("objects", []),
        "controls": controls_blob.get("controls", []),
        "outputs": outputs_blob.get("outputs", []),
        "graphs": graphs_blob.get("graphs", []),
    }
