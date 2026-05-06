# GIST LLM — Context & Prompting

How the LLM side of GIST is wired today, the latent issues in that wiring, and concrete next steps to improve output quality through better prompts and smarter context construction. Companion to [GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md) (system-level engineering concerns) and [GIST_Physics_Wishlist.md](GIST_Physics_Wishlist.md) (forward-looking features). This doc focuses on the AI/prompt layer.

---

## 1. What we have today

### 1.1 Architecture overview

Two pipelines, both running on Modal as serverless FastAPI handlers:

- **`sim_pipeline/`** — full generation from a natural-language prompt. Five stages: `skeleton` → `objects_fill` → `controls_fill` → `graphs_fill` → `outputs_fill` → `assemble`.
- **`sim_pipeline_remix/`** — slice-targeted edits to an existing sim. A `router` stage classifies which slices the edit touches; only those slices regenerate. Falls back to the full pipeline when `needs_skeleton: true`.

Streaming is SSE: the frontend ([CreateSimulation.tsx](src/components/CreateSimulation.tsx)) gets per-stage progress events, then the final assembled JSON.

### 1.2 The prompt is built per-stage, not monolithic

Each stage's system prompt is `shared_preamble + <stage>_fragment + schema_slice + renderables_manifest`. Source: [`modal_functions/gist_instructions.py`](modal_functions/gist_instructions.py).

- **`shared_preamble`** — common framing (canvas, coords, "output JSON only").
- **Stage fragments** — focused instructions for that stage's slice, with an exact JSON shape spec and rules.
- **Schema slice** — the relevant portion of `simulation_schema.json` (generated from Zod via [`scripts/generate-schema.ts`](scripts/generate-schema.ts)).
- **Renderables manifest** — `public/renderables/manifest.json` (drives both sprite and collider).

### 1.3 Schema is the source of truth

[`src/schemas/simulation.ts`](src/schemas/simulation.ts) defines the Zod schemas; `.describe()` strings on each field are the LLM-facing prose. The build step `npm run generate:schema` produces `modal_functions/simulation_schema.json`, which the Modal image bundles. **One source of truth**, two surfaces (TypeScript types for the runtime, JSON schema for the LLM).

The top-level `SimulationConfigSchema.describe(...)` carries a multi-section block covering coordinate system, canvas, objects, guidelines, and **two hardcoded few-shot examples** (`exampleTossBall`, `exampleTwoBoxes`).

### 1.4 The skeleton stage is doing real reasoning

