"""LLM call primitives.

Two backends are supported: SkoleGPT (Gemma 3 12B) and OpenAI Chat Completions.
The wire format on both sides is OpenAI-compatible (`messages` in, streamed
`choices[0].delta.content` out), which is what makes a single dispatcher viable.

Stages should call `call_llm` / `stream_llm`. Those pick the backend from
`PIPELINE_LLM_PROVIDER` (default `openai`) and the model from the call's `model`
arg, falling back to `OPENAI_MODEL` / `SKOLEGPT_MODEL` env vars.
"""

import json
import logging
import os
import time
from typing import AsyncIterator

logger = logging.getLogger(__name__)


def _approx_tokens(messages: list[dict]) -> int:
    """Rough chars/4 estimate so we can log prompt size without pulling a tokenizer."""
    return sum(len(m.get("content", "")) for m in messages) // 4


# ---------- SkoleGPT (Gemma) ----------


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
    """Call Gemma and return the full response as a single string."""
    chunks: list[str] = []
    async for token in stream_gemma(
        messages, max_tokens=max_tokens, temperature=temperature
    ):
        chunks.append(token)
    return "".join(chunks)


# ---------- OpenAI ----------


def _openai_default_model() -> str:
    return os.environ.get("OPENAI_MODEL", "gpt-5-mini")


def _supports_reasoning_effort(model: str) -> bool:
    """gpt-5/o-series accept `reasoning_effort`; gpt-4 and earlier reject it."""
    m = model.lower()
    return m.startswith(("o1", "o3", "o4", "gpt-5"))


def _default_reasoning_effort() -> str | None:
    """Default reasoning effort for OpenAI calls.

    Matters because `max_completion_tokens` is the cap on reasoning + output
    combined. With gpt-5-mini's default reasoning effort, a stage with a
    1500-token budget can spend all 1500 on reasoning and emit zero output.
    `low` keeps reasoning under ~400 tokens for JSON-emission workloads.

    Override via PIPELINE_REASONING_EFFORT (set to "minimal", "low", "medium",
    "high", or "none" to disable).
    """
    val = os.environ.get("PIPELINE_REASONING_EFFORT", "low").lower()
    return None if val in ("none", "off", "") else val


async def call_openai(
    messages: list[dict],
    *,
    max_tokens: int | None = None,
    temperature: float | None = None,
    model: str | None = None,
    reasoning_effort: str | None | object = ...,
) -> str:
    """Call OpenAI Chat Completions and return the full response as a string.

    Reads OPENAI_API_KEY from the environment. `temperature` is omitted from the
    request when None — gpt-5/o-series only accept the default and reject custom
    values. `reasoning_effort` is sent only for models that support it; pass
    None to suppress, omit to use the default (`PIPELINE_REASONING_EFFORT`).
    """
    from openai import AsyncOpenAI

    actual_model = model or _openai_default_model()
    actual_effort = (
        _default_reasoning_effort() if reasoning_effort is ... else reasoning_effort
    )
    client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
    kwargs: dict = {
        "model": actual_model,
        "messages": [{"role": m["role"], "content": m["content"]} for m in messages],
    }
    if max_tokens is not None:
        kwargs["max_completion_tokens"] = max_tokens
    if temperature is not None:
        kwargs["temperature"] = temperature
    if actual_effort and _supports_reasoning_effort(actual_model):
        kwargs["reasoning_effort"] = actual_effort

    logger.info(
        "openai.call: model=%s messages=%d approx_in_tokens=%d max_completion_tokens=%s reasoning_effort=%s",
        actual_model,
        len(messages),
        _approx_tokens(messages),
        max_tokens,
        kwargs.get("reasoning_effort"),
    )
    started = time.monotonic()
    try:
        completion = await client.chat.completions.create(**kwargs)
    except Exception:
        logger.exception(
            "openai.call: failed after %.2fs (model=%s)",
            time.monotonic() - started,
            actual_model,
        )
        raise
    elapsed = time.monotonic() - started
    content = completion.choices[0].message.content or ""
    usage = getattr(completion, "usage", None)
    logger.info(
        "openai.call: done in %.2fs model=%s out_chars=%d usage=%s",
        elapsed,
        actual_model,
        len(content),
        getattr(usage, "model_dump", lambda: usage)() if usage else None,
    )
    logger.debug("openai.call: output preview: %s", content[:300])
    return content


async def stream_openai(
    messages: list[dict],
    *,
    max_tokens: int | None = None,
    temperature: float | None = None,
    model: str | None = None,
    reasoning_effort: str | None | object = ...,
) -> AsyncIterator[str]:
    """Stream OpenAI Chat Completions one content delta at a time."""
    from openai import AsyncOpenAI

    actual_model = model or _openai_default_model()
    actual_effort = (
        _default_reasoning_effort() if reasoning_effort is ... else reasoning_effort
    )
    client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
    kwargs: dict = {
        "model": actual_model,
        "messages": [{"role": m["role"], "content": m["content"]} for m in messages],
        "stream": True,
    }
    if max_tokens is not None:
        kwargs["max_completion_tokens"] = max_tokens
    if temperature is not None:
        kwargs["temperature"] = temperature
    if actual_effort and _supports_reasoning_effort(actual_model):
        kwargs["reasoning_effort"] = actual_effort

    logger.info(
        "openai.stream: model=%s messages=%d approx_in_tokens=%d reasoning_effort=%s",
        actual_model,
        len(messages),
        _approx_tokens(messages),
        kwargs.get("reasoning_effort"),
    )
    started = time.monotonic()
    chunks_count = 0
    out_chars = 0
    try:
        stream = await client.chat.completions.create(**kwargs)
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                chunks_count += 1
                out_chars += len(delta.content)
                yield delta.content
    finally:
        logger.info(
            "openai.stream: done in %.2fs model=%s chunks=%d out_chars=%d",
            time.monotonic() - started,
            actual_model,
            chunks_count,
            out_chars,
        )


# ---------- Dispatcher ----------


def _selected_provider() -> str:
    return os.environ.get("PIPELINE_LLM_PROVIDER", "openai").lower()


async def call_llm(
    messages: list[dict],
    *,
    max_tokens: int | None = None,
    temperature: float | None = None,
    model: str | None = None,
    reasoning_effort: str | None | object = ...,
) -> str:
    """Provider-agnostic non-streaming call. Picks backend from PIPELINE_LLM_PROVIDER."""
    if _selected_provider() == "skolegpt":
        return await call_gemma(
            messages,
            max_tokens=max_tokens,
            temperature=temperature if temperature is not None else 0.7,
        )
    return await call_openai(
        messages,
        max_tokens=max_tokens,
        temperature=temperature,
        model=model,
        reasoning_effort=reasoning_effort,
    )


async def stream_llm(
    messages: list[dict],
    *,
    max_tokens: int | None = None,
    temperature: float | None = None,
    model: str | None = None,
    reasoning_effort: str | None | object = ...,
) -> AsyncIterator[str]:
    """Provider-agnostic streaming call. Picks backend from PIPELINE_LLM_PROVIDER."""
    if _selected_provider() == "skolegpt":
        async for token in stream_gemma(
            messages,
            max_tokens=max_tokens,
            temperature=temperature if temperature is not None else 0.7,
        ):
            yield token
        return
    async for token in stream_openai(
        messages,
        max_tokens=max_tokens,
        temperature=temperature,
        model=model,
        reasoning_effort=reasoning_effort,
    ):
        yield token
