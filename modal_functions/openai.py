"""
Modal serverless function for streaming OpenAI responses using the Responses API.
Handles conversation history, coding level priming, and context injection.
Converts legacy message format to new Responses API format internally.
"""

import modal
import json
from typing import AsyncIterator

# Create Modal app
app = modal.App("coderobots-openai-stream")

# Define the image with dependencies
image = modal.Image.debian_slim().pip_install("openai", "fastapi[standard]")


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("openai-api-key")],
    timeout=300,  # 5 minute timeout
)
async def stream_chat_completion(
    messages: list[dict],
    model: str = "gpt-5-nano",
    max_tokens: int = 100000,
) -> AsyncIterator[str]:
    """
    Stream OpenAI responses using the new Responses API with Server-Sent Events format.
    
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
        # Convert messages to new Responses API format
        instructions = None
        input_messages = []
        
        for msg in messages:
            if msg["role"] == "system":
                # Combine system messages into instructions
                if instructions is None:
                    instructions = msg["content"]
                else:
                    instructions += "\n\n" + msg["content"]
            else:
                # Convert user/assistant messages to input format
                input_messages.append({
                    "type": "message",
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        # Build request parameters for new Responses API
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
        
        # Add instructions if system messages were present
        if instructions:
            request_params["instructions"] = instructions
        
        # Create streaming response with new API
        stream = await client.responses.create(**request_params)
        
        # Stream chunks as SSE format
        async for event in stream:
            # Handle different event types from the Responses API
            if hasattr(event, 'type'):
                # Handle text delta events - the main streaming content
                if event.type == "response.output_text.delta":
                    if hasattr(event, 'delta') and event.delta:
                        # delta is a string directly, not an object
                        data = json.dumps({
                            "type": "content",
                            "content": event.delta
                        })
                        yield f"data: {data}\n\n"
        
        # Send completion signal
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        
    except Exception as e:
        # Send error message
        error_data = json.dumps({
            "type": "error",
            "error": str(e)
        })
        yield f"data: {error_data}\n\n"


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("openai-api-key")],
)
@modal.fastapi_endpoint(method="POST")
async def chat_endpoint(request: dict):
    """
    HTTP endpoint for chat requests.
    Accepts JSON payload with conversation data.
    
    Expected payload:
    {
        "messages": [{"role": "system|user|assistant", "content": "..."}],
        "model": "gpt-5-nano",
        "max_tokens": 10000
    }
    """
    from fastapi.responses import StreamingResponse
    
    # Extract parameters
    messages = request.get("messages", [])
    model = request.get("model", "gpt-5-nano")
    max_tokens = request.get("max_tokens", 100000)
    
    if not messages:
        return {"error": "No messages provided"}, 400
    
    # Return streaming response
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