[`gist_instructions.py:24-80`](modal_functions/gist_instructions.py#L24-L80). The skeleton stage is more than scaffolding:

- Picks the **dominant axis** and **scene size** in real units. The pipeline then derives `pixelsPerUnit` automatically — the LLM never sees pixels.
- Names every entity (`object_skeletons`, `control_intents`, `graph_intents`, `output_intents`) so downstream stages can reference IDs without inventing them.
- Forces the LLM to commit to a physics concept *before* writing any field values.

This is a smart decomposition. It cuts the LLM's per-call cognitive load and makes downstream stages near-mechanical.

### 1.5 The remix router is conservative-by-design

[`gist_instructions.py:215-249`](modal_functions/gist_instructions.py#L215-L249). The router is told: "include any slice you are at all unsure about." Better to over-regenerate than to miss a cross-slice dependency (e.g., a control's `defaultValue` referencing an object's velocity).

### 1.6 Models supported

Per [`generate_simulation.py`](modal_functions/generate_simulation.py): OpenAI (gpt-5-mini default) and Skole GPT (skolegpt-v3). Provider auto-detected from model name when not explicit. No vendor lock-in — the prompt format is text + JSON-mode-or-equivalent.

---

## 2. What works well (don't break this)

- **Stage decomposition** — each stage's prompt is small, focused, and reasons about one schema slice. This is the single most important architectural choice.
- **Skeleton-first scene scaling** — `scene_dimension` (axis + size in real units) is much more reliable than asking the LLM to pick `pixelsPerUnit` directly.
- **Slice-targeted remixes** — fast, cheap, preserves user intent on parts of the sim they didn't ask to change.
- **Single source of truth** — Zod-to-JSON-Schema means the LLM and the runtime can never drift on field names/types.
- **Streaming UX** — SSE per-stage progress is real-feeling feedback while a multi-call pipeline runs.
- **Conservative routing** — the "include if unsure" rule probably saves more bugs than it costs in extra calls.

---

## 3. Known issues in current prompts

### 3.1 🔴 Y-velocity sign convention is internally inconsistent
[simulation.ts:27](src/schemas/simulation.ts#L27): `'Y component. For velocity: positive = downward, negative = upward.'` Every other description says Y increases upward (line 28, 39, 43, 164). The vector schema's per-axis description directly contradicts the surrounding consensus. The LLM is reading both and resolving the contradiction at random.
- **Fix:** one-line edit. Should be `'positive = upward, negative = downward'` to match everything else.

### 3.2 🔴 `frictionStatic` is advertised but unwired
The objects-fill stage ([gist_instructions.py:88](modal_functions/gist_instructions.py#L88)) explicitly instructs the LLM to set `frictionStatic`. The schema description (`simulation.ts:48`) gives a range and default. **No engine maps it.** The LLM is being told to populate a no-op field, which silently makes sims behave wrong relative to the LLM's intent.
- **Fix:** part of the [applied-forces refactor](Notes_on_Applied_Forces_Refactor.md). Strong recommendation: remove the field from `BodyDef`, the schema, and the prompt. The principled `μs ≠ μk` story moves to opt-in `frictionDemo` mode.

### 3.3 🔴 `frictionAir` numeric ranges are calibrated to Matter, but Rapier is the default
Schema description: "0.01–0.05 = light damping, 0.1 = high drag" — those numbers are right for Matter's `v *= 1 − f` per-step decay, **wrong** for Planck/Rapier's `linearDamping` (`v / (1 + d·dt)`). Same number, different physics. With Rapier as the default engine, LLM-generated `frictionAir` values are effectively no-ops.
- **Fix:** the [air-resistance refactor](Notes_on_Air_Resistance_Refactor.md) deprecates `frictionAir` and replaces it with mass-dependent quadratic drag. The interim fix is updating the schema description to call out the engine-dependence and de-emphasize specific numeric ranges.

### 3.4 🟡 Examples are static and global
Both example sims (`tossBall`, `twoBoxes`) are inlined into every generation, regardless of what the user asked for. For "build a pendulum" or "two-body collision," neither example is particularly relevant — they eat prompt budget without informing the output.
- **Fix:** retrieval-augmented examples (see §5.1).

### 3.5 🟡 Manifest is bundled in full every call
[`generate_simulation.py:31-34`](modal_functions/generate_simulation.py#L31-L34) bundles the full renderables manifest into every stage's prompt. The skeleton and objects-fill stages need it; controls/graphs/outputs don't (they only reference object IDs, not SVGs). Inflates non-load-bearing prompt for ~60% of stages.
- **Fix:** per-stage context tailoring (see §5.2).

### 3.6 🟡 No engine-specific guidance in the prompt
The schema lists three engines but says nothing about which fields/ranges work well under each. A sim with `physicsEngine: 'planck'` and Matter-calibrated `frictionAir` values will silently behave wrong. Same for whatever engine-specific quirks come with the upcoming joints/sensors features.
- **Fix:** add an engine-conditional section to the preamble, or have the skeleton stage pick the engine based on the physics concept (springs → Rapier; pulleys → Planck; default → Rapier).

### 3.7 📋 Schema description prose is the prompt
Already noted in [GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md). Every field's `.describe()` matters as much as its type. A description that's "correct for humans" can produce bad LLM behavior. Worth a periodic review pass — and worth treating as part of the same review surface as any new feature's documentation.

---

## 4. Improvements: prompt content

### 4.1 ⭐⭐⭐ Fix the three explicit bugs above (3.1, 3.2, 3.3)
Highest leverage; cheapest fixes; pure prompt-content edits. None require pipeline or runtime changes (except 3.2's schema-field removal, which is part of an existing refactor).

### 4.2 ⭐⭐⭐ Annotate the schema with units, signs, and "typical realistic ranges"
Some descriptions already do this well ("Default: 0.8", "Typical range: -30 to 30 m/s"). Apply systematically:
- Every numeric field: unit + typical range + sign convention.
- Every vector field: explicit basis (Y-up, X-right) + typical magnitude.
- Every enum: which value is the *recommended default* for the most common case.

The LLM does much better with concrete numeric anchors than with abstract field semantics. The cost is a few characters per field.

### 4.3 ⭐⭐⭐ Add a "physics realism" guardrail section to the preamble
A short list of sanity checks the LLM should run before emitting a config:

```
Before finalizing, verify:
- Mass is positive and matches the object preset (a soccer ball is ~0.45 kg, not 100 kg).
- Velocities are realistic for the scene (a thrown ball: ~10–30 m/s; a falling object: 0 initial, terminal ~50 m/s).
- Restitution is in [0, 1]. Use 1.0 only for "perfectly elastic" demos.
- Initial position keeps the object inside the canvas given its size.
- If gravity is on, "static" objects should be the floor/walls, not the moving body.
```

A handful of these catches a lot of LLM-generated weirdness. Costs ~10 lines of prompt.

### 4.4 ⭐⭐ Pull "anti-examples" from the feedback loop
[FeedbackModal.tsx](src/components/simulation_components/FeedbackModal.tsx) suggests user feedback is collected. If "this sim was wrong" reports are stored anywhere, the bad sims become candidates for **negative few-shot examples** — "don't generate sims like this." Even one or two hand-curated anti-examples in the preamble would help.

### 4.5 ⭐⭐ Engine-conditional guidance
A small block in the preamble:

```
Engine notes:
- "rapier" (default): SI-native; restitution and friction are per-fixture; use linearDamping for drag (NOT frictionAir).
- "planck": same Box2D model as rapier; supports pulley/mouse joints when those land.
- "matter": legacy; new sims should not select this unless the user explicitly asks for it.
```

Tells the LLM what to expect under each engine without a separate prompt.

### 4.6 ⭐⭐ Concept-tagged guidance
Many user prompts cluster into a few concept categories: projectile, collision, free-fall, ramp, pendulum, energy. The skeleton stage already identifies the physics concept first; the rest of the pipeline could take a concept tag and adjust its behavior:

- "projectile" → realistic gravity, no walls (or just bottom), velocity in [10, 30] range.
- "collision" → walls on both sides, two objects, restitution explicit.
- "free-fall" → tall canvas, single object, walls only on bottom.
- "pendulum" → revolute joint (when it lands), specific anchor + bob structure.

Could be a per-concept fragment appended to the preamble after the skeleton stage tags the concept.

### 4.7 ⭐ Inline definitions for jargon
The output side has labels like "Vertical velocity" — fine. But the LLM occasionally introduces words like "momentum" or "kinetic energy" without being asked, in fields where they don't belong (e.g., a slider labeled "Kinetic energy" that's actually wired to `velocity.y`). Tell the LLM: "if you label a control as Kinetic Energy, the property *must* be a kineticEnergy computed (when those land), not a raw velocity component."

---

## 5. Improvements: prompt construction

### 5.1 ⭐⭐⭐ Retrieval-augmented examples
Replace the two static few-shot examples with a small library (10–20 reference sims) and retrieve the 2–3 most relevant per request. Naive cosine similarity over the user's prompt + a per-sim concept tag works well for this scale.
- **Implementation:** add a `simulations/library/` directory of well-formed reference sims, each with a `concept: ['projectile' | 'collision' | ...]` tag and a one-line description. Skeleton stage picks the closest 2–3 based on the user prompt + identified concept and inlines them.
- **Why it's a big deal:** the LLM is much better at "make one of these but for X" than at "make X from scratch." Concrete examples beat abstract guidance every time.

### 5.2 ⭐⭐⭐ Per-stage context tailoring
Today every stage gets the full manifest + full schema. Stage by stage:
- **Skeleton:** needs full manifest (picks SVGs), needs schema for the top-level + scene_dimension.
- **Objects fill:** needs full manifest + ObjectConfigSchema only.
- **Controls fill:** needs the produced objects + ControlConfigSchema. **Doesn't need the manifest at all.**
- **Graphs fill / outputs fill:** same — produced objects + their slice's schema. No manifest.

Trimming non-load-bearing context from each stage saves prompt budget and reduces the noise the LLM has to attend over. Probably a 30–50% reduction for the fill stages.

### 5.3 ⭐⭐⭐ Aggressive prompt caching
The static portions of the prompt — preamble, schema, manifest — are constant across calls. With OpenAI's automatic prefix caching, structuring the prompt as `[CACHEABLE STATIC PREFIX][PER-REQUEST USER MESSAGE]` should yield free cache hits. Verify with token-billing telemetry that this is actually happening; if it's not, restructure the prompt order.
- **Same applies to the per-stage cache:** if every "objects_fill" call shares the same preamble + schema + fragment, that prefix is cacheable across users.
- **For Skole GPT** (the secondary provider), caching support varies — worth checking what's available.

### 5.4 ⭐⭐ Smaller schema for downstream stages
The full `simulation_schema.json` includes types for every config (controls, graphs, outputs, environment) — but the controls-fill stage only needs the `ControlConfigSchema` definition. Generate a per-stage schema slice (Zod → JSON-Schema for just the relevant subtree) and ship only that to each stage.

### 5.5 ⭐⭐ Validation feedback loop
When the LLM emits invalid JSON or a schema-incompat config, the current path is (presumably) "raise a Python exception → SSE error event → user starts over." Better:
- **Catch validation errors in the pipeline.**
- **Feed the error back to the same stage with a "your previous output had this error: …" turn.**
- **Cap retries at 2** to avoid runaway costs.

Most schema-validation errors are obvious to the LLM ("you wrote `velocity` instead of `velocity.y`"); a single retry with the error message hits a much higher success rate than a fresh call.

### 5.6 ⭐⭐ Critic / second-pass review
After the assemble stage emits a final SimulationConfig, run a *cheap* second LLM call that takes the assembled JSON and asks: "Does this sim faithfully demonstrate the user's requested concept? Are the numbers physically reasonable? Are there any internal inconsistencies (e.g., a slider's `defaultValue` doesn't match the object's initial state)?" If the critic flags issues, regenerate the affected slice.

This is a known-good pattern for LLM pipelines (verification > generation is cheaper than always-getting-it-right). Cost: one extra call per generation. Probably worth it.

### 5.7 ⭐ Multi-model fallback
If a generation fails validation twice in a row, fall back to a stronger model (gpt-5 instead of gpt-5-mini) for the retry. Cheap on average, much higher worst-case quality.

---

## 6. Improvements: pipeline architecture

### 6.1 ⭐⭐⭐ Skeleton-stage validation gate
Before kicking off the four fill stages in parallel/sequence, validate the skeleton:
- All `object_skeletons[i].svg` values exist in the manifest.
- `scene_dimension` is in a sensible range for the chosen unit (m: 0.1 to 1e6; cm: 1 to 1e8; etc.).
- Object positions are inside the implied canvas.
- Every `control_intents[i].target_id` references an existing object.

A skeleton failure can cause every downstream stage to silently produce garbage. Validating once, retrying the skeleton if it fails, is far cheaper than retrying after assemble.

### 6.2 ⭐⭐ State-aware remix prompts
Today the remix stages get the full slice they're editing + the user's request. They don't see *which other slices the router decided to regenerate alongside them*. If a remix changes both objects and controls, each stage runs with no knowledge of the parallel change.
- **Fix:** include a one-line "router decision summary" in each remix stage's user message — "the router also flagged `controls` for regeneration based on this edit." Lets a stage anticipate cross-slice consistency.

### 6.3 ⭐⭐ Multi-turn dialog state in remixes
Each remix is a single turn with no memory of prior edits. If the user has been iterating on object placement for three turns, the LLM doesn't see that context. A short rolling history (last N edits + their effects) in the system message would let the LLM track *what the user is converging on*.
- **Risk:** prompt budget grows linearly with conversation length. Cap at 3 prior turns.

### 6.4 ⭐⭐ Telemetry: per-stage token counts, success rates, retry rates
Modal logs are presumably available. Build a dashboard or even a daily summary script that surfaces:
- Tokens per stage (find bloat).
- Validation failure rate per stage (find prompt weak spots).
- Retry rate per stage (find genuinely-hard fields).
- End-to-end success rate per concept tag (find concepts the system handles poorly).

Without this, every prompt change is a guess at quality. With it, every change has a metric.

### 6.5 ⭐⭐ Prompt regression suite
A frozen set of "given prompt X, the resulting sim must satisfy properties Y" tests:
- "Generate a projectile motion sim" → must have gravity > 0, velocity.y > 0 on the ball, walls = ["bottom"] or [].
- "Generate a two-body collision" → must have ≥ 2 dynamic objects, walls bracketing both sides.
- "Generate a free fall sim" → must have one dynamic object with initial velocity = (0, 0).

Run the suite on every prompt change. Catches "tightening this rule fixed projectile motion but broke pendulums" before it ships.

### 6.6 ⭐ Cross-pipeline shared validator
Both the full pipeline and the remix pipeline assemble final configs and validate them. The validator should be the same code path — and ideally run *server-side, before SSE-emitting the final content* — so the frontend never receives a malformed config. Probably already this way; worth verifying.

---

## 7. Improvements: feedback & evaluation loops

### 7.1 ⭐⭐⭐ User-feedback → prompt-improvement pipeline
[FeedbackModal.tsx](src/components/simulation_components/FeedbackModal.tsx) collects user feedback. If that data isn't already feeding back into prompt iteration, that's an enormous missed opportunity:
- **Negative examples:** sims users rated as "wrong" become candidates for negative few-shot or for prompt clarifications.
- **Concept gaps:** if "pendulum" requests fail repeatedly, that's a signal to add a pendulum example to the library.
- **Field-level corrections:** if users frequently edit the same field on LLM-generated sims (e.g., always lowering velocity), the prompt's typical-range guidance for that field is wrong.

### 7.2 ⭐⭐ Edited-sim → reference-library pipeline
When a user edits a generated sim into something they're happy with, the *edited* sim is by definition closer to what they wanted. With permission, those edited sims become candidates for the example library (§5.1). Closes the loop: today's edits become tomorrow's examples.

### 7.3 ⭐⭐ Concept-coverage audit
Periodically generate sims for every concept tag the system claims to support, run the regression suite, score the results. Find the concepts where the system is weakest and target prompt improvements there. The wishlist's [Physics_Chapters_with_Physics_Engines.md](Physics_Chapters_with_Physics_Engines.md) is the natural target list.

### 7.4 ⭐ A/B prompt testing
For prompt changes, run the regression suite (§6.5) on both the old and new prompts; ship the change only if the new prompt wins. With a few hundred test cases, A/B becomes meaningful.

### 7.5 ⭐ Cost / quality dashboard
Tokens spent per generation × success rate × user-edit rate = a single "quality per dollar" metric. Watch it move with every change. Useful both for catching cost regressions and for justifying spending more (better model / second-pass critic) when quality matters more than money.

---

## 8. Recommended priorities

If we picked the top five things to land in the next quarter:

1. **Fix the three prompt bugs** (§3.1, 3.2, 3.3). Cheapest, highest-leverage.
2. **Validation feedback loop** (§5.5). Single biggest reliability win — most LLM-output errors are recoverable with one retry.
3. **Per-stage context tailoring + prompt caching verification** (§5.2, 5.3). Biggest cost/latency win without changing behavior.
4. **Retrieval-augmented examples** (§5.1). Biggest quality win for the prompt engineering side.
5. **Telemetry + regression suite** (§6.4, 6.5). Without these, the next prompt change is a coin flip; with them, every change is measured.

Engine-specific guidance (§4.5), the critic pass (§5.6), and the user-feedback loop (§7.1) are strong runners-up. Save the architectural rebuilds (state-aware remixes, multi-turn dialog) for after the metrics are in place — those are the kind of changes you only justify with data.

---

## 9. Coordination with other refactors

- **Air resistance** ([Notes_on_Air_Resistance_Refactor.md](Notes_on_Air_Resistance_Refactor.md)) — Phase 2 adds new schema fields; the LLM prompt update is currently a "follow-on" footnote. Promote to an explicit checklist item in that refactor's Phase 2 (cross-ref §3.3 here).
- **Applied forces** ([Notes_on_Applied_Forces_Refactor.md](Notes_on_Applied_Forces_Refactor.md)) — Phase 2 adds `appliedForce` schema; same prompt-update story. Phase 2.5's `frictionDemo` mode introduces a new field that needs prompt guidance to avoid LLM confusion with regular friction.
- **Vector representation** ([Notes_on_Vector_Representation_Refactor.md](Notes_on_Vector_Representation_Refactor.md)) — Phase 1 adds `.magnitude` / `.angle` paths; Phase 2 adds polar input form. Both need schema-description updates *and* a paragraph in the preamble explaining when to pick polar vs. Cartesian.
- **Wishlist §10 (Expression-based bindings)** ([GIST_Physics_Wishlist.md](GIST_Physics_Wishlist.md)) — once expressions land, the LLM needs guidance on when to use named computeds (KE, GPE) vs. raw scalar paths (`velocity.y`). The prompt becomes the place where the system *teaches the LLM physics fluency*, not just JSON shape.
- **Topics doc** — items §2.1 (frictionStatic field), §3.1 (`frictionAir` Matter calibration), §6.1 (LLM prompt update as refactor checklist), and §6.3 (schema versioning) all directly relevant; this doc cross-references them rather than re-treating.

---

## 10. Open questions

1. **What does "LLM output quality" actually mean?** Schema-valid? Pedagogically correct? Visually appealing? Match user intent? The metric we choose drives everything else. Probably a weighted bundle, but worth being explicit.
2. **Do we have telemetry on which generations users *keep* vs. discard?** That signal is more honest than feedback forms.
3. **How often is the prompt updated today?** If it's every sprint, a regression suite is overdue. If it's rarely, the suite is less urgent.
4. **Provider-specific behavior** — does Skole GPT respect JSON-mode the same way OpenAI does? Does it cache prefixes? Does it validate against schemas? Different answers affect the right strategy per provider.
5. **Cost ceiling per generation** — if a critic pass + retry budget pushes past a threshold, when does that become a product problem vs. just a cost concern?
