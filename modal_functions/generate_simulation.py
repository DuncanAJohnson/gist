"""
Modal serverless function for generating simulations from natural-language prompts.

The FastAPI handler streams SSE events from `sim_pipeline.run_sim_pipeline_sse`
directly. The wire format on the response stream is:

    data: {"type":"progress","stage":"<id>","status":"started"|"done","label":"..."}\n\n
    ...
    data: {"type":"content","content":"<stringified SimulationConfig JSON>"}\n\n
    data: {"type":"done"}\n\n

On failure, a single `{"type":"error","error":"..."}` event closes the stream.
The frontend at `src/components/CreateSimulation.tsx` parses these events to
drive the live progress bar and stage-status text.
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
logger = logging.getLogger("generate_simulation")


app = modal.App("gist-generate-simulation")

_current_dir = os.path.dirname(os.path.abspath(__file__))
_schema_local_path = os.path.join(_current_dir, "simulation_schema.json")
_instructions_local_path = os.path.join(_current_dir, "gist_instructions.py")
_renderables_manifest_local_path = os.path.join(
    _current_dir, "..", "public", "renderables", "manifest.json"
)
_pipeline_local_dir = os.path.join(_current_dir, "pipeline")
_sim_pipeline_local_dir = os.path.join(_current_dir, "sim_pipeline")

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
async def chat_endpoint(request: dict):
    """
    Expected payload:
    {
        "messages": [{"role": "...", "content": "..."}],
        "model": "gpt-5-mini"
    }

    Returns: text/event-stream of SSE events (see module docstring).
    """
    from sim_pipeline import run_sim_pipeline_sse

    messages = request.get("messages", [])
    model = request.get("model")

    if not messages:
        return JSONResponse(content={"error": "No messages provided"}, status_code=400)
    if not model:
        return JSONResponse(content={"error": "model is required"}, status_code=400)

    logger.info(
        "endpoint: incoming request (model=%s, n_messages=%d, last_user_chars=%d)",
        model,
        len(messages),
        len((messages[-1] or {}).get("content", "")),
    )

    return StreamingResponse(
        run_sim_pipeline_sse(messages, model=model),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable proxy buffering so events flush in real time
        },
    )


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("gist-openai-key")],
    timeout=600,
)
@modal.asgi_app()
def fastapi_app():
    return web_app
