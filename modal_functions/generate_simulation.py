"""
Modal serverless function for generating simulations from natural-language prompts.

A thin dispatcher: selects an AI provider (OpenAI, SkoleGPT, …) based on the
request body, then hands off to the matching module in `providers/`. Handles
conversation history, schema/instructions priming, and renderable context.
"""

import modal
import json
import os
from gist_instructions import instructions
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = modal.App("gist-generate-simulation")

_current_dir = os.path.dirname(os.path.abspath(__file__))
_schema_local_path = os.path.join(_current_dir, 'simulation_schema.json')
_instructions_local_path = os.path.join(_current_dir, 'gist_instructions.py')
_renderables_manifest_local_path = os.path.join(
    _current_dir, '..', 'public', 'renderables', 'manifest.json'
)
_providers_local_dir = os.path.join(_current_dir, 'providers')

image = (
    modal.Image.debian_slim()
    .pip_install("openai", "aiohttp", "fastapi[standard]")
    .add_local_file(local_path=_schema_local_path, remote_path="/root/simulation_schema.json")
    .add_local_file(local_path=_instructions_local_path, remote_path="/root/gist_instructions.py")
    .add_local_file(
        local_path=_renderables_manifest_local_path,
        remote_path="/root/renderables_manifest.json",
    )
    .add_local_dir(local_path=_providers_local_dir, remote_path="/root/providers")
)

SCHEMA_REMOTE_PATH = "/root/simulation_schema.json"
RENDERABLES_MANIFEST_REMOTE_PATH = "/root/renderables_manifest.json"

_schema_instructions_cache = None
_renderables_instructions_cache = None


def get_schema_instructions():
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


def get_renderables_instructions():
    global _renderables_instructions_cache
    if _renderables_instructions_cache is None:
        with open(RENDERABLES_MANIFEST_REMOTE_PATH, 'r') as f:
            manifest = json.load(f)
        lines = []
        for item in manifest.get("items", []):
            if item.get("status") != "approved":
                continue
            name = item.get("name")
            display_name = item.get("display_name", name)
            if not name:
                continue
            lines.append(f"- {name} — {display_name}")
        listing = "\n".join(lines)
        _renderables_instructions_cache = f"""
## AVAILABLE RENDERABLES

The following bundled SVG assets are available. When populating
`renderables[].visual.name`, you MUST pick the left-hand `name` from this list
verbatim. Do not invent names that are not in this list.

{listing}
"""
    return _renderables_instructions_cache


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("gist-openai-key"),
        modal.Secret.from_name("gist-skolegpt-key"),
    ],
    timeout=300,
)
async def generate_simulation(
    messages: list[dict],
    provider: str,
    model: str,
    max_tokens: int = 100000,
) -> dict:
    """
    Args:
        messages: List of {role, content} dicts.
        provider: Provider key (e.g. "openai", "skolegpt").
        model: Model name understood by the chosen provider.
        max_tokens: Max generation length.
    """
    from providers import dispatch

    combined_instructions = (
        instructions
        + "\n\n"
        + get_schema_instructions()
        + "\n\n"
        + get_renderables_instructions()
    )

    return await dispatch(
        provider=provider,
        messages=messages,
        model=model,
        max_tokens=max_tokens,
        instructions=combined_instructions,
    )


web_app = FastAPI()
web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


@web_app.post("/")
async def chat_endpoint(request: dict):
    """
    Expected payload:
    {
        "messages": [{"role": "...", "content": "..."}],
        "provider": "openai" | "skolegpt",
        "model": "gpt-5-mini",
        "max_tokens": 100000
    }
    """
    messages = request.get("messages", [])
    provider = request.get("provider")
    model = request.get("model")
    max_tokens = request.get("max_tokens", 100000)

    if not messages:
        return JSONResponse(content={"error": "No messages provided"}, status_code=400)
    if not provider:
        return JSONResponse(content={"error": "provider is required"}, status_code=400)
    if not model:
        return JSONResponse(content={"error": "model is required"}, status_code=400)

    result = await generate_simulation.remote.aio(
        messages=messages,
        provider=provider,
        model=model,
        max_tokens=max_tokens,
    )
    return JSONResponse(content=result)


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("gist-openai-key"),
        modal.Secret.from_name("gist-skolegpt-key"),
    ],
)
@modal.asgi_app()
def fastapi_app():
    return web_app
