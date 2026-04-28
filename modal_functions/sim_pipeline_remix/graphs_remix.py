"""Graphs remix stage: edit the parent's `graphs` slice in place."""

from gist_instructions import (  # type: ignore[import-not-found]
    graphs_fill_fragment,
    graphs_remix_fragment,
)

from ._base import RemixFillStage


class GraphsRemixStage(RemixFillStage):
    name = "graphs"
    output_budget = 2000
    parent_slice_key = "graphs"
    fill_fragment = graphs_fill_fragment
    remix_fragment = graphs_remix_fragment
    include_objects_context = True
