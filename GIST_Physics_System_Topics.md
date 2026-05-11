# GIST Physics System — Topics to Discuss

A living index of cross-cutting physics-system concerns that don't fit cleanly into a single refactor doc: cross-engine inconsistencies, idempotency patterns, feature gaps, deprecations, performance, and schema/LLM coordination. New items go here when they affect multiple sims, multiple engines, or the system layer rather than one feature.

Status legend:
- 🔴 Open / unresolved
- 🟡 In progress (refactor doc has the plan)
- 🟢 Fixed / done
- 🔵 Deferred / decided
- 📋 Documented only (no action needed)

---

## Legacy & deprecation

### 🟢 Matter removed (was an early exploration)
Matter (`matter-js`) was the project's first physics engine and stayed in-tree as a third `PhysicsAdapter` while Rapier and Planck were brought up. **Removed 2026-05-11.** The motivating costs: Matter's Y-down convention required adapter-level flipping, its per-step `frictionAir` formula (`v *= 1 − f`) diverged from Planck/Rapier's substep-correct `v / (1 + d·dt)`, and several adapter features (joints, sensors, contact events, CCD) were going to need engine-pair-only implementations anyway. Active engines are Rapier (WASM, default) and Planck (pure-JS Box2D port).
- **Migration shim:** [src/schemas/simulation.ts](src/schemas/simulation.ts) preprocesses `physicsEngine: "matter"` → `"rapier"` so any lingering saved configs load cleanly.

### 🟢 `frictionStatic` field on `BodyDef` — removed
Field was advertised in the schema + prompt but no engine mapped it. **Removed 2026-05-11** from `simulation.ts`, `BodyDef`, `ObjectRenderer`, and `gist_instructions.py`. Saved configs that still carry `frictionStatic` continue to load — Zod silently strips unknown keys.
- **Next step:** the principled `μs ≠ μk` story will return as an opt-in `frictionDemo` mode in the applied-forces refactor.
- See [Notes_on_Applied_Forces_Refactor.md](Notes_on_Applied_Forces_Refactor.md) "Static friction caveat".

### 🟡 `frictionAir` schema-prose calibration
With Matter gone, both remaining engines map `frictionAir` to `linearDamping` → `v / (1 + d·dt)`, so the cross-engine drift is resolved. The remaining concern is that the LLM-prompt prose around `frictionAir` ranges was historically calibrated against Matter's per-step formula; the ranges may need re-tuning for the substep-correct integrators.
- **Plan:** subsumed by the quadratic-drag model in the air-resistance refactor; `frictionAir` will eventually be deprecated end-to-end.
- See [Notes_on_Air_Resistance_Refactor.md](Notes_on_Air_Resistance_Refactor.md).

---

## Cross-engine inconsistencies (mapping hazards)

