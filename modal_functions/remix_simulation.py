"""
Modal serverless function for remixing existing simulations.

Mirrors `generate_simulation.py` but runs the SELECTIVE remix pipeline
(`sim_pipeline_remix`). The router stage decides which slices of the parent
simulation actually need re-running; only those run, then results are merged
back into the parent. Skeleton-level edits emit a `fallback` event so the
frontend can re-call /generate.

Wire format on the response stream (extends the /generate format):

    data: {"type":"progress","stage":"router|objects|controls|graphs|outputs","status":"started|done","label":"..."}\n\n
    data: {"type":"plan","fills":[...],"total_stages":N}\n\n           # NEW — once, after router
    data: {"type":"fallback","reason":"..."}\n\n                       # NEW — instead of plan/content for skeleton edits
    data: {"type":"content","content":"<stringified SimulationConfig JSON>"}\n\n
    data: {"type":"done"}\n\n

On failure, a single `{"type":"error","error":"..."}` event closes the stream.
"""

import logging
import os

import modal
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse


# Configure root logging once at import time so every module's `logging.getLogger(__name__)`
# inherits a useful format. Modal captures stdout/stderr — INFO+ goes to the function logs.
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
logger = logging.getLogger("remix_simulation")


app = modal.App("gist-remix-simulation")

_current_dir = os.path.dirname(os.path.abspath(__file__))
_schema_local_path = os.path.join(_current_dir, "simulation_schema.json")
_instructions_local_path = os.path.join(_current_dir, "gist_instructions.py")
_renderables_manifest_local_path = os.path.join(
    _current_dir, "..", "public", "renderables", "manifest.json"
)
_pipeline_local_dir = os.path.join(_current_dir, "pipeline")
_sim_pipeline_local_dir = os.path.join(_current_dir, "sim_pipeline")
_sim_pipeline_remix_local_dir = os.path.join(_current_dir, "sim_pipeline_remix")

image = (
    modal.Image.debian_slim()
    .pip_install("openai", "aiohttp", "fastapi[standard]")
    .add_local_file(local_path=_schema_local_path, remote_path="/root/simulation_schema.json")
    .add_local_file(local_path=_instructions_local_path, remote_path="/root/gist_instructions.py")
    .add_local_file(
        local_path=_renderables_manifest_local_path,
        remote_path="/root/renderables_manifest.json",
    )
    .add_local_dir(local_path=_pipeline_local_dir, remote_path="/root/pipeline")
    .add_local_dir(local_path=_sim_pipeline_local_dir, remote_path="/root/sim_pipeline")
    .add_local_dir(
        local_path=_sim_pipeline_remix_local_dir,
        remote_path="/root/sim_pipeline_remix",
    )
)


web_app = FastAPI()
web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Type"],
)


@web_app.post("/")
async def remix_endpoint(request: dict):
    """
    Expected payload:
    {
        "messages":    [{"role": "user", "content": "<edit prompt>"}],
        "parent_json": {<full SimulationConfig of the parent simulation>},
        "model":       "gpt-5-mini" | "skolegpt-v3" | ...,
        "provider":    "openai" | "skolegpt"   // optional; auto-detected from model when omitted
    }

    Returns: text/event-stream of SSE events (see module docstring).
    """
    from sim_pipeline_remix import run_remix_pipeline_sse

    messages = request.get("messages", [])
    parent_json = request.get("parent_json")
    model = request.get("model")
    provider = request.get("provider")

    if not messages:
        return JSONResponse(content={"error": "No messages provided"}, status_code=400)
    if not isinstance(parent_json, dict):
        return JSONResponse(
            content={"error": "parent_json (object) is required"}, status_code=400
        )
    if not model:
        return JSONResponse(content={"error": "model is required"}, status_code=400)

    logger.info(
        "remix.endpoint: incoming (provider=%s model=%s n_messages=%d parent_objects=%d last_user_chars=%d)",
        provider,
        model,
        len(messages),
        len(parent_json.get("objects") or []),
        len((messages[-1] or {}).get("content", "")),
    )

    return StreamingResponse(
        run_remix_pipeline_sse(messages, parent_json, model=model, provider=provider),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable proxy buffering so events flush in real time
        },
    )


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("gist-openai-key"),
        modal.Secret.from_name("gist-skolegpt-key"),
    ],
    timeout=600,
)
@modal.asgi_app()
def fastapi_app():
    return web_app
