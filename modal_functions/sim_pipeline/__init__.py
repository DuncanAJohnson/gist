"""Multi-stage simulation generation pipeline.

Two public entry points:

- `run_sim_pipeline(messages, model)` — non-streaming. Drains the pipeline
  internally and returns the assembled SimulationConfig dict. Useful for tests
  and any one-shot caller.

- `run_sim_pipeline_sse(messages, model)` — async generator yielding SSE-shaped
  strings. Emits a `progress` event (status="started") at the top of each stage
  and (status="done") when each stage finishes, then a single `content` event
  containing the assembled config JSON, then a `done` event. The four detail
  stages run concurrently and emit `done` events in completion order.

Wire-format envelope downstream callers can rely on:
    progress → {type: "progress", stage, status, label?}
    content  → {type: "content", content: <stringified SimulationConfig JSON>}
    done     → {type: "done"}
    error    → {type: "error", error: <message>}
"""

import asyncio
import json
import logging
import time
from typing import AsyncIterator

from pipeline import (
    Scratch,
    Stage,
    call_llm,
    content_event,
    done_event,
    error_event,
    progress_event,
)

from .assemble import assemble_simulation_config
from .controls_fill import ControlsFillStage
from .graphs_fill import GraphsFillStage
from .objects_fill import ObjectsFillStage
from .outputs_fill import OutputsFillStage
from .renderables_fill import RenderablesFillStage
from .skeleton import SkeletonStage

logger = logging.getLogger(__name__)


# Human-readable status strings shown in the frontend progress UI.
STAGE_LABELS: dict[str, str] = {
    "skeleton": "Drafting outline",
    "objects": "Placing objects",
    "renderables": "Picking sprites",
    "controls": "Configuring controls",
    "graphs": "Designing graphs",
    "outputs": "Adding readouts",
}


def _build_stages(model: str | None) -> tuple[list[Stage], list[Stage]]:
    """Return (sequential_stages, parallel_detail_stages). Both share the model."""
    sequential: list[Stage] = [SkeletonStage(), ObjectsFillStage()]
    parallel: list[Stage] = [
        RenderablesFillStage(),
        ControlsFillStage(),
        GraphsFillStage(),
        OutputsFillStage(),
    ]
    if model:
        for s in (*sequential, *parallel):
            s.model = model
    return sequential, parallel


async def _run_stage(stage: Stage, scratch: Scratch) -> None:
    """Build messages, call the LLM, parse the response into scratch.artifacts."""
    started = time.monotonic()
    logger.info(
        "stage[%s]: building messages (model=%s, output_budget=%d)",
        stage.name,
        stage.model,
        stage.output_budget,
    )
    messages = stage.build_messages(scratch)
    logger.info(
        "stage[%s]: dispatching to LLM (n_messages=%d, system_chars=%d)",
        stage.name,
        len(messages),
        len(messages[0]["content"]) if messages else 0,
    )
    response = await call_llm(
        messages, max_tokens=stage.output_budget, model=stage.model
    )
    logger.info(
        "stage[%s]: LLM returned %d chars in %.2fs",
        stage.name,
        len(response),
        time.monotonic() - started,
    )
    scratch.artifacts[stage.name] = stage.parse(response)
    logger.info(
        "stage[%s]: complete in %.2fs total",
        stage.name,
        time.monotonic() - started,
    )


async def run_sim_pipeline(messages: list[dict], model: str | None = None) -> dict:
    """Non-streaming convenience wrapper: drain the SSE generator and return the config dict."""
    config: dict | None = None
    error: str | None = None
    async for event in run_sim_pipeline_sse(messages, model=model):
        # Pull the assembled config out of the content event when we see it.
        # Each event is a `data: {...}\n\n` SSE frame.
        if event.startswith("data: "):
            payload = event[len("data: ") :].strip()
            try:
                obj = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if obj.get("type") == "content":
                try:
                    config = json.loads(obj.get("content", ""))
                except json.JSONDecodeError:
                    config = None
            elif obj.get("type") == "error":
                error = obj.get("error", "unknown error")
    if error:
        raise RuntimeError(error)
    if config is None:
        raise RuntimeError("sim_pipeline: pipeline finished without emitting a config")
    return config


async def run_sim_pipeline_sse(
    messages: list[dict], model: str | None = None
) -> AsyncIterator[str]:
    """Yield SSE events while the pipeline runs.

    Detail stages run concurrently; their `done` events are emitted in
    completion order via asyncio.as_completed.
    """
    sequential, parallel = _build_stages(model)
    scratch = Scratch()
    scratch.history = list(messages)

    pipeline_started = time.monotonic()
    logger.info(
        "sim_pipeline: starting (model=%s, n_messages_in=%d, sequential=%d, parallel=%d)",
        model,
        len(messages),
        len(sequential),
        len(parallel),
    )

    try:
        # ---- Sequential stages: skeleton, then objects ----
        for stage in sequential:
            label = STAGE_LABELS.get(stage.name, stage.name)
            logger.info("sim_pipeline: → entering stage %s (%s)", stage.name, label)
            yield progress_event(stage.name, status="started", label=label)
            await _run_stage(stage, scratch)
            yield progress_event(stage.name, status="done", label=label)
            logger.info("sim_pipeline: ← exited stage %s", stage.name)

        # ---- Parallel detail stages: emit started for all, then done in completion order ----
        logger.info(
            "sim_pipeline: launching %d detail stages in parallel: %s",
            len(parallel),
            [s.name for s in parallel],
        )
        for stage in parallel:
            label = STAGE_LABELS.get(stage.name, stage.name)
            yield progress_event(stage.name, status="started", label=label)

        async def run_named(stage: Stage) -> str:
            await _run_stage(stage, scratch)
            return stage.name

        pending = {asyncio.create_task(run_named(s)): s for s in parallel}
        try:
            for fut in asyncio.as_completed(list(pending.keys())):
                name = await fut
                logger.info("sim_pipeline: parallel stage %s finished", name)
                yield progress_event(
                    name, status="done", label=STAGE_LABELS.get(name, name)
                )
        except Exception:
            # Cancel any still-pending detail tasks so they don't keep running.
            for t in pending:
                if not t.done():
                    t.cancel()
            raise

        # ---- Assemble & emit final config ----
        logger.info(
            "sim_pipeline: all stages complete in %.2fs, assembling SimulationConfig",
            time.monotonic() - pipeline_started,
        )
        config = assemble_simulation_config(scratch.artifacts)
        logger.info(
            "sim_pipeline: assembled config: title=%r objects=%d controls=%d graphs=%d outputs=%d renderables=%d",
            config.get("title"),
            len(config.get("objects", [])),
            len(config.get("controls", [])),
            len(config.get("graphs", [])),
            len(config.get("outputs", [])),
            len(config.get("renderables", [])),
        )
        yield content_event(json.dumps(config))
        yield done_event()
        logger.info(
            "sim_pipeline: done in %.2fs total", time.monotonic() - pipeline_started
        )
    except Exception as e:
        logger.exception(
            "sim_pipeline: failed after %.2fs", time.monotonic() - pipeline_started
        )
        yield error_event(str(e))


__all__ = [
    "run_sim_pipeline",
    "run_sim_pipeline_sse",
    "assemble_simulation_config",
    "STAGE_LABELS",
    "SkeletonStage",
    "ObjectsFillStage",
    "RenderablesFillStage",
    "ControlsFillStage",
    "GraphsFillStage",
    "OutputsFillStage",
]
