"""Compose the final SimulationConfig for a remix run.

Starts from a deep copy of the parent simulation and overwrites ONLY the
slices the router chose to re-run. Title/description/environment are never
touched in remix mode — those would be a skeleton-level change, which the
router routes to the /generate fallback path instead.

A final sanity pass drops any control/graph/output entries whose `targetObj`
no longer exists in the (possibly remixed) `objects` array. This is graceful
degradation for the rare case where an `objects`-only remix removes an object
that downstream slices reference.
"""

import copy
import logging
from typing import Any

logger = logging.getLogger(__name__)


def assemble_remix_config(
    parent_json: dict,
    artifacts: dict[str, Any],
    chosen_fills: list[str],
) -> dict:
    """Merge parent_json with the artifacts produced by chosen fills.

    `artifacts[stage_name]` is the parsed dict that stage's `parse()` returned —
    e.g. `{"controls": [...]}` for the controls stage. We pull out the inner
    array and substitute it into the parent.
    """
    out = copy.deepcopy(parent_json)

    if "objects" in chosen_fills:
        out["objects"] = (artifacts.get("objects") or {}).get(
            "objects", out.get("objects", [])
        )
    if "controls" in chosen_fills:
        out["controls"] = (artifacts.get("controls") or {}).get(
            "controls", out.get("controls", [])
        )
    if "graphs" in chosen_fills:
        out["graphs"] = (artifacts.get("graphs") or {}).get(
            "graphs", out.get("graphs", [])
        )
    if "outputs" in chosen_fills:
        out["outputs"] = (artifacts.get("outputs") or {}).get(
            "outputs", out.get("outputs", [])
        )

    _drop_orphaned_references(out)
    return out


def _drop_orphaned_references(config: dict) -> None:
    """Remove controls/graph-lines/outputs whose targetObj no longer exists."""
    objects = config.get("objects") or []
    valid_ids = {obj.get("id") for obj in objects if isinstance(obj, dict)}

    # Controls: drop entire control if its targetObj is gone.
    controls = config.get("controls") or []
    kept_controls = []
    for ctrl in controls:
        if isinstance(ctrl, dict) and ctrl.get("targetObj") in valid_ids:
            kept_controls.append(ctrl)
        else:
            logger.warning(
                "remix.assemble: dropping orphaned control %r (targetObj=%r not in objects)",
                ctrl.get("label") if isinstance(ctrl, dict) else ctrl,
                ctrl.get("targetObj") if isinstance(ctrl, dict) else None,
            )
    config["controls"] = kept_controls

    # Graphs: drop individual lines whose targetObj is gone; drop the graph
    # entirely if no lines survive.
    graphs = config.get("graphs") or []
    kept_graphs = []
    for graph in graphs:
        if not isinstance(graph, dict):
            continue
        kept_lines = [
            ln
            for ln in (graph.get("lines") or [])
            if isinstance(ln, dict) and ln.get("targetObj") in valid_ids
        ]
        dropped = len(graph.get("lines") or []) - len(kept_lines)
        if dropped:
            logger.warning(
                "remix.assemble: dropping %d orphaned line(s) from graph %r",
                dropped,
                graph.get("title"),
            )
        if kept_lines:
            graph["lines"] = kept_lines
            kept_graphs.append(graph)
        else:
            logger.warning(
                "remix.assemble: dropping graph %r — no surviving lines",
                graph.get("title"),
            )
    config["graphs"] = kept_graphs

    # Outputs: drop individual values whose targetObj is gone; drop the group
    # entirely if no values survive.
    outputs = config.get("outputs") or []
    kept_groups = []
    for group in outputs:
        if not isinstance(group, dict):
            continue
        kept_values = [
            v
            for v in (group.get("values") or [])
            if isinstance(v, dict) and v.get("targetObj") in valid_ids
        ]
        dropped = len(group.get("values") or []) - len(kept_values)
        if dropped:
            logger.warning(
                "remix.assemble: dropping %d orphaned value(s) from output group %r",
                dropped,
                group.get("title"),
            )
        if kept_values:
            group["values"] = kept_values
            kept_groups.append(group)
        else:
            logger.warning(
                "remix.assemble: dropping output group %r — no surviving values",
                group.get("title"),
            )
    config["outputs"] = kept_groups
