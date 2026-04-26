"""SkoleGPT (Gemma 3 12B) call primitives. Pure text in, pure text out — no SSE framing."""

import json
import logging
import os
from typing import AsyncIterator

logger = logging.getLogger(__name__)


async def stream_gemma(
    messages: list[dict],
    *,
    max_tokens: int | None = None,
    temperature: float = 0.7,
) -> AsyncIterator[str]:
    """Stream Gemma's response one content delta at a time.

    Reads SKOLEGPT_API_URL and SKOLEGPT_API_KEY from the environment.
    Raises RuntimeError on misconfiguration or upstream HTTP errors.
    """
    import aiohttp

    api_url = os.environ.get("SKOLEGPT_API_URL")
    api_key = os.environ.get("SKOLEGPT_API_KEY")
    if not api_url or not api_key:
        raise RuntimeError("SKOLEGPT_API_URL and SKOLEGPT_API_KEY must be set")

    payload: dict = {
        "messages": [{"role": m["role"], "content": m["content"]} for m in messages],
        "stream": True,
        "model": "skolegpt-v3",
        "temperature": temperature,
        "presence_penalty": 0,
        "frequency_penalty": 0,
        "top_p": 0.95,
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "Accept": "text/event-stream",
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(api_url, json=payload, headers=headers) as response:
            if response.status >= 400:
                error_text = await response.text()
                logger.warning(
                    f"SkoleGPT API error {response.status}: {error_text[:200]}"
                )
                raise RuntimeError(
                    f"SkoleGPT API error {response.status}: {error_text[:200]}"
                )

            buffer = b""
            async for chunk in response.content.iter_any():
                buffer += chunk
                while b"\n" in buffer:
                    line_bytes, buffer = buffer.split(b"\n", 1)
                    line_str = line_bytes.decode("utf-8", errors="ignore").strip()
                    if not line_str or not line_str.startswith("data: "):
                        continue
                    data_str = line_str[6:]
                    if data_str == "[DONE]":
                        return
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError as e:
                        logger.warning(
                            f"SkoleGPT stream: failed to parse JSON {data_str[:100]}: {e}"
                        )
                        continue
                    choices = data.get("choices") or []
                    if not choices:
                        continue
                    choice = choices[0]
                    content = (choice.get("delta") or {}).get("content")
                    if content:
                        yield content
                    if choice.get("finish_reason"):
                        return


async def call_gemma(
    messages: list[dict],
    *,
    max_tokens: int | None = None,
    temperature: float = 0.7,
) -> str:
    """Call Gemma and return the full response as a single string.

    Implemented as a collector over stream_gemma, so the wire format and error
    behavior match the streaming path exactly.
    """
    chunks: list[str] = []
    async for token in stream_gemma(
        messages, max_tokens=max_tokens, temperature=temperature
    ):
        chunks.append(token)
    return "".join(chunks)
