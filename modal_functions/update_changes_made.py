"""
Modal serverless function to update the changes_made column for simulations.
Compares a simulation's JSON with its parent's JSON using AI to generate a summary.
"""

import modal
import json
import os
from supabase import create_client, Client

# Create Modal app
app = modal.App("gist-update-changes")

# Define the image with dependencies
image = modal.Image.debian_slim().pip_install(
    "pydantic>=2.0",
    "openai",
    "supabase",
    "fastapi[standard]>=0.100.0"
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
    HTTP endpoint to update the changes_made column for a simulation.
    
    Expected payload:
    {
        "simulation_id": 123
    }
    """
    from fastapi.responses import JSONResponse
    from openai import AsyncOpenAI
    
    simulation_id = request.get("simulation_id")
    
    if not simulation_id:
        return JSONResponse(
            content={"error": "simulation_id is required"},
            status_code=400
        )
    
    try:
        # Initialize Supabase client with private key
        supabase_url = os.environ["SUPABASE_URL"]
        supabase_key = os.environ["SUPABASE_PRIVATE_KEY"]
        supabase: Client = create_client(supabase_url, supabase_key)
        
        # Fetch the simulation
        simulation_response = supabase.table("simulations").select("*").eq("id", simulation_id).single().execute()
        
        if not simulation_response.data:
            return JSONResponse(
                content={"error": f"Simulation {simulation_id} not found"},
                status_code=404
            )
        
        simulation = simulation_response.data
        parent_id = simulation.get("parent_id")
        
        # If no parent_id, there's nothing to compare
        if not parent_id:
            return JSONResponse(
                content={
                    "success": True,
                    "message": "No parent simulation, skipping changes_made update"
                }
            )
        
        # Fetch the parent simulation
        parent_response = supabase.table("simulations").select("json").eq("id", parent_id).single().execute()
        
        if not parent_response.data:
            return JSONResponse(
                content={"error": f"Parent simulation {parent_id} not found"},
                status_code=404
            )
        
        parent_json = parent_response.data.get("json")
        current_json = simulation.get("json")
        
        # Use AI to compare the two JSONs
        client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
        
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

        # Use the Responses API similar to openai_api.py
        input_messages = [{
            "type": "message",
            "role": "user",
            "content": comparison_prompt
        }]
        
        request_params = {
            "model": "gpt-5-mini",
            "input": input_messages,
            "max_output_tokens": 200,
            "stream": False,
            "text": {
                "format": {
                    "type": "text"
                }
            }
        }
        
        response = await client.responses.create(**request_params)
        
        # Extract the text content from the response
        changes_summary = ""
        if hasattr(response, 'output') and response.output:
            for output_item in response.output:
                if hasattr(output_item, 'type') and output_item.type == "message":
                    if hasattr(output_item, 'content') and output_item.content:
                        for content_item in output_item.content:
                            if hasattr(content_item, 'type') and content_item.type == "output_text":
                                if hasattr(content_item, 'text'):
                                    changes_summary += content_item.text
        
        # Update the changes_made column
        update_response = supabase.table("simulations").update({
            "changes_made": changes_summary.strip()
        }).eq("id", simulation_id).execute()
        
        return JSONResponse(
            content={
                "success": True,
                "changes_made": changes_summary.strip(),
                "simulation_id": simulation_id
            },
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        )
        
    except Exception as e:
        return JSONResponse(
            content={
                "error": str(e),
                "type": type(e).__name__
            },
            status_code=500,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        )

