"""Selective-remix simulation pipeline.

Two public entry points:

- `run_remix_pipeline(messages, parent_json, model, provider)` — non-streaming.
  Drains the SSE generator and returns the assembled SimulationConfig dict.
  Raises `RemixFallback` when the router decides a skeleton-level edit is
  required (caller should re-invoke the regular /generate flow).

- `run_remix_pipeline_sse(messages, parent_json, model, provider)` — async
  generator yielding SSE-shaped strings. Pipeline shape:

      router (sequential)
        ├─ if needs_skeleton: emit `fallback` + `done`, return
        └─ otherwise: emit `plan`, fan out chosen fills in parallel,
                      assemble, emit `content` + `done`

Wire-format envelope (extends the /generate format with two new event types):
    progress → {type: "progress", stage, status, label?}
    plan     → {type: "plan", fills: [...], total_stages: N}     (NEW — remix only)
    fallback → {type: "fallback", reason: "..."}                  (NEW — remix only)
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

from .assemble import assemble_remix_config
from .controls_remix import ControlsRemixStage
from .graphs_remix import GraphsRemixStage
from .objects_remix import ObjectsRemixStage
from .outputs_remix import OutputsRemixStage
from .router import RouterStage

logger = logging.getLogger(__name__)


REMIX_STAGE_LABELS: dict[str, str] = {
    "router": "Planning edit",
    "objects": "Updating objects",
    "controls": "Updating controls",
    "graphs": "Updating graphs",
    "outputs": "Updating outputs",
}


_FILL_CLASSES = {
    "objects": ObjectsRemixStage,
    "controls": ControlsRemixStage,
    "graphs": GraphsRemixStage,
    "outputs": OutputsRemixStage,
}


class RemixFallback(Exception):
    """Raised by the non-streaming wrapper when the router asks for /generate fallback."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


# ---------------------------------------------------------------------------
# Remix-specific SSE helpers (kept here so the generic `pipeline/` package
# stays provider-agnostic).
# ---------------------------------------------------------------------------


def plan_event(fills: list[str], total_stages: int) -> str:
    return f"data: {json.dumps({'type': 'plan', 'fills': list(fills), 'total_stages': total_stages})}\n\n"


def fallback_event(reason: str) -> str:
    return f"data: {json.dumps({'type': 'fallback', 'reason': reason})}\n\n"


# ---------------------------------------------------------------------------
# Stage runner — small variant of sim_pipeline._run_stage that also passes
# stage.reasoning_effort. The main difference is logging context.
# ---------------------------------------------------------------------------


async def _run_stage(stage: Stage, scratch: Scratch) -> None:
    started = time.monotonic()
    logger.info(
        "remix.stage[%s]: building messages (provider=%s model=%s output_budget=%d effort=%s)",
        stage.name,
        stage.provider,
        stage.model,
        stage.output_budget,
        stage.reasoning_effort,
    )
    messages = stage.build_messages(scratch)
    logger.info(
        "remix.stage[%s]: dispatching to LLM (n_messages=%d, system_chars=%d)",
        stage.name,
        len(messages),
        len(messages[0]["content"]) if messages else 0,
    )
    llm_kwargs: dict = {
        "max_tokens": stage.output_budget,
        "model": stage.model,
        "provider": stage.provider,
    }
    if stage.reasoning_effort is not None:
        llm_kwargs["reasoning_effort"] = stage.reasoning_effort
    response = await call_llm(messages, **llm_kwargs)
    logger.info(
        "remix.stage[%s]: LLM returned %d chars in %.2fs",
        stage.name,
        len(response),
        time.monotonic() - started,
    )
    scratch.artifacts[stage.name] = stage.parse(response)
    logger.info(
        "remix.stage[%s]: complete in %.2fs total",
        stage.name,
        time.monotonic() - started,
    )


def _build_router(model: str | None, provider: str | None) -> RouterStage:
    stage = RouterStage()
    if provider:
        stage.provider = provider
    # Pin the router to a fast cheap OpenAI model when we have a choice.
    # SkoleGPT has only one model so we just defer to whatever the user passed.
    if (provider or "").lower() == "skolegpt":
        stage.model = model
    else:
        stage.model = "gpt-5-mini"
    return stage


def _build_fills(
    fills: list[str], model: str | None, provider: str | None
) -> list[Stage]:
    stages: list[Stage] = []
    for name in fills:
        cls = _FILL_CLASSES.get(name)
        if cls is None:
            logger.warning("remix: unknown fill name %r — skipping", name)
            continue
        s = cls()
        if model:
            s.model = model
        if provider:
            s.provider = provider
        stages.append(s)
    return stages


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------