### 🟢 Rapier mass setter — `setAdditionalMass` replaces, doesn't accumulate
Setting `body.mass = X` repeatedly used to oscillate between `X` and the base collider mass. Bug confirmed and fixed at [RapierAdapter.ts:159-167](src/physics/rapier/RapierAdapter.ts#L159-L167) and [RapierAdapter.ts:219-227](src/physics/rapier/RapierAdapter.ts#L219-L227) by capturing `baseMass` once at construction. Planck was never affected (its `setMassData` already replaces, not deltas).
- **Lesson generalized to a system principle:** see "Body-state setters must be idempotent" below.
- See [Notes_on_Air_Resistance_Refactor.md](Notes_on_Air_Resistance_Refactor.md) "Bug fixed: Rapier mass setter".

### 🔴 Planck friction caches per-contact at contact creation
Planck's `fixture.setFriction(μ)` only affects *new* contacts. Existing contacts keep their cached friction until you also call `contact.resetFriction()` on each active contact. Rapier doesn't have this caching — `collider.setFriction(μ)` takes effect immediately on the next solver step.
- **Why it matters now:** the planned `frictionDemo` mode flips friction between μs and μk per-frame. Under Planck, without the contact reset, the per-frame change won't propagate to the active resting contact, and the demo silently breaks.
- **Plan:** the eventual `setFriction(μ)` on `PhysicsBody` (Phase 2.5 of applied-forces) must reset live contacts under Planck. Document the asymmetry in the adapter, not at the call site.

### 📋 Y-axis convention — Y-up at the adapter boundary
[`PhysicsAdapter`](src/physics/types.ts#L1-L14) docstring states Y-up. Both Rapier and Planck are Y-up natively, so no per-engine normalization is needed at the adapter layer.

### 📋 Angle convention — counter-clockwise from +X
Same docstring. Vector representation refactor's polar form (`.angle`) inherits this.

---

## Idempotency & re-firing patterns

### 📋 Sliders re-fire on Play / Reset → all body-state setters must be idempotent
This was the latent failure mode behind the Rapier mass-setter bug. The control system re-fires all slider `onChange` callbacks at simulation start (and after Reset), so any setter that's stateful with respect to the *current* body state will compound or oscillate.
- **System principle:** every setter on `PhysicsBody` must satisfy `setX(v); setX(v); === setX(v)` — repeated calls with the same value land at the same state. Verified for `mass` (post-fix), `position`, `velocity`, `restitution`, `setLinearDamping`. To verify when added: `setFriction`, `applyImpulse` (caveat: impulses are *intentionally* additive, so they're *not* idempotent under repeated firing — the system needs to make sure impulses aren't slider-bound, only force *targets* are).
- **Open:** add a unit test that pumps each public setter twice with the same input and asserts identical state. Cheap, catches a whole class of bugs.

### 📋 Snapshot/restore overwrites position/velocity but not other body state
`restore(snapshot)` resets pose/velocity but leaves damping, friction, applied force, mass overrides, etc. as-is. Mostly fine — the next `onUpdate` recomputes per-frame state — but worth documenting because it's a footgun for any setter that expects to be reset.
- See [Notes_on_Air_Resistance_Refactor.md](Notes_on_Air_Resistance_Refactor.md) "Reset / seek".

---

## Loop-mode semantics

### 📋 `onUpdate` runs once per logical frame, never per-substep
[BaseSimulation precompute loop, lines 275-285](src/components/BaseSimulation.tsx#L275-L285): `onUpdate` fires once, then ~8 `step(substepDt)` calls follow. Live mode is `onUpdate` + 1 step. Implications:
- Per-step forces are cleared after each `world.step()` → `applyForce` in `onUpdate` only reaches the first substep in precompute. Workarounds: use damping (drag refactor) or impulses (applied-forces refactor).
- Anything that needs true per-substep work needs a new adapter hook (`onPreStep(body, dt)`). Repeatedly considered, repeatedly deferred — no current refactor needs it.

### 📋 Live and precompute can produce different physics for the same sim
Live mode: 1 step/frame. Precompute: ~8 substeps/frame. Same `onUpdate` calls in both, but the engine sees different `dt` per step. For correctly-formulated drag (damping) and applied force (impulse), the integrals match. For ad-hoc `applyForce` per logical frame, they don't.
- **Implication:** when adding new per-frame physics work, prefer the formulation that's substep-invariant (damping, impulse, kinematic-body update). Avoid per-step force application from `onUpdate`.

### 📋 Replay bypasses the engine entirely
Replay reads precomputed snapshots and never calls `step()`. Anything dynamic in `onUpdate` (force arrows reading `userData`, applied-force visualization, etc.) needs to either bake into the snapshot or compute purely from snapshot fields.
- See [Notes_on_Air_Resistance_Refactor.md](Notes_on_Air_Resistance_Refactor.md) "Replay mode".

---

## Adapter feature gaps

These are libraries-offer-it / adapter-doesn't-expose-it gaps, prioritized by what unlocks the most pedagogy. Detail in [Physics_Chapters_with_Physics_Engines.md](Physics_Chapters_with_Physics_Engines.md).

### 🟡 Force / impulse APIs
No `applyForce` or `applyImpulse` on `PhysicsBody` today. Blocks PhET-Forces-and-Motion-style sims.
- **Plan:** [Notes_on_Applied_Forces_Refactor.md](Notes_on_Applied_Forces_Refactor.md) Phase 1.

### 🔴 Joints (spring, revolute, prismatic, rope, pulley)
Biggest content gap after applied forces. Needed for Hooke's law, pendulums, Atwood machines, springs/oscillators.
- Rapier has `JointData.spring(restLength, k, c)` natively (clean Hooke mapping); Planck has `DistanceJoint` + `PulleyJoint` + `MouseJoint` (the Planck-only joints).

### 🔴 Sensors (non-colliding trigger fixtures)
Needed for goal regions, lap timers, "ball reaches X" detection without affecting physics.
- Both engines support natively. Adapter just needs to plumb through `setSensor(true)`.

### 🔴 Contact events (begin/end + impulse readout)
Needed for momentum/energy plots ("show Δp per collision"), 3rd-law force-pair visualization.
- Planck `postSolve(contact, impulse)` exposes normal/tangent impulses directly.
- Rapier needs `ActiveEvents.CONTACT_FORCE_EVENTS` opt-in + `EventQueue` polling.
- Asymmetry to handle in adapter.

### 🔴 CCD (continuous collision detection)
Needed for fast projectiles or thin walls (high-velocity falls in free-fall sims).
- Planck `body.setBullet(true)`, Rapier `rigidBody.enableCcd(true)`.

### 🟡 Per-body friction setter
Adapter doesn't expose `setFriction(μ)`. Needed for the `frictionDemo` mode (Phase 2.5 of applied forces).
- See cross-engine inconsistency note above re: Planck contact-cache.

---

## Schema / LLM coordination

### 🔴 Adding a schema field without an LLM prompt update → silent no-op for AI-authored sims
Every refactor that adds a field (drag coefficients, applied force, frictionDemo, polar vectors) is dead until the LLM knows to populate it. Currently the prompt lives in [modal_functions/gist_instructions.py](modal_functions/) and isn't kept in sync as part of the refactor checklist.
- **Open:** add "update LLM prompt" as an explicit checklist item to every refactor's Phase 2 (when the field becomes JSON-authorable). Today this lives as a "Follow-on" footnote in each refactor doc — easy to miss.

### 🔴 Engine compatibility per field
Some schema fields are inherently engine-specific (`solverIterations` works for both but with different defaults; `positionIterations` is Planck-only; spring joints are cleaner under Rapier). Today the schema accepts everything regardless of which engine the sim picks.
- **Open question:** should the parser warn/error when an authored sim picks an engine that doesn't support a field it uses? Or silently no-op? Lean: warn at parse time, render the sim regardless. Concrete trigger: when the joints adapter lands and `JointConfig` becomes a thing.

### 🔴 Schema versioning / migration story
Commit `118ae3a` notes "single source of truth for object/collider sizing (makes all old sims not backwards compatible)." There's no schema version field, no migration shim. Each breaking change silently invalidates older sims.
- **Open:** add a `schemaVersion` to the top-level config; the parser branches on version or refuses old configs with a clear error. Worth doing before the next breaking change rather than after.

### 📋 Schema descriptions are the LLM prompt
Zod `.describe(...)` strings flow into the prompt. Every field's prose matters as much as its type. Worth a lightweight review pass when major fields land — easy to write a description that's correct for humans but produces bad LLM behavior.

---

## Determinism & reproducibility

### 🔴 Snapshot round-trip — verified?
The project's manual snapshot/restore is used for precompute restore-after-yield ([BaseSimulation.tsx:264-296](src/components/BaseSimulation.tsx#L264-L296)) and replay. Question: does `restore(snapshot(world))` produce a bit-identical world? Both engines should be deterministic in practice but neither has been formally validated for this codebase's snapshot format.
- **Concrete test:** record a 600-frame precompute, restore the t=300 snapshot, advance 300 more frames, compare against the original t=600 snapshot. Should be byte-identical.
- Rapier has a built-in `takeSnapshot` / `restoreSnapshot` (full engine state, deterministic). Worth considering as a future replacement for the manual snapshot if reproducibility becomes a problem.

### 📋 Reset → Play vs. first Play
After a Reset, does a re-Play produce identical trajectories to the first Play? If sliders re-fire (see idempotency), and all setters are idempotent, yes. If any setter has hidden state, no. Currently presumed yes; would benefit from a one-shot test.

---

## Performance & tuning

### 📋 Substep / iteration defaults aren't engine-tuned
`FIXED_DT_SECONDS`, `precomputeTimestepSeconds`, `solverIterations`, `positionIterations` have one-size-fits-all defaults. Rapier and Planck have different sweet spots (Planck velocityIterations=8/positionIterations=3 is the Box2D default; Rapier solverIterations=4 is its default — both fine but not tuned for our typical sims). No data on the precompute-batch size either.
- **Open:** light benchmarking pass once a few representative sims exist (free fall, ramp, spring, pendulum). Probably a "tighten when you notice a problem" item, not a now-priority.

### 📋 Precompute substep count = `FIXED_DT / requestedTs` ≈ 8
For ordinary sims this is plenty; for stiff systems (high-stiffness spring, very-fast collisions) it might not be. No mechanism today to override per-sim.

---

## Tooling & developer experience

### 🔴 No automated test for setter idempotency / cross-engine parity
The Rapier mass-setter bug was caught by hand. A small test harness that pumps each public `PhysicsBody` setter twice with the same value and diffs the resulting state across both engines would catch a whole class of regressions. Same for "after restore, every setter returns to a documented baseline."

### 🔴 No "physics-engine matrix" CI test
For the same input config, do both engines produce *qualitatively* the same outcome (e.g., a 1 kg ball falls X meters in 1 s under g=9.81 within tolerance)? Today, divergences are found by hand at debug time (see the slider-confound investigation in the air-resistance notes).

### 📋 Debug logging convention
The slider-confound investigation in the air-resistance notes used a one-off `console.log` template ([Notes_on_Air_Resistance_Refactor.md](Notes_on_Air_Resistance_Refactor.md), "Empirical debug procedure"). Worth keeping that template handy — same shape catches other UI-input/physics-output confounds.

---

## Index of related refactor docs

- [Physics_Chapters_with_Physics_Engines.md](Physics_Chapters_with_Physics_Engines.md) — engine affordances mapped to physics units
- [Notes_on_Air_Resistance_Refactor.md](Notes_on_Air_Resistance_Refactor.md) — quadratic-drag refactor, includes the mass-setter fix writeup
- [Notes_on_Applied_Forces_Refactor.md](Notes_on_Applied_Forces_Refactor.md) — PhET Forces and Motion analogue, includes the static-friction demo mode
- [Notes_on_Vector_Representation_Refactor.md](Notes_on_Vector_Representation_Refactor.md) — magnitude/angle as first-class polar representation for any vector field

---

## Items considered but not included (worth surfacing if relevant)

A short list of things that could plausibly belong here but I'm less sure about — surface them if they ring true:

- **Locales / i18n for physics-related strings** — recent commit added "first pass at localization." Is there a system-level concern about which physics labels are localizable (e.g., "velocity", units like "m/s"), or is this orthogonal?
- **Multiple sliders binding to the same property** — what happens? Race? Last-wins? Probably untested.
- **Stale body references when objects are destroyed mid-sim** — does the slider system hold direct references that go bad? Or look up by id every time?
- **Mouse/touch interaction with physics bodies** — recent commits added drag-to-move and zoom; is that path interacting with physics correctly across both engines?
- **Edit mode vs. play mode setter contract** — does editing a body's position in Edit mode go through the same code path as a slider in Play mode? If they diverge, that's a class of bugs.
