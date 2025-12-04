"""
Modal serverless function for OpenAI chat completion using the Responses API.
Handles conversation history, coding level priming, and context injection.
Converts legacy message format to new Responses API format internally.
"""

import modal
import json
import os
from gist_instructions import instructions

# Create Modal app
app = modal.App("gist-openai-stream")

# Get absolute path to schema file for including in the image
_current_dir = os.path.dirname(os.path.abspath(__file__))
_schema_local_path = os.path.join(_current_dir, 'simulation_schema.json')

# Define the image with dependencies and include the schema file
image = modal.Image.debian_slim().pip_install("openai", "fastapi[standard]").add_local_file(
    local_path=_schema_local_path,
    remote_path="/root/simulation_schema.json"
)

# Path to schema in the Modal container
SCHEMA_REMOTE_PATH = "/root/simulation_schema.json"

# Cache for loaded schema
_schema_instructions_cache = None


def get_schema_instructions():
    """Load and cache the schema instructions from the bundled file."""
    global _schema_instructions_cache
    if _schema_instructions_cache is None:
        with open(SCHEMA_REMOTE_PATH, 'r') as f:
            simulation_schema = json.load(f)
        _schema_instructions_cache = f"""
## JSON SCHEMA

The simulation configuration must conform to this JSON Schema. The schema includes detailed descriptions and examples for each field:

```json
{json.dumps(simulation_schema, indent=2)}
```
"""
    return _schema_instructions_cache


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("gist-openai-key")],
    timeout=300,
)
async def chat_completion(
    messages: list[dict],
    model: str = "gpt-5-mini",
    max_tokens: int = 100000,
) -> dict:
    """    
    Args:
        messages: List of message dicts with 'role' and 'content'
        model: OpenAI model name
        max_tokens: Maximum tokens to generate
    
    Returns:
        Dict with the complete response content
    """
    import os
    from openai import AsyncOpenAI
    
    # Initialize OpenAI client with API key from Modal secret
    client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
    
    try:
        input_messages = []
        # Combine base instructions with schema documentation
        combined_instructions = instructions + "\n\n" + get_schema_instructions()
        
        for msg in messages:
            if msg["role"] == "system":
                # Append any additional system messages to instructions
                combined_instructions += "\n\n" + msg["content"]
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
            "reasoning": {
                "effort": "low",
            },
            "stream": False,
            "text": {
                "format": {
                    "type": "text"
                }
            }
        }
        
        if combined_instructions:
            request_params["instructions"] = combined_instructions

        response = await client.responses.create(**request_params)
        
        # Extract the text content from the response
        content = ""
        if hasattr(response, 'output') and response.output:
            for output_item in response.output:
                if hasattr(output_item, 'type') and output_item.type == "message":
                    if hasattr(output_item, 'content') and output_item.content:
                        for content_item in output_item.content:
                            if hasattr(content_item, 'type') and content_item.type == "output_text":
                                if hasattr(content_item, 'text'):
                                    content += content_item.text
        
        return {
            "type": "success",
            "content": content
        }
        
    except Exception as e:
        return {
            "type": "error",
            "error": str(e)
        }


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("gist-openai-key")],
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
    from fastapi.responses import JSONResponse
    
    # Extract parameters
    messages = request.get("messages", [])
    model = request.get("model", "gpt-5-mini")
    max_tokens = request.get("max_tokens", 100000)
    
    if not messages:
        return JSONResponse(
            content={"error": "No messages provided"},
            status_code=400
        )
    
    result = await chat_completion.remote.aio(
        messages=messages,
        model=model,
        max_tokens=max_tokens,
    )
    
    return JSONResponse(
        content=result,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    )
