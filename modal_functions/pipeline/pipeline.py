"""Pipeline executors: Linear (sequential) and FanOut (parallel + assemble).

Pipelines yield SSE-shaped strings (already wrapped in `data: {...}\\n\\n` framing)
so the caller can pass the generator straight to a FastAPI StreamingResponse.

Composition: a FanOut may be placed anywhere inside a Linear's stage list. A FanOut
as the final stage of a Linear is supported but the assembled output is emitted as
a single content event rather than streamed token-by-token.
"""

import asyncio
import logging
from typing import AsyncIterator, Callable

from .llm import call_llm, stream_llm
from .sse import content_event, done_event, error_event, progress_event
from .stage import Scratch, Stage

logger = logging.getLogger(__name__)


class FanOut:
    """Run N stages in parallel against the same scratch, then assemble their outputs.

    Each stage's parsed output is stored in scratch.artifacts under its name.
    The assembled output is stored under FanOut.name.
    """

    def __init__(
        self,
        stages: list[Stage],
        *,
        name: str,
        assemble: Callable[[dict], object],
    ):
        self.stages = stages
        self.name = name
        self.assemble = assemble
        self.output_budget = 0  # not directly used; each child has its own budget

    async def run(self, scratch: Scratch) -> None:
        async def run_one(stage: Stage):
            messages = stage.build_messages(scratch)
            response = await call_llm(
                messages,
                max_tokens=stage.output_budget,
                model=stage.model,
                provider=stage.provider,
            )
            return stage.name, stage.parse(response)

        results = await asyncio.gather(*(run_one(s) for s in self.stages))
        section_outputs = dict(results)
        for k, v in section_outputs.items():
            scratch.artifacts[k] = v
        scratch.artifacts[self.name] = self.assemble(section_outputs)


class Linear:
    """Run stages in order. The last stage streams content tokens to the client by default.

    Intermediate stages are awaited fully and emit one progress event each. The
    existing aiStream.js client (src/utils/aiStream.js) silently ignores unknown
    event types, so progress events are safe to emit by default.
    """

    def __init__(self, stages: list, *, stream_final: bool = True):
        self.stages = stages
        self.stream_final = stream_final

    async def execute(self, scratch: Scratch) -> AsyncIterator[str]:
        try:
            for i, stage in enumerate(self.stages):
                is_final = i == len(self.stages) - 1
                if isinstance(stage, FanOut):
                    await stage.run(scratch)
                    yield progress_event(stage.name)
                    if is_final and self.stream_final:
                        yield content_event(str(scratch.artifacts.get(stage.name, "")))
                elif is_final and self.stream_final:
                    messages = stage.build_messages(scratch)
                    chunks: list[str] = []
                    async for token in stream_llm(
                        messages,
                        max_tokens=stage.output_budget,
                        model=stage.model,
                        provider=stage.provider,
                    ):
                        chunks.append(token)
                        yield content_event(token)
                    scratch.artifacts[stage.name] = stage.parse("".join(chunks))
                else:
                    messages = stage.build_messages(scratch)
                    response = await call_llm(
                        messages,
                        max_tokens=stage.output_budget,
                        model=stage.model,
                        provider=stage.provider,
                    )
                    scratch.artifacts[stage.name] = stage.parse(response)
                    yield progress_event(stage.name)
            yield done_event()
        except Exception as e:
            logger.exception("Linear.execute: pipeline failed")
            yield error_event(str(e))
