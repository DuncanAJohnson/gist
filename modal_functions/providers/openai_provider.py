"""
OpenAI provider — uses the Responses API with `reasoning.effort = low`.
"""

import os


async def generate(
    messages: list[dict],
    model: str,
    max_tokens: int,
    instructions: str | None = None,
) -> dict:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

    # Split system messages out of `messages` so they can be appended to
    # `instructions` (the Responses API keeps system priming separate).
    combined_instructions = instructions or ""
    input_messages = []
    for msg in messages:
        if msg["role"] == "system":
            if combined_instructions:
                combined_instructions += "\n\n"
            combined_instructions += msg["content"]
        else:
            input_messages.append({
                "type": "message",
                "role": msg["role"],
                "content": msg["content"],
            })

    request_params = {
        "model": model,
        "input": input_messages,
        "max_output_tokens": max_tokens,
        "reasoning": {"effort": "low"},
        "stream": False,
        "text": {"format": {"type": "text"}},
    }
    if combined_instructions:
        request_params["instructions"] = combined_instructions

    try:
        response = await client.responses.create(**request_params)
    except Exception as e:
        return {"type": "error", "error": str(e)}

    content = ""
    if hasattr(response, "output") and response.output:
        for output_item in response.output:
            if getattr(output_item, "type", None) != "message":
                continue
            for content_item in getattr(output_item, "content", None) or []:
                if getattr(content_item, "type", None) == "output_text":
                    text = getattr(content_item, "text", None)
                    if text:
                        content += text

    return {"type": "success", "content": content}
