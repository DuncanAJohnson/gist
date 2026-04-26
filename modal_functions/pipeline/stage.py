"""Stage base class and shared Scratch state for pipelines."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Scratch:
    """Shared state passed through a pipeline.

    Stages read history/artifacts and write their output to artifacts[name].
    history holds the conversation as a list of {role, content} dicts.
    meta is a free-form bag for token counts, timings, retrieved doc names, etc.
    """

    history: list[dict] = field(default_factory=list)
    artifacts: dict[str, Any] = field(default_factory=dict)
    meta: dict[str, Any] = field(default_factory=dict)


class Stage:
    """Base class for a single LLM step.

    Subclasses set `name` and override `build_messages`. They may override `parse`
    to post-process the model's text response before it is stored in scratch.

    `output_budget` is passed to the LLM as max_tokens. `input_budget` is advisory —
    stages can use it inside `build_messages` to trim history (see budget.fit).
    """

    name: str = "stage"
    output_budget: int = 1000
    input_budget: int = 8000
    model: str | None = None  # overrides PIPELINE provider's default model when set
    provider: str | None = None  # overrides PIPELINE_LLM_PROVIDER env var when set ("openai" | "skolegpt")

    def build_messages(self, scratch: Scratch) -> list[dict]:
        raise NotImplementedError(f"{self.__class__.__name__}.build_messages")

    def parse(self, response: str) -> Any:
        return response
