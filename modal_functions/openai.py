"""
Modal serverless function for streaming OpenAI responses using the Responses API.
Handles conversation history, coding level priming, and context injection.
Converts legacy message format to new Responses API format internally.
"""

import modal
import json
from typing import AsyncIterator
from gist_instructions import instructions

# Create Modal app
app = modal.App("gist-openai-stream")

# Define the image with dependencies
image = modal.Image.debian_slim().pip_install("openai", "fastapi[standard]")


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("gist-openai-api-key")],
    timeout=300,
)
async def stream_chat_completion(
    messages: list[dict],
    model: str = "gpt-5-mini",
    max_tokens: int = 100000,
) -> AsyncIterator[str]:
    """    
    Args:
        messages: List of message dicts with 'role' and 'content'
        model: OpenAI model name
        max_tokens: Maximum tokens to generate
    
    Yields:
        JSON-formatted chunks for SSE streaming
    """
    import os
    from openai import AsyncOpenAI
    
    # Initialize OpenAI client with API key from Modal secret
    client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
    
    try:
        instructions = None
        input_messages = []
        
        for msg in messages:
            if msg["role"] == "system":
                if instructions is None:
                    instructions = msg["content"]
                else:
                    instructions += "\n\n" + msg["content"]
            else:
                input_messages.append({
                    "type": "message",
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        request_params = {
            "model": model,
            "input": input_messages,
            "max_output_tokens": max_tokens,
            "stream": True,
            "text": {
                "format": {
                    "type": "text"
                }
            }
        }
        
        if instructions:
            request_params["instructions"] = instructions

        stream = await client.responses.create(**request_params)
        
        # Stream chunks as SSE format
        async for event in stream:
            if hasattr(event, 'type'):
                if event.type == "response.output_text.delta":
                    if hasattr(event, 'delta') and event.delta:
                        data = json.dumps({
                            "type": "content",
                            "content": event.delta
                        })
                        yield f"data: {data}\n\n"
        
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        
    except Exception as e:
        error_data = json.dumps({
            "type": "error",
            "error": str(e)
        })
        yield f"data: {error_data}\n\n"


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("gist-openai-api-key")],
)
@modal.fastapi_endpoint(method="POST")
async def chat_endpoint(request: dict):
    """
    HTTP endpoint for chat requests.
    Accepts JSON payload with conversation data.
    
    Expected payload:
    {
        "messages": [{"role": "system|user|assistant", "content": "..."}],
        "model": "gpt-5-mini",
        "max_tokens": 10000
    }
    """
    from fastapi.responses import StreamingResponse
    
    # Extract parameters
    messages = request.get("messages", [])
    model = request.get("model", "gpt-5-mini")
    max_tokens = request.get("max_tokens", 100000)
    
    if not messages:
        return {"error": "No messages provided"}, 400
    
    return StreamingResponse(
        stream_chat_completion.remote_gen(
            messages=messages,
            model=model,
            max_tokens=max_tokens,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    )

