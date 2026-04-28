"""
Modal serverless function to update the changes_made column for simulations.
Compares a simulation's JSON with its parent's JSON using AI to generate a summary.

Single-call workload — uses `pipeline.call_llm` directly rather than the full
sim_pipeline. The frontend passes `model` pulled from `src/config/aiProviders.ts`.
"""

import modal
import json
import os

app = modal.App("gist-update-changes")

_current_dir = os.path.dirname(os.path.abspath(__file__))
_pipeline_local_dir = os.path.join(_current_dir, 'pipeline')

image = (
    modal.Image.debian_slim()
    .pip_install(
        "pydantic>=2.0",
        "openai",
        "aiohttp",
        "supabase",
        "fastapi[standard]>=0.100.0",
    )
    .add_local_dir(local_path=_pipeline_local_dir, remote_path="/root/pipeline")
)


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("gist-openai-key"),
        modal.Secret.from_name("gist-supabase"),
    ],
    timeout=300,
)
@modal.fastapi_endpoint(method="POST")
async def update_changes_made(request: dict):
    """
    Expected payload:
    {
        "simulation_id": 123,
        "model": "gpt-5-mini"
    }
    """
    from fastapi.responses import JSONResponse
    from supabase import create_client, Client
    from pipeline import call_llm

    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

    simulation_id = request.get("simulation_id")
    model = request.get("model")

    if not simulation_id:
        return JSONResponse(content={"error": "simulation_id is required"}, status_code=400)
    if not model:
        return JSONResponse(content={"error": "model is required"}, status_code=400)

    try:
        supabase_url = os.environ["SUPABASE_URL"]
        supabase_key = os.environ["SUPABASE_PRIVATE_KEY"]
        supabase: Client = create_client(supabase_url, supabase_key)

        simulation_response = supabase.table("simulations").select("*").eq("id", simulation_id).single().execute()
        if not simulation_response.data:
            return JSONResponse(
                content={"error": f"Simulation {simulation_id} not found"},
                status_code=404,
            )

        simulation = simulation_response.data
        parent_id = simulation.get("parent_id")

        if not parent_id:
            return JSONResponse(content={
                "success": True,
                "message": "No parent simulation, skipping changes_made update",
            })

        parent_response = supabase.table("simulations").select("json").eq("id", parent_id).single().execute()
        if not parent_response.data:
            return JSONResponse(
                content={"error": f"Parent simulation {parent_id} not found"},
                status_code=404,
            )

        parent_json = parent_response.data.get("json")
        current_json = simulation.get("json")

        comparison_prompt = f"""Compare these two physics simulation JSON configurations and write a one-sentence summary of the changes that were made.

Old simulation JSON:
{json.dumps(parent_json, indent=2)}

New simulation JSON:
{json.dumps(current_json, indent=2)}

Write a concise one-sentence summary describing what changed between the old and new simulation.
Focus on meaningful changes like objects added/removed, properties modified, controls changed, etc.
For example:
- "Added a new box with initial velocity of 5 m/s"
- "Modified the default velocity of a ball to 10 m/s"
- "Moved the box slightly to the left"
- "Made the ball green instead of blue"
"""

        try:
            content = await call_llm(
                messages=[{"role": "user", "content": comparison_prompt}],
                model=model,
                max_tokens=200,
            )
        except Exception as e:
            return JSONResponse(
                content={"error": str(e), "type": "provider_error"},
                status_code=502,
                headers=cors_headers,
            )

        changes_summary = (content or "").strip()

        supabase.table("simulations").update({
            "changes_made": changes_summary,
        }).eq("id", simulation_id).execute()

        return JSONResponse(
            content={
                "success": True,
                "changes_made": changes_summary,
                "simulation_id": simulation_id,
            },
            headers=cors_headers,
        )

    except Exception as e:
        return JSONResponse(
            content={"error": str(e), "type": type(e).__name__},
            status_code=500,
            headers=cors_headers,
        )
