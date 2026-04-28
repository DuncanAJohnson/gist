"""Base class for remix-mode fill stages.

A RemixFillStage edits one slice of an existing SimulationConfig in place. It
reads the parent JSON (full simulation) from `scratch.meta["parent_json"]` and
the user's edit prompt from `scratch.history[-1]`, then asks the LLM for a
NEW slice with the requested edit applied.

Reuses `JsonStage` from `sim_pipeline._base` for response parsing — same
markdown-fence-stripping balanced-brace extractor as the fill stages.
"""

import json

from pipeline import Scratch

from sim_pipeline._base import JsonStage


class RemixFillStage(JsonStage):
    """Edit one slice of an existing simulation in place.

    Subclasses set:
        name: stage identifier ("objects" / "controls" / "graphs" / "outputs")
        parent_slice_key: which top-level key of parent_json this stage edits
        output_budget: matches the equivalent fill stage's budget
        fill_fragment: the original fill stage's fragment (preserves all schema rules)
        remix_fragment: the remix-specific addendum from gist_instructions

    The composed `stage_fragment` is fill_fragment + remix_fragment so the LLM
    sees both the schema rules and the "edit-in-place" framing.
    """

    parent_slice_key: str = ""
    fill_fragment: str = ""
    remix_fragment: str = ""

    # Whether to include the parent's `objects` array as reference context. True
    # for controls/graphs (which target objects); false for objects (the slice
    # being edited IS the objects) and outputs (rarely needs full object detail).
    include_objects_context: bool = False

    @property
    def stage_fragment(self) -> str:  # type: ignore[override]
        return f"{self.fill_fragment.strip()}\n\n{self.remix_fragment.strip()}"

    def build_user_messages(self, scratch: Scratch) -> list[dict]:
        parent = scratch.meta.get("parent_json", {}) or {}
        parent_slice = parent.get(self.parent_slice_key, [])
        edit_prompt = _last_user_message(scratch.history)

        slice_json = json.dumps(parent_slice, indent=2)
        parts = [
            f"Current `{self.parent_slice_key}` slice (the array you are editing):",
            f"```json\n{slice_json}\n```",
        ]
        if self.include_objects_context:
            objects = parent.get("objects", [])
            objects_json = json.dumps(objects, indent=2)
            parts.append(
                "Current `objects` (for reference only — do NOT include them "
                f"in your output, your output is the `{self.parent_slice_key}` slice):"
            )
            parts.append(f"```json\n{objects_json}\n```")

        parts.append(f"User edit request:\n{edit_prompt}")
        parts.append(
            f"Emit the FULL updated `{self.parent_slice_key}` slice (not a "
            "diff). Preserve every entry the edit doesn't mention verbatim. "
            f"Output shape: {{ \"{self.parent_slice_key}\": [...] }}."
        )

        return [{"role": "user", "content": "\n\n".join(parts)}]


def _last_user_message(history: list[dict]) -> str:
    """Pick the latest user message from the conversation history."""
    for msg in reversed(history or []):
        if msg.get("role") == "user":
            return str(msg.get("content", ""))
    return ""


def parent_summary_for_router(parent_json: dict) -> str:
    """Compact text summary of a SimulationConfig for the router stage.

    Keeps the prompt small (~150-400 tokens vs ~1500-3000 for full JSON). The
    router only needs a high-level shape, not full physics fields, to decide
    which slices an edit touches.
    """
    title = parent_json.get("title", "Untitled")
    description = parent_json.get("description", "")
    env = parent_json.get("environment", {}) or {}

    lines: list[str] = [f"title: {title}"]
    if description:
        lines.append(f"description: {description}")

    env_parts: list[str] = []
    if "gravity" in env:
        env_parts.append(f"gravity={env['gravity']}")
    if "unit" in env:
        env_parts.append(f"unit={env['unit']}")
    if env.get("walls") is not None:
        env_parts.append(f"walls={env.get('walls')}")
    if env.get("physicsEngine"):
        env_parts.append(f"engine={env['physicsEngine']}")
    if env_parts:
        lines.append("environment: " + " ".join(env_parts))

    objects = parent_json.get("objects", []) or []
    lines.append(f"objects ({len(objects)}):")
    for obj in objects:
        lines.append(f"  - {_summarize_object(obj)}")

    controls = parent_json.get("controls", []) or []
    lines.append(f"controls ({len(controls)}):")
    for ctrl in controls:
        lines.append(f"  - {_summarize_control(ctrl)}")

    graphs = parent_json.get("graphs", []) or []
    lines.append(f"graphs ({len(graphs)}):")
    for graph in graphs:
        lines.append(f"  - {_summarize_graph(graph)}")

    outputs = parent_json.get("outputs", []) or []
    lines.append(f"outputs ({len(outputs)}):")
    for group in outputs:
        lines.append(f"  - {_summarize_output_group(group)}")

    return "\n".join(lines)


def _summarize_object(obj: dict) -> str:
    if not isinstance(obj, dict):
        return repr(obj)
    parts = [f"id={obj.get('id', '?')}"]
    if "svg" in obj:
        parts.append(f"svg={obj['svg']}")
    if "x" in obj or "y" in obj:
        parts.append(f"@({obj.get('x', '?')},{obj.get('y', '?')})")
    if "width" in obj or "height" in obj:
        parts.append(f"size={obj.get('width', '?')}x{obj.get('height', '?')}")
    vel = obj.get("velocity") or {}
    if isinstance(vel, dict) and (vel.get("x") or vel.get("y")):
        parts.append(f"v=({vel.get('x', 0)},{vel.get('y', 0)})")
    extras = []
    for key in ("mass", "restitution", "isStatic"):
        if key in obj:
            extras.append(f"{key}={obj[key]}")
    if extras:
        parts.append(" ".join(extras))
    return " ".join(parts)


def _summarize_control(ctrl: dict) -> str:
    if not isinstance(ctrl, dict):
        return repr(ctrl)
    label = ctrl.get("label", "?")
    target = f"{ctrl.get('targetObj', '?')}.{ctrl.get('property', '?')}"
    ctype = ctrl.get("type", "?")
    if ctype == "slider":
        return f"slider \"{label}\" → {target} range=[{ctrl.get('min', '?')},{ctrl.get('max', '?')}] default={ctrl.get('defaultValue', '?')}"
    if ctype == "toggle":
        return f"toggle \"{label}\" → {target} default={ctrl.get('defaultValue', '?')}"
    return f"{ctype} \"{label}\" → {target}"


def _summarize_graph(graph: dict) -> str:
    if not isinstance(graph, dict):
        return repr(graph)
    title = graph.get("title", "?")
    lines = graph.get("lines", []) or []
    line_strs = [
        f"{ln.get('targetObj', '?')}.{ln.get('property', '?')}"
        for ln in lines
        if isinstance(ln, dict)
    ]
    yrange = graph.get("yAxisRange") or {}
    return (
        f"\"{title}\" plots [{', '.join(line_strs) or '—'}] "
        f"yRange=[{yrange.get('min', '?')},{yrange.get('max', '?')}]"
    )


def _summarize_output_group(group: dict) -> str:
    if not isinstance(group, dict):
        return repr(group)
    title = group.get("title", "?")
    values = group.get("values", []) or []
    value_strs = [
        f"{v.get('targetObj', '?')}.{v.get('property', '?')}"
        for v in values
        if isinstance(v, dict)
    ]
    return f"\"{title}\": [{', '.join(value_strs) or '—'}]"


__all__ = ["RemixFillStage", "parent_summary_for_router"]