async def run_remix_pipeline(
    messages: list[dict],
    parent_json: dict,
    *,
    model: str | None = None,
    provider: str | None = None,
) -> dict:
    """Non-streaming convenience wrapper. Drains the SSE generator and returns
    the assembled config dict. Raises RemixFallback on a needs-skeleton verdict
    and RuntimeError on any other failure.
    """
    config: dict | None = None
    error: str | None = None
    fallback_reason: str | None = None
    async for event in run_remix_pipeline_sse(
        messages, parent_json, model=model, provider=provider
    ):
        if not event.startswith("data: "):
            continue
        payload = event[len("data: ") :].strip()
        try:
            obj = json.loads(payload)
        except json.JSONDecodeError:
            continue
        kind = obj.get("type")
        if kind == "content":
            try:
                config = json.loads(obj.get("content", ""))
            except json.JSONDecodeError:
                config = None
        elif kind == "fallback":
            fallback_reason = obj.get("reason") or "skeleton-level edit"
        elif kind == "error":
            error = obj.get("error", "unknown error")
    if fallback_reason is not None:
        raise RemixFallback(fallback_reason)
    if error:
        raise RuntimeError(error)
    if config is None:
        raise RuntimeError(
            "sim_pipeline_remix: pipeline finished without emitting a config"
        )
    return config


async def run_remix_pipeline_sse(
    messages: list[dict],
    parent_json: dict,
    *,
    model: str | None = None,
    provider: str | None = None,
) -> AsyncIterator[str]:
    """Yield SSE events while the remix pipeline runs."""
    scratch = Scratch()
    scratch.history = list(messages)
    scratch.meta["parent_json"] = parent_json

    pipeline_started = time.monotonic()
    logger.info(
        "remix_pipeline: starting (provider=%s model=%s n_messages=%d parent_objects=%d)",
        provider,
        model,
        len(messages),
        len((parent_json or {}).get("objects") or []),
    )

    try:
        # ---- Sequential router stage ----
        router = _build_router(model, provider)
        label = REMIX_STAGE_LABELS["router"]
        yield progress_event(router.name, status="started", label=label)
        await _run_stage(router, scratch)
        yield progress_event(router.name, status="done", label=label)

        verdict = scratch.artifacts.get("router") or {}
        needs_skeleton = bool(verdict.get("needs_skeleton"))
        chosen: list[str] = list(verdict.get("fills") or [])
        reason: str = verdict.get("reason") or ""
        logger.info(
            "remix_pipeline: router verdict needs_skeleton=%s fills=%s reason=%r",
            needs_skeleton,
            chosen,
            reason,
        )

        if needs_skeleton:
            yield fallback_event(
                reason or "Router determined skeleton must change; falling back to full generation."
            )
            yield done_event()
            return

        # ---- Plan event (drives the frontend progress denominator) ----
        total_stages = 1 + len(chosen)  # router + chosen fills
        yield plan_event(chosen, total_stages=total_stages)

        if not chosen:
            # No-op edit: emit the parent unchanged. Frontend treats this as a
            # soft no-op (toast "no changes needed"), but emit a content event
            # anyway so any non-frontend caller sees a complete result.
            logger.info("remix_pipeline: no fills chosen — emitting parent unchanged")
            yield content_event(json.dumps(parent_json))
            yield done_event()
            return

        # ---- Parallel fill stages ----
        fill_stages = _build_fills(chosen, model, provider)
        for stage in fill_stages:
            stage_label = REMIX_STAGE_LABELS.get(stage.name, stage.name)
            yield progress_event(stage.name, status="started", label=stage_label)

        async def run_named(stage: Stage) -> str:
            await _run_stage(stage, scratch)
            return stage.name

        pending = {asyncio.create_task(run_named(s)): s for s in fill_stages}
        try:
            for fut in asyncio.as_completed(list(pending.keys())):
                name = await fut
                logger.info("remix_pipeline: parallel fill %s finished", name)
                yield progress_event(
                    name,
                    status="done",
                    label=REMIX_STAGE_LABELS.get(name, name),
                )
        except Exception:
            for t in pending:
                if not t.done():
                    t.cancel()
            raise

        # ---- Assemble & emit final config ----
        config = assemble_remix_config(parent_json, scratch.artifacts, chosen)
        logger.info(
            "remix_pipeline: assembled in %.2fs total — fills=%s objects=%d controls=%d graphs=%d outputs=%d",
            time.monotonic() - pipeline_started,
            chosen,
            len(config.get("objects") or []),
            len(config.get("controls") or []),
            len(config.get("graphs") or []),
            len(config.get("outputs") or []),
        )
        yield content_event(json.dumps(config))
        yield done_event()
    except Exception as e:
        logger.exception(
            "remix_pipeline: failed after %.2fs", time.monotonic() - pipeline_started
        )
        yield error_event(str(e))


__all__ = [
    "run_remix_pipeline",
    "run_remix_pipeline_sse",
    "assemble_remix_config",
    "RemixFallback",
    "REMIX_STAGE_LABELS",
    "RouterStage",
    "ObjectsRemixStage",
    "ControlsRemixStage",
    "GraphsRemixStage",
    "OutputsRemixStage",
    "plan_event",
    "fallback_event",
]
