"""Skeleton stage: top-level outline with object IDs and intent for each detail."""

from gist_instructions import skeleton_fragment  # type: ignore[import-not-found]

from ._base import JsonStage


class SkeletonStage(JsonStage):
    name = "skeleton"
    output_budget = 2000
    stage_fragment = skeleton_fragment
