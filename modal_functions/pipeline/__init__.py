"""Shared pipeline library for orchestrating chains of Gemma 3 12B calls.

Compose Stages with Linear/FanOut, share state via Scratch, emit SSE-shaped events
that are wire-compatible with the existing frontend client at src/utils/aiStream.js.
"""

from .budget import count_messages_tokens, count_tokens, fit, summarize_if_over
from .extras import DocRouter, to_danish
from .llm import call_gemma, stream_gemma
from .pipeline import FanOut, Linear
from .sse import as_sse, content_event, done_event, error_event, progress_event
from .stage import Scratch, Stage

__all__ = [
    "Stage",
    "Scratch",
    "Linear",
    "FanOut",
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
