"""Controls fill stage: full ControlConfig[] from the skeleton's control_intents."""

import json

from pipeline import Scratch

from gist_instructions import controls_fill_fragment  # type: ignore[import-not-found]

from ._base import JsonStage


class ControlsFillStage(JsonStage):
    name = "controls"
    # Bumped from 1500 after a production run where reasoning_tokens=1500 ate
    # the whole budget and left zero output. With `reasoning_effort=low` set
    # in pipeline/llm.py reasoning should stay under ~400 tokens; the headroom
    # here is defense-in-depth against any single prompt that needs more.
    output_budget = 2500
    stage_fragment = controls_fill_fragment

    def build_user_messages(self, scratch: Scratch) -> list[dict]:
        skeleton = scratch.artifacts.get("skeleton", {})
        objects = scratch.artifacts.get("objects", {}).get("objects", [])
        intents = skeleton.get("control_intents", [])
        ctx = {
            "role": "user",
            "content": (
                "Produce one ControlConfig per intent below. Use each intent's "
                "`target_id` as the control's `targetObj`; pick a `property` "
                "consistent with the intent. The objects array is included so you "
                "can match `defaultValue` to the object's actual initial state.\n\n"
                f"control_intents:\n```json\n{json.dumps(intents, indent=2)}\n```\n\n"
                f"objects:\n```json\n{json.dumps(objects, indent=2)}\n```"
            ),
        }
        return [*scratch.history, ctx]
