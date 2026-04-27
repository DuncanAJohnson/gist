"""Controls remix stage: edit the parent's `controls` slice in place."""

from gist_instructions import (  # type: ignore[import-not-found]
    controls_fill_fragment,
    controls_remix_fragment,
)

from ._base import RemixFillStage


class ControlsRemixStage(RemixFillStage):
    name = "controls"
    output_budget = 2500
    parent_slice_key = "controls"
    fill_fragment = controls_fill_fragment
    remix_fragment = controls_remix_fragment
    include_objects_context = True
