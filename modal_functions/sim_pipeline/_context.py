"""Static context shared across stages: schema JSON and renderables manifest.

Both files ship into the Modal container under /root via add_local_file. When
running locally (e.g. for unit tests), fall back to repo-relative paths.
"""

import json
import logging
import os

logger = logging.getLogger(__name__)


def _first_existing(*candidates: str) -> str | None:
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


_HERE = os.path.dirname(os.path.abspath(__file__))


def _schema_path() -> str:
    path = _first_existing(
        "/root/simulation_schema.json",
        os.path.join(_HERE, "..", "simulation_schema.json"),
    )
    if not path:
        raise FileNotFoundError("simulation_schema.json not found")
    return path


def _manifest_path() -> str:
    path = _first_existing(
        "/root/renderables_manifest.json",
        os.path.join(_HERE, "..", "..", "public", "renderables", "manifest.json"),
    )
    if not path:
        raise FileNotFoundError("renderables manifest.json not found")
    return path


_schema_block_cache: str | None = None
_renderables_block_cache: str | None = None


def schema_block() -> str:
    """Return the SimulationConfig JSON Schema, formatted for inclusion in a system prompt."""
    global _schema_block_cache
    if _schema_block_cache is None:
        with open(_schema_path()) as f:
            schema = json.load(f)
        _schema_block_cache = (
            "## JSON SCHEMA (full SimulationConfig — your output is a slice of this)\n\n"
            "```json\n" + json.dumps(schema, indent=2) + "\n```"
        )
    return _schema_block_cache


def renderables_block() -> str:
    """Return the approved renderables list, formatted as a markdown bullet list."""
    global _renderables_block_cache
    if _renderables_block_cache is None:
        with open(_manifest_path()) as f:
            manifest = json.load(f)
        lines = []
        for item in manifest.get("items", []):
            if item.get("status") != "approved":
                continue
            name = item.get("name")
            display = item.get("display_name", name)
            if not name:
                continue
            lines.append(f"- {name} — {display}")
        _renderables_block_cache = (
            "## AVAILABLE RENDERABLES\n\n"
            "Pick `visual.name` verbatim from the left-hand identifier. Do not invent names.\n\n"
            + "\n".join(lines)
        )
    return _renderables_block_cache
