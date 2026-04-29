# Notes on Air Resistance Refactor

Status: design notes for review (not yet implemented).
Scope: Planck and Rapier adapters only. Matter is being removed and is ignored here.

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

## JSON schema additions (two flavors — pick one)

### Flavor A — physics-textbook (split)

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

### Flavor B — lumped (simpler, less pedagogical)

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

- **Phase 1 (this refactor):** debug-only switch, defaults compute `k`, no schema changes.
- **Phase 2 (follow-on):** schema additions (Flavor A or B), LLM prompt updates, examples updated. JSON values override the debug defaults; the debug switch becomes a developer override that defaults to whatever the JSON said.
- **Phase 3:** once stable, decide whether the debug switch stays as a permanent override or gets removed.

---

## What this gives you physically

For a falling object with no walls and `g = 9.8`, `airDensity = 1.225`, `Cd = 0.47`, `referenceArea = 0.05` (small ball), `mass = 0.5` kg:

- `k = 0.5 · 1.225 · 0.47 · 0.05 ≈ 0.0144`
- Terminal velocity: `v_t = √(mg/k) = √(0.5 · 9.8 / 0.0144) ≈ 18.4 m/s`
- A 5 kg version of the same ball: `v_t ≈ 58 m/s` — heavier objects fall faster, which is the qualitative win.
- A feather (`mass = 0.001`, same Cd·A): `v_t ≈ 0.83 m/s` — the mass dependency we wanted.

---

## Out of scope

- Orientation-dependent projected area
- Anisotropic / per-axis drag
- Rotational damping (see Q4 below)
- Matter adapter

---

## Open questions for Duncan

1. **Per-environment toggle vs per-body opt-in.** With this plan, `environment.airResistance.enabled = true` means "drag is computed for every dynamic body that has a `dragCoefficient` (or `drag`) field; objects without one feel no drag." Sound right, or do you want a global default Cd that applies to all bodies?

2. **Flavor A or B?** A is pedagogically richer (students can change `airDensity`, see Cd values for shapes), B is simpler and less for the LLM to get wrong. Lean: **A**, falling back to sensible defaults — `airDensity = 1.225`, and per-shape default `referenceArea` (πr² for circles, w·h for rectangles — accepting that the rectangle case is wrong-when-rotated, which is the bit we said is out of scope).

3. **What happens to `frictionAir` when air resistance is on?** Three options: (a) ignore it; (b) add it on top of the computed damping; (c) deprecate and remove. Lean: **(a) ignore it when on, with a console warning if both are set on the same object**. Long-term, deprecate it once examples and the LLM prompt are migrated.

4. **Angular damping?** A spinning soccer ball with no rotational drag will spin forever — looks weird in long sims. Out of scope per the original direction, but worth deciding whether to add a single `environment.airResistance.angularDamping: 0.1` knob (constant, not coupled to ω²) so it's at least *visible* without doing the orientation work.

5. **Default for `referenceArea` on rectangles** — pick `width·height`? The "facing area" issue we flagged out of scope means whatever we pick is wrong-when-rotated, but `width·height` at least gives the right order of magnitude and stays constant under rotation, so the simulation behaves predictably.

---

## Follow-on (not in this refactor)

- Update LLM prompt examples and `gist_instructions.py` so the model populates the new fields with reasonable values. Without this, the feature exists but no AI-generated sim uses it.
- Once the new model is the canonical one, deprecate and remove `frictionAir` end-to-end.

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
