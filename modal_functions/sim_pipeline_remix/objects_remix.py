"""Objects remix stage: edit the parent's `objects` slice in place."""

from pipeline import Scratch

from gist_instructions import (  # type: ignore[import-not-found]
    objects_fill_fragment,
    objects_remix_fragment,
)
from sim_pipeline._context import manifest_names_block

from ._base import RemixFillStage


class ObjectsRemixStage(RemixFillStage):
    name = "objects"
    output_budget = 3000
    parent_slice_key = "objects"
    fill_fragment = objects_fill_fragment
    remix_fragment = objects_remix_fragment
    include_objects_context = False  # the slice IS the objects array

    def extra_blocks(self, scratch: Scratch) -> str:
        return manifest_names_block()
