"""SSE envelope helpers.

Wraps token streams in {type:"content"|"done"|"error"|"progress"} events, matching
the wire format that src/utils/aiStream.js consumes (and tolerates progress events
for via its if/elif chain).
"""

import json
import logging
from typing import AsyncIterator

logger = logging.getLogger(__name__)


def content_event(text: str) -> str:
    return f"data: {json.dumps({'type': 'content', 'content': text})}\n\n"


def done_event() -> str:
    return f"data: {json.dumps({'type': 'done'})}\n\n"


def error_event(message: str) -> str:
    return f"data: {json.dumps({'type': 'error', 'error': message})}\n\n"


def progress_event(
    stage: str, status: str = "done", *, label: str | None = None
) -> str:
    payload: dict = {"type": "progress", "stage": stage, "status": status}
    if label is not None:
        payload["label"] = label
    return f"data: {json.dumps(payload)}\n\n"


async def as_sse(token_iter: AsyncIterator[str]) -> AsyncIterator[str]:
    """Wrap an async token iterator as SSE content events terminated by a done event.

    Exceptions raised by the iterator are caught and re-emitted as a single error
    event so the stream always closes cleanly from the client's perspective.
    """
    try:
        async for token in token_iter:
            if token:
                yield content_event(token)
        yield done_event()
    except Exception as e:
        logger.exception("as_sse: stream failed")
        yield error_event(str(e))
