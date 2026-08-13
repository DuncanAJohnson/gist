# Notes on Air Resistance Refactor

Status: ALL THREE PHASES SHIPPED — the quadratic, mass-dependent drag model is live end-to-end (schema fields `dragCoefficient` / `referenceArea` + `environment.airResistance` block, the per-frame runtime compute in `JsonSimulation.tsx`, the regenerated `modal_functions/simulation_schema.json`, and the LLM prompt in `gist_instructions.py`). Phase 3 (2026-06-17) removed the legacy `frictionAir` field end-to-end — out of `simulation.ts`, `BodyDef` (`types.ts`), both adapters, `ObjectRenderer`, `JsonSimulation` (incl. the conflict warning), the example sims, and `gist_instructions.py`. The quadratic model is now the only damping path; the debug "Off" mode clears damping via `setLinearDamping(0)` rather than restoring a saved `frictionAir`. Saved configs that still carry `frictionAir` load fine (Zod strips unknown keys). The design notes below are the original proposal; the "Design rationale: diorama scoping" section remains the canonical reference for the linear-A choice.
Scope: Planck and Rapier adapters.

> **Note (2026-05-11):** these notes were written while Matter was still in-tree. Matter has since been removed; references to `MatterAdapter.ts` below are historical. The plan itself is unaffected — it always targeted Planck/Rapier.

## Background — what's wrong today

The current `frictionAir` field on an object flows from the JSON config through `ObjectRenderer` into `BodyDef.frictionAir`, and each adapter then translates:

