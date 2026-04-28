"""Shared pipeline library for orchestrating chains of LLM calls.

Compose Stages with Linear/FanOut, share state via Scratch, emit SSE-shaped events
that match the {type: content|progress|done|error} wire format.
"""

from .budget import count_messages_tokens, count_tokens, fit, summarize_if_over
from .extras import DocRouter, to_danish
from .llm import (
    call_gemma,
    call_llm,
    call_openai,
    stream_gemma,
    stream_llm,
    stream_openai,
)
from .pipeline import FanOut, Linear
from .sse import as_sse, content_event, done_event, error_event, progress_event
from .stage import Scratch, Stage

__all__ = [
    "Stage",
    "Scratch",
    "Linear",
    "FanOut",
    "call_llm",
    "stream_llm",
    "call_openai",
    "stream_openai",
    "call_gemma",
    "stream_gemma",
    "as_sse",
    "content_event",
    "done_event",
    "error_event",
    "progress_event",
    "count_tokens",
    "count_messages_tokens",
    "fit",
    "summarize_if_over",
    "DocRouter",
    "to_danish",
]
