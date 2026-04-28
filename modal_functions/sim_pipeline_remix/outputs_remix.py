"""Outputs remix stage: edit the parent's `outputs` slice in place."""

from gist_instructions import (  # type: ignore[import-not-found]
    outputs_fill_fragment,
    outputs_remix_fragment,
)

from ._base import RemixFillStage


class OutputsRemixStage(RemixFillStage):
    name = "outputs"
    output_budget = 1500
    parent_slice_key = "outputs"
    fill_fragment = outputs_fill_fragment
    remix_fragment = outputs_remix_fragment
    # Output groups reference object IDs but rarely need full physics detail —
    # keep tokens lean by skipping the objects context.
    include_objects_context = False
