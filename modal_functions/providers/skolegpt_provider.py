"""
SkoleGPT provider — OpenAI-compatible Chat Completions over HTTPS.

SkoleGPT only answers when `stream: true` (a non-stream request comes back as
literal `null`). We stream from SkoleGPT, aggregate the SSE delta chunks here,
and return a single content string so callers can stay non-streaming.
"""

import json
import os
import aiohttp


async def generate(
    messages: list[dict],
    model: str,
    max_tokens: int,
    instructions: str | None = None,
) -> dict:
    api_url = os.environ.get("SKOLEGPT_API_URL")
    api_key = os.environ.get("SKOLEGPT_API_KEY")
    if not api_url or not api_key:
        return {
            "type": "error",
            "error": "SKOLEGPT_API_URL and SKOLEGPT_API_KEY must be set",
        }

    # Chat Completions has no separate instructions field, so we fold the
    # priming in as a leading system message.
    api_messages: list[dict] = []
    if instructions:
        api_messages.append({"role": "system", "content": instructions})
    for msg in messages:
        api_messages.append({"role": msg["role"], "content": msg["content"]})

    payload = {
        "model": model,
        "messages": api_messages,
        "max_tokens": max_tokens,
        "stream": True,
        "temperature": 0.7,
        "top_p": 0.95,
        "presence_penalty": 0,
        "frequency_penalty": 0,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "Accept": "text/event-stream",
    }

    content_parts: list[str] = []
    finish_reason: str | None = None
    buffer = b""

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(api_url, json=payload, headers=headers) as response:
                if not response.ok:
                    body = await response.text()
                    return {
                        "type": "error",
                        "error": f"SkoleGPT API error {response.status}: {body}",
                    }

                async for chunk in response.content.iter_any():
                    buffer += chunk
                    while b"\n" in buffer:
                        line_bytes, buffer = buffer.split(b"\n", 1)
                        line = line_bytes.decode("utf-8", errors="ignore").strip()
                        if not line.startswith("data:"):
                            continue
                        data_str = line[len("data:"):].strip()
                        if not data_str or data_str == "[DONE]":
                            continue
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        choices = data.get("choices") or []
                        if not choices:
                            continue
                        first = choices[0] or {}
                        delta = first.get("delta") or {}
                        piece = delta.get("content")
                        if piece:
                            content_parts.append(piece)
                        if first.get("finish_reason"):
                            finish_reason = first["finish_reason"]
    except Exception as e:
        return {"type": "error", "error": str(e)}

    if not content_parts:
        return {"type": "error", "error": "SkoleGPT stream produced no content"}

    content = "".join(content_parts)
    if finish_reason == "length":
        return {
            "type": "error",
            "error": (
                "SkoleGPT truncated the response (finish_reason=length). "
                "The model hit its output-token cap before completing the JSON. "
                "Try a simpler prompt or a model with a larger output limit."
            ),
            "partial_content": content,
        }
    return {"type": "success", "content": content, "finish_reason": finish_reason}