- **Matter** ([MatterAdapter.ts:231](src/physics/matter/MatterAdapter.ts#L231)): `matter.frictionAir = def.frictionAir` (per-step velocity scaling: `v *= 1 − frictionAir`).
- **Planck** ([PlanckAdapter.ts:232-233](src/physics/planck/PlanckAdapter.ts#L232-L233)): `linearDamping: def.frictionAir`.
- **Rapier** ([RapierAdapter.ts:302-303](src/physics/rapier/RapierAdapter.ts#L302-L303)): `bd.setLinearDamping(def.frictionAir)`.

Two problems:

1. **Matter and Planck/Rapier use different formulas**, so the same numeric value behaves wildly differently across engines. The schema description ("0.01–0.05 = light damping, 0.1 = high drag") is calibrated to Matter, but Rapier is the default engine — so LLM-generated `frictionAir` values are effectively no-ops under the default engine.
2. **Box2D-style `linearDamping` is mass-independent**: `dv/dt = −b · v`. A feather and a bowling ball reach the same terminal velocity. Real air resistance has the form `F_drag = −½ ρ Cd A |v| v` and the deceleration is `a = F/m`, so mass appears in the denominator. The current model can't express that.

This refactor adds an opt-in, mass-dependent, quadratic-in-|v| drag model for Planck/Rapier sims. Orientation-dependent projected area is explicitly out of scope.

---

## Recommended approach: speed-driven linear damping (no force injection)

Rather than calling `applyForce` per step, **recompute and set each body's built-in `linearDamping` once per logical frame** to a value that reproduces the desired quadratic, mass-dependent drag:

```
desired physics:   dv/dt_drag = −(k/m) · |v| · v
engine damping:    dv/dt_drag = −damping · v
solve for damping: damping = (k/m) · |v|
```

This piggybacks on the engines' substep-correct damping integrators (`v / (1 + damping·dt)`, unconditionally stable) while injecting the mass dependency we want. `|v|` is updated once per logical 60 Hz frame and treated constant within that frame's substeps. Speed doesn't change meaningfully in 16 ms for educational sims; if it ever does, we can add a per-substep hook later.

### Why not `applyForce` directly

Both engines **clear accumulated forces after `world.step()`**. The precompute loop in [BaseSimulation.tsx:275-281](src/components/BaseSimulation.tsx#L275-L281) already runs ~8 substeps per logical frame at the default 480 Hz precompute timestep. If `JsonSimulation` applies a drag force in `onUpdate` (per logical frame), only the **first substep** receives it — the remaining 7 see no drag. Fixing that requires either (a) changing `onUpdate`'s contract to run per-substep (breaks every other consumer of `onUpdate`), or (b) adding a new `onPreStep(body, dt)` callback through the adapter. Both are bigger API changes than the speed-driven-damping approach above.

---

## JSON schema additions (DECISION: Flavor A shipped)

> **Decision (Phase 2, shipped):** **Flavor A (physics-textbook, split) was chosen and is live.** The shipped schema matches it exactly — `environment.airResistance.{enabled, airDensity}` plus per-object `dragCoefficient` and `referenceArea`, with `k = ½·airDensity·Cd·referenceArea`. Verified in `src/schemas/simulation.ts` (`AirResistanceConfigSchema`, object fields) and `modal_functions/simulation_schema.json`. **Flavor B (lumped) was rejected** — its rationale is kept below so the trade-off stays on record (the split form is more pedagogical: students manipulate Cd and area independently, which is the lesson). One addition beyond the original Flavor-A sketch: per-object **shape-based defaults** for `dragCoefficient` (sphere 0.47 / rectangle 1.05 / polygon 1.0) and `referenceArea` (widest horizontal extent), so authors get visible drag without specifying either field.

### Flavor A — physics-textbook (split) · ✅ CHOSEN / SHIPPED

```json
"environment": {
  "airResistance": {
    "enabled": true,
    "airDensity": 1.225        // kg/m³; default Earth sea level
  }
}

"objects": [{
  "dragCoefficient": 0.47,     // dimensionless Cd (sphere=0.47, cube≈1.05, flat plate≈1.28)
  "referenceArea": 0.5         // m²; optional, defaults from body shape
}]
```

Then `k = ½ · airDensity · Cd · referenceArea`.

### Flavor B — lumped (simpler, less pedagogical) · ❌ REJECTED (rationale kept)

```json
"environment": {
  "airResistance": { "enabled": true }
}

"objects": [{
  "drag": 0.6     // lumped coefficient k in kg/m
}]
```

---

## Implementation touchpoints

1. **Schema** ([src/schemas/simulation.ts](src/schemas/simulation.ts))
   - Add `AirResistanceConfigSchema` to `EnvironmentConfigSchema`.
   - Add `dragCoefficient` / `referenceArea` (or `drag`) to `ObjectConfigSchema`.
   - Update prose so the LLM knows when to populate them and what numbers are physical.

2. **Per-body interface** ([src/physics/types.ts](src/physics/types.ts))
   - Add `setLinearDamping(damping: number): void` on `PhysicsBody` (the per-body interface at [types.ts:60-72](src/physics/types.ts#L60-L72)) — sits alongside the existing per-body mutators (`position`, `velocity`, `restitution`). Both engines support it natively (Rapier: `rigidBody.setLinearDamping`, Planck: `body.setLinearDamping`).
   - Note: this is a per-body method, not an adapter-level one, because we set it per-body each frame. It does *not* follow the new `setSolverIterations?(iters)` / `setPositionIterations?(iters)` optional-method pattern that Duncan added at [types.ts:92-108](src/physics/types.ts#L92-L108) — those are world-level knobs and rightly live on `PhysicsAdapter`. We're at a different layer, so a non-optional method on `PhysicsBody` is the right shape. (If for some reason an engine couldn't support it, we'd make it optional on `PhysicsBody` rather than promoting to the adapter.)

3. **`ObjectRenderer`** ([src/components/simulation_components/objects/ObjectRenderer.tsx](src/components/simulation_components/objects/ObjectRenderer.tsx))
   - When `airResistance.enabled`, store `k`, `mass`, and the body reference on `userData` (paralleling how `configuredAcceleration` is already stashed at [line 64](src/components/simulation_components/objects/ObjectRenderer.tsx#L64)). Compute `k` once at body creation from the chosen flavor.
   - When `airResistance.enabled`, suppress `frictionAir` → engine `linearDamping` at create time (otherwise the constant damping fights the dynamic damping we set per-frame).

4. **`JsonSimulation`'s `onUpdate`**
   - For each dynamic body with `userData.dragK`:
     ```
     speed = sqrt(vx² + vy²)
     damping = (k / mass) · speed
     body.setLinearDamping(damping)
     ```
   - Skip if static, mass ≤ 0, or `airResistance.enabled === false`.

5. **Reset / seek** — `restore(snapshot)` overwrites position/velocity but leaves the last damping value in place. Harmless: the next `onUpdate` recomputes from the restored velocity. Worth a one-line comment.

6. **Replay mode** — replay reads precomputed snapshots, doesn't call `step()`, and bypasses the engine integrator entirely. So damping doesn't matter during replay; air resistance is "baked into" the precomputed trajectory. Confirm this is the intended behavior — it should be (precompute uses the same `onUpdate` path, so the physics is captured at substep granularity even if damping is updated per logical frame).

---

---

## Phased rollout: debug-panel toggle first, JSON wiring second

Before touching the schema or the LLM prompt, expose the new model as a runtime switch in `AdvancedDebugPanel` so we can A/B compare it interactively against the current behavior. This validates the wiring (per-body damping setter, per-frame compute in `JsonSimulation`, `userData.dragK` plumbing) end-to-end on real sims, with no schema churn or LLM dependency.

### Switch shape

A two-state toggle in the debug panel, scoped to Planck/Rapier (hide for Matter, since it's being removed):

```
Air resistance:  [ Off ▾ ]
                   Off              — engine default; frictionAir untouched
                   Quadratic (v²)   — damping = (k/m)·|v|, recomputed per frame
```

- "Off" leaves the per-frame computation disabled and `frictionAir` flowing through unchanged. Acts as the control in A/B comparisons.
- "Quadratic (v²)" is the new model from this refactor.

(An earlier draft of this plan included a third "Linear (v)" option for comparison; see "Decisions deferred" at the bottom for why it was dropped.)

### Where to wire it

The debug panel already follows a clean `value + onChange` pattern with engine-conditional rendering (see the `solverIterations`/`positionIterations` blocks at [AdvancedDebugPanel.tsx:119-141](src/components/simulation_components/AdvancedDebugPanel.tsx#L119-L141)). Add:

- A new prop pair `airResistanceModel: 'off' | 'linear' | 'quadratic'` + `onAirResistanceModelChange`.
- Render the select only when `engine !== 'matter'`.
- Hoist state into `JsonSimulation` (alongside the existing solver-iteration state). The per-frame `onUpdate` reads the current mode and computes `damping` accordingly:
  ```
  off:        skip (don't touch linearDamping)
  quadratic:  damping = (k / mass) · |v|
  ```

### Where `k` comes from during the debug-only phase

Two options:

**(a) Read from JSON if present, otherwise fall back to a sensible default.** Lets us start testing immediately on existing sims without re-authoring them. A circle gets `k = ½ · 1.225 · 0.47 · πr²`, a rectangle gets `k = ½ · 1.225 · 1.05 · w·h`. The schema doesn't need to change yet.

**(b) Add a per-object `dragCoefficient`-style debug slider.** More effort; not worth it before we've decided on Flavor A vs B (see questions below).

Lean: **(a)** — it gets us comparing physics on day one. Once we land Flavor A or B, the JSON values supersede the defaults and the rest is just deletion.

### Why this matters for the pipeline test

It exercises every part of the runtime pipeline (per-body setter on the adapter, per-frame compute in `JsonSimulation`, `userData` storage, reset/seek interaction, replay correctness) **without** requiring schema changes or LLM-prompt updates. If something's wrong with the wiring, we find out before it's blocking the JSON-side work. Once the debug toggle behaves correctly across a few existing sims (toss-ball, two-boxes, anything with a high-velocity body), we know the JSON layer can be added on top of a solid foundation.

### Lifecycle

- **Phase 1 (this refactor):** ✅ SHIPPED — debug-only switch, defaults compute `k`, no schema changes.
- **Phase 2 (follow-on):** ✅ SHIPPED — schema additions (Flavor A, above), LLM prompt updates, examples updated. JSON values override the debug defaults; the debug switch becomes a developer override that defaults to whatever the JSON said (`airResistanceMode` seeds from `environment.airResistance.enabled` in `JsonSimulation.tsx`).
- **Phase 3:** ✅ SHIPPED (2026-06-17) — removed the legacy `frictionAir` field end-to-end (`types.ts` `BodyDef`, both adapters, `ObjectRenderer`, `JsonSimulation`, the schema + regenerated JSON schema, the example sim JSONs, and `gist_instructions.py`). The quadratic model is now the only damping path. The debug switch **stays** as a permanent developer A/B override; its "Off" mode now means `setLinearDamping(0)` (undamped) instead of restoring a saved `frictionAir`. The per-frame conflict warning was deleted along with the field.

---

## Design rationale: diorama scoping (why linear-in-A, not squared-in-A)

This is a load-bearing design decision worth pinning down before Phase 2 code lands.

**The classroom-scale problem.** Real-world air resistance is negligible at the spatial and temporal scales a GIST sim affords. A canvas is on the order of tens of meters; a sim runs for tens of seconds. Real terminal velocity for a baseball requires a 7-story drop and a multi-second fall; getting a real bowling ball anywhere near its real terminal velocity requires hundreds of meters. If we use the textbook 3D formula `F = ½·ρ·Cd·A·v²` with `A` in m² and physically accurate `Cd`, drag is invisible across the scales students can see — the bowling ball and the feather both fall at ~g.

**What we want students to see** isn't textbook numerics; it's the qualitative physics: *mass matters; shape matters; terminal velocity exists; heavier-thing-falls-faster-with-air* — visible within the canvas, within a few seconds of sim time. That's the diorama.

**The decision.** Use `A` as a **linear stand-in** rather than a squared 2D area:

- `A = widest horizontal extent` (for circles: `2r`; for rectangles: `width`; for polygons: the widest horizontal bounding-box span).
- Dimensionally, we treat the 2D world as a 1m-deep slice of a 3D world. Numerically `A` is a length in meters, with implicit area units of m² (× 1m depth). Document this in the schema description and the implementation comment so a future reader doesn't think we forgot a unit factor.

This gives drag enough authority over motion to be visible at our canvas scale. It's not the textbook formula, and that's intentional.

**Trade-offs the team is accepting:**

| What we keep | What we give up |
|---|---|
| Qualitative ordering across objects (feather < baseball < bowling ball). | Absolute terminal velocities matching Wikipedia. |
| Mass-dependence (heavier-with-same-shape falls faster). | A "real physics" sim where students can compute SI answers. |
| Visible drag at canvas-scale drops (10–30 m, 1–5 s). | A sim that holds up to "let's calculate the terminal velocity of a falling raindrop." |

**The override path.** Schema's `referenceArea` field stays optional and explicit. When a sim author (or the LLM) needs different physics — horizontal motion, a flat plate broadside-on, a sim intentionally calibrated for SI verification — they set it directly. The default rule applies only when the field is absent.

**The horizontal-motion caveat.** "Widest horizontal extent" is wrong for predominantly horizontal motion (a car rolling sideways: its frontal area is the *vertical* extent, not the horizontal one). The schema description and the LLM prompt should note this explicitly so authors know when to override. Secondary curriculum's air-resistance scope is overwhelmingly vertical, so this is acceptable as a default.

**Beyond air resistance.** This is the first concrete diorama-scoped decision; future scoping (gravity-scaled orbital demos, time-warped collision elasticity, etc.) will follow the same pattern. See the in-app `8. Design philosophy` doc page for the system-level articulation.

---

## What this gives you physically

For a falling object with `g = 9.8`, `airDensity = 1.225`, using the diorama-scoped rule `A = widest horizontal extent`:

**Bowling ball** (`mass = 7` kg, `radius = 0.11` m → `A = 0.22`, `Cd = 0.47`):
- `k = ½ · 1.225 · 0.47 · 0.22 ≈ 0.0633`
- Terminal velocity: `v_t = √(mg/k) = √(7 · 9.8 / 0.0633) ≈ 32.9 m/s`

**Feather** (`mass = 0.001` kg, `radius = 0.01` m → `A = 0.02`, `Cd = 1.5`):
- `k = ½ · 1.225 · 1.5 · 0.02 ≈ 0.01838`
- Terminal velocity: `v_t = √(0.001 · 9.8 / 0.01838) ≈ 0.73 m/s`

Ratio of ~45× between the two — dramatic and visible within a 60-meter canvas. The bowling ball reaches ~33 m/s in a few seconds of fall (real-world ~55 m/s, off by ~1.7×); the feather settles to ~0.7 m/s almost immediately (real-world ~0.4 m/s). Qualitative physics is preserved; absolute numbers are pedagogically tuned, not Wikipedia-accurate.

---

## Out of scope

- Orientation-dependent projected area
- Anisotropic / per-axis drag
- Rotational damping (see Q4 below)
- Matter adapter

---

## Open questions for Duncan

1. ✅ **RESOLVED (Phase 2) — Per-environment toggle + automatic per-body shape default.** `environment.airResistance.enabled = true` computes drag for *every* dynamic body; bodies don't need to declare a field because `dragCoefficient` and `referenceArea` fall back to shape-based defaults. A body opts out explicitly with `dragCoefficient: 0`. (Original question below.) ~~Per-environment toggle vs per-body opt-in. With this plan, `environment.airResistance.enabled = true` means "drag is computed for every dynamic body that has a `dragCoefficient` (or `drag`) field; objects without one feel no drag." Sound right, or do you want a global default Cd that applies to all bodies?~~

2. ✅ **RESOLVED (Phase 2) — Flavor A.** Shipped the physics-textbook split form (`airDensity` + per-body `dragCoefficient` + `referenceArea`); see the Decision callout under "JSON schema additions." Flavor B rejected (rationale retained). ~~Flavor A or B? A is pedagogically richer (students can change `airDensity`, see Cd values for shapes), B is simpler and less for the LLM to get wrong. Lean: **A**, falling back to sensible defaults.~~

3. ✅ **RESOLVED (Phase 2) — option (a): ignore `frictionAir` when air resistance is on, with a console warning.** Verified in `JsonSimulation.tsx` (conflict warning) and the `frictionAir` schema describe. Long-term removal is Phase 3. ~~What happens to `frictionAir` when air resistance is on? Three options: (a) ignore it; (b) add it on top; (c) deprecate and remove. Lean: (a) ignore it when on, with a console warning.~~

4. **Angular damping?** *(still OPEN)* A spinning soccer ball with no rotational drag will spin forever — looks weird in long sims. Out of scope per the original direction, but worth deciding whether to add a single `environment.airResistance.angularDamping: 0.1` knob (constant, not coupled to ω²) so it's at least *visible* without doing the orientation work.

5. ✅ **RESOLVED (Phase 2) — `referenceArea` defaults to the body's widest horizontal extent (linear-A), not `width·height`.** Chosen per the diorama-scoping rationale (treat the 2D world as a 1m-deep slice) so drag is visible at canvas scale; see "Design rationale: diorama scoping." ~~Default for `referenceArea` on rectangles — pick `width·height`?~~

6. 🟡 **The reference "area" should ultimately be the extent PERPENDICULAR TO THE DIRECTION OF TRAVEL — computed, not hand-authored.** *(HELD 2026-08-09, Bill — deliberately NOT closing this; keep surfacing it. Raise it in dev-team conversations with Ethan and Duncan.)*

   **The physics.** We settled (Q5) on a *linear* stand-in for A, and that decision stands — it is what makes drag visible at diorama scale. But for air resistance the relevant quantity is the **cross-sectional extent perpendicular to the velocity vector**, and today we approximate it with a single authored scalar chosen once, at authoring time.

   **What the code actually does.** [ObjectRenderer.tsx:122](src/components/simulation_components/objects/ObjectRenderer.tsx#L122) — `const effectiveA = referenceArea ?? width` — reads the **authored `width`**. Three consequences, in increasing order of how badly they bite:
   - A body travelling **horizontally** presents its vertical extent, not its width. Schema and prompt both already tell the author to override in this case, so this one is *documented*, merely manual.
   - A body that **rotates** (authored `angle`, or free rotation during the run) presents something between the two, changing frame to frame. The default is a constant and cannot track it.
   - **The default is not rotation-aware at all**, so an authored `angle` silently produces a frontal area that disagrees with the picture on screen. This is a real specimen, not a hypothetical: `bowlingBallAndFeather`'s feather is rotated 90°, and until `referenceArea: 0.1` was set by hand its modelled area was its narrow authored width. Fixing it moved terminal velocity 2.58 → 1.63 m/s (Findings 2026-08-08, Notes_on_Applied_Forces_Refactor.md).

   **Why we are holding.** The honest fix is a per-frame projected extent of the body's actual outline onto the axis ⊥ v — we have the geometry for it (manifest colliders, decomposed parts), so it is buildable. Bill's call: it injects **more hand-calculation than we want right now** if done half-way, and doing it properly is its own workstream. Explicit JSON `referenceArea` remains the sanctioned mechanism, and authors should keep using it.

   **What "address later" means concretely** — none of this is committed work, it is the shape of the eventual decision:
   - Decide whether A is computed **per-frame** (tracks tumbling; costs a projection each step and makes drag depend on orientation, which is physically right but newly couples two systems) or **once at expansion** from the authored pose (cheap, still wrong for tumblers, but kills the rotation gotcha for the common static-angle case).
   - Decide the geometry source: sprite/authored bounding box vs. the manifest collider outline. The collider is the honest one and is already loaded.
   - Keep `referenceArea` as an explicit override forever regardless — a computed default must not remove the author's ability to say otherwise (invariant #5: pedagogical scoping lives above the adapter).
   - **Three-places status of the HOLD: fully landed** (schema `.describe()`, `gist_instructions.py` FILL OBJECTS guidance, and the Design-philosophy linear-A section all say to override explicitly). **Gap worth closing independently and cheaply:** all three describe the *horizontal-travel* override and none mentions the *rotated-body* case, so an LLM authoring a rotated body gets no signal. That is a small three-places prompt pass, and it does not depend on resolving this question.

   **Trigger to un-park.** Any sim whose lesson depends on orientation-dependent drag (a tumbling plate, a parachute deploying, a rotated projectile), or the FBD workstream needing the drag arrow to stay honest under rotation.

---

## Follow-on (not in this refactor)

- Update LLM prompt examples and `gist_instructions.py` so the model populates the new fields with reasonable values. Without this, the feature exists but no AI-generated sim uses it.
- ✅ DONE (Phase 3, 2026-06-17) — `frictionAir` removed end-to-end now that the quadratic model is canonical.
- Still open (from Q4): an optional constant `environment.airResistance.angularDamping` knob so spinning bodies visibly slow down without doing the orientation work.
- Still open (from Q6): **computed reference extent ⊥ to direction of travel**, replacing the authored-`width` default. HELD 2026-08-09 — `referenceArea` stays the hand-authored mechanism; keep the item visible for Bill and the dev team rather than letting it settle. Note Q4 and Q6 are the same missing capability seen from two sides: both are the orientation work this refactor deliberately scoped out.

---

## Findings during Phase 1 testing (2026-04-29)

### Bug fixed: Rapier `mass` setter no longer oscillates total mass between calls

**Status**: identified, confirmed, fixed, verified. Planck was never affected.

> ⚠️ **SUPERSEDED 2026-08-13 — the fix below was correct about the oscillation
> and still left the setter BROKEN.** The `baseMass` formula stopped the
> oscillation, but two deeper defects survived it, both measured through the
> real adapters while driving `/simulation/applied-force-2d`:
> (1) `setAdditionalMass` does not change `rigid.mass()` **at all** until
> `recomputeMassPropertiesFromColliders()` runs — which neither version called
> — so `body.mass = X` was a **total no-op on Rapier, in both directions**;
> (2) even with the recompute, `total = collider base + additional (≥ 0)`, so
> mass could only ever go **UP** — a body could never be made lighter than
> authored, which is half of the `a = F/m` lesson.
> The setter now scales each collider's mass by `target/current_total` and
> recomputes; `baseMass` is gone. **Why this entry's verification missed it:**
> the observable it checked was *oscillation between repeated calls*, and a
> no-op is perfectly stable — it never oscillates. Full account:
> `Notes_on_Applied_Forces_Refactor.md` → Findings 2026-08-13 (cont.).
> The confound analysis below is unaffected and still stands.

**The bug** (now fixed) was at the previous Rapier wrapper setter:

```ts
// before
set mass(value: number) {
  this.rigid.setAdditionalMass(Math.max(0, value - this.rigid.mass()), true);
}
```

Rapier's `setAdditionalMass` **replaces** (not adds to) the body's additional mass component. The old setter computed the delta against the *live* total — which already included the prior delta. So calling `body.mass = 2` twice on a body with collider mass 1 produced:

- 1st call: `setAdditionalMass(2 − 1) = 1` → total = 1 + 1 = **2** ✓
- 2nd call: `setAdditionalMass(2 − 2) = 0` → total = 1 + 0 = **1** ✗

Every Play/Reset re-fires all sliders (including Mass), so the setter was called repeatedly and total mass oscillated between the intended value and the base-collider value across runs.

**The fix** ([RapierAdapter.ts:159-167](src/physics/rapier/RapierAdapter.ts#L159-L167) and [RapierAdapter.ts:219-227](src/physics/rapier/RapierAdapter.ts#L219-L227)): capture the body's base collider mass once at wrapper construction and compute the delta against *that*, not the live total:

```ts
private readonly baseMass: number;

constructor(...) {
  ...
  this.baseMass = this.rigid.mass();   // captured before any setAdditionalMass calls
}

set mass(value: number) {
  this.rigid.setAdditionalMass(Math.max(0, value - this.baseMass), true);
}
```

The setter is now idempotent: `body.mass = 2` always lands at total mass = 2, regardless of how many times it's called. Empirically verified after the fix — four sequential Plays at slider Mass=2 all logged `m=2.000`.

**Planck was never affected** ([PlanckAdapter.ts:157-164](src/physics/planck/PlanckAdapter.ts#L157-L164)). Planck's setter calls `setMassData({ mass: value, ... })` directly — value is set, not deltaed — so the same idempotency property comes for free from the engine API. Verified empirically pre-fix: three sequential Plays under Planck all logged `m=2.000`.

**Scope note**: this fix is technically adjacent to the air-resistance refactor (it would affect any sim that toggles Mass via slider, not just air-resistance ones). It's bundled into this branch because it was materially blocking honest drag-vs-mass tests under Rapier (the default engine). When PR'ing, worth calling out as a focused fix for reviewer attention.

### Resolved: "Air Resistance slider affects Quadratic-mode physics"

**Original observation (2026-04-29)**: with the toggle set to Quadratic and two physically-identical baseballs side-by-side, varying the Air Resistance slider on one ball changed which ball fell faster:

- Ball = 0.3, Ball_2 = 0.5 → Ball_2 falls faster
- Ball = 0.2, Ball_2 = 0.5 → Ball falls faster

**Per code analysis, this should not have been possible**:

- The Air Resistance slider's `property: "frictionAir"` writes via `setNestedValue(body, 'frictionAir', value)`, which does a plain JS assignment to a wrapper property.
- The wrapper class has no `frictionAir` getter/setter, so the assignment just creates a JS own-property that nothing reads.
- Grep confirms no code path reads `body.frictionAir` post-creation.
- In Quadratic mode, `handleUpdate` overwrites engine `linearDamping` every frame with `(k/m)·|v|`, blowing away whatever the slider might have set.
- Both balls have identical manifest colliders (baseball and basketball both `{type: circle, radius: 20}` in the manifest), so identical `dragK`.

**Resolution**: the apparent slider effect was a **confound with the Rapier mass-setter bug**. The user happened to flip the Air Resistance slider on the same cadence (0.2 / 0.3 / 0.2 / 0.3) that the mass was independently oscillating (2 / 1 / 2 / 1) due to that bug, so slider value tracked fall rate perfectly — but the *cause* of the fall-rate variation was the mass oscillation, not the slider. Under Planck (which doesn't have the bug), the slider had no observable effect even before the fix. After fixing the Rapier mass setter, repeating the same test under Rapier also showed no slider effect, exactly as the code analysis predicted.

The Air Resistance slider really is a no-op in Quadratic mode. Not surprising when the confound was removed; very confusing while it was present. Worth keeping in mind for future debug sessions: when a small change to one input correlates strongly with a physics outcome, check whether *another* input is varying in lockstep before assuming causation.

### Empirical debug procedure (used; outcome was #2)

Recorded here for posterity. The procedure was added to `handleUpdate` (since removed) and run under both engines to diagnose the slider/mass confound above:

```ts
if (k > 0 && m > 0) {
  const speed = Math.hypot(body.velocity.x, body.velocity.y);
  const damping = (k / m) * speed;
  // TEMP DEBUG — remove after diagnosing slider effect
  if (time < 0.4) console.log(
    `[airdrag] ${objectConfig.id} t=${time.toFixed(3)} ` +
    `m=${m.toFixed(3)} k=${k.toFixed(4)} v=${speed.toFixed(3)} ` +
    `damping=${damping.toFixed(4)}`
  );
  body.setLinearDamping(damping);
}
```

Three diagnostic branches were possible; the data picked **branch 2**:

1. **Identical numbers across runs** → external interference; would have meant a stale engine state, a React render-side effect, or a third-party consumer of `body.frictionAir` we missed. Did not apply.
2. **Different `m` across runs** → mass-setter oscillation. ✓ This is what the data showed under Rapier; led directly to the wrapper fix above.
3. **Different `k` across runs** → body recreation producing different shapes. Did not apply.

The same template can be repurposed any time we suspect a similar confound between a UI input and a physics outcome — log the actual physics state at the point of computation and compare across runs.

---

## Decisions deferred (revisit if needed)

### Linear (v) drag option — dropped from the toggle

An earlier draft of this plan proposed a three-way toggle (Off / Linear (v) / Quadratic (v²)) so we could compare the two velocity-dependence models side-by-side in the debug panel. We dropped the linear option and went with quadratic-only after working through the physics:

- For macroscopic objects in air (anything bigger than dust), real-world drag is dominated by the inertial / pressure-drag regime, which is `F ∝ v²`. Linear (Stokes) drag only dominates at very low Reynolds number — microscopic particles in a viscous fluid. None of our educational sims operate in that regime.
- The toggle had a dimensional gotcha: `k` is `kg/m` in the quadratic formula but `kg/s` in the linear formula. Reusing the same numeric `k` in both modes means the linear option looks like ~no drag for everyday objects (35-second time constants on what should be 2-second physics). Auto-matching characteristic times across modes is possible but adds complexity for what's ultimately a teaching tool that should default to correct physics.
- For typical classroom drop heights (5–20 m, 1–3 second falls) with reasonable `Cd·A` for an everyday object, the quadratic model spends almost the entire fall in its accelerating regime — terminal velocity is approached asymptotically, not snapped to. Bill's worry that "v² could bring objects to terminal velocity *too* fast" should not materialize in practice; the characteristic time is `τ = √(m/(g·k))`, typically 1–3 s for everyday objects, so a 1-second fall barely sees drag and a 3-second fall sees a partial approach.

**Conditions that would justify revisiting:**

- Quadratic feels visually wrong on multiple sims (e.g., terminal velocity snaps in too fast even with reasonable `Cd·A`), and tuning `referenceArea` per-object isn't a satisfying workaround.
- A teaching scenario specifically requires the exponential approach shape of linear drag — for example, a unit on Stokes' law or low-Re fluid dynamics where the v-dependence is itself the lesson.
- Students or teachers report that the v² approach feels unintuitive and would benefit from a side-by-side comparison.

If we revisit, the cleanest re-introduction is: (a) restore the three-state toggle, (b) compute the linear coefficient as `b = k·v_t` (where `v_t = √(mg/k)` is the quadratic terminal velocity) so both modes asymptote to the same terminal — making the comparison about the *shape* of the approach rather than its magnitude.

### Findings 2026-08-06 — replay frame-cache key was missing the air toggle (and solver iters): FIXED + a ratified invariant

Surfaced by Bill's question "how can I be sure the debug panel takes
effect, and does timing matter?" during the ramps SO-B drive. The
precompute→replay frame cache in JsonSimulation is keyed so an unchanged
run replays instead of recomputing — but the key held only
{controls, duration, engine, timestepHz}. **The air-resistance mode was not
in it**: precompute a run, flip the toggle, hit Play → key matched → the
sim silently replayed the stale frames computed under the OLD mode. The
toggle looked dead until an unrelated cache-invalidating action (drag,
slider, duration, engine, timestep). Solver/position iterations had the
same gap; Reset also replays the cache by design, so it never rescued.

**Fix (shipped same day):** the key now includes `airResistance`
(mode), `solverIterations`, `positionIterations`; and the air select is
disabled while running/precomputing (it was live mid-precompute — a flip
would have baked a mode-mixed trajectory into the cached frames, since
handleUpdate reads the mode per frame through a ref).

**The invariant, stated once:** EVERY physics-affecting input belongs in
the frame-cache key — cached frames may replay only when all of them
match. Recorded as a comment at the key construction site; any future
debug knob that changes trajectories (contact-force seams, pair friction,
playback-affecting solver options) must join the key when it lands.

**Precedence semantics documented while answering (unchanged, now on
record):** JSON seeds at load, panel overrides for the session, reload
restores JSON — for both engine and air mode. Known shadowing gotchas kept
as-is for now: with a panel engine override set, Tweak-JSON edits to
environment.physicsEngine are ignored until reload; Tweak-JSON edits to
airResistance.enabled are ignored after mount (the seed runs once), while
airDensity and per-body Cd/A DO live-sync. A "latest actor wins" re-seed
was proposed and left un-adopted — revisit if the asymmetry bites again.
