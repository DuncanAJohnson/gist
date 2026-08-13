# GIST Physics System — Topics to Discuss

A living index of cross-cutting physics-system concerns that don't fit cleanly into a single refactor doc: cross-engine inconsistencies, idempotency patterns, feature gaps, deprecations, performance, and schema/LLM coordination. New items go here when they affect multiple sims, multiple engines, or the system layer rather than one feature.

Status legend:
- 🔴 Open / unresolved
- 🟡 In progress (refactor doc has the plan)
- 🟢 Fixed / done
- 🔵 Deferred / decided
- 📋 Documented only (no action needed)

---

## Physics engine requirements & development notes

The charter for how GIST relates to physics engines, plus a running log of what
we've learned running real dev efforts across the two engines. Everything else in
this doc (mapping hazards, feature gaps, perf) is the *specifics*; this section is
the *stance* those specifics serve.

### 📋 Requirement — stay maximally abstracted; the adapter is the compatibility layer
GIST moves forward **above the `PhysicsAdapter` boundary**. All physics-touching
code — sims, renderers, controls, recording, the LLM contract — is
**engine-agnostic** and speaks only the SI, Y-up interface in
[src/physics/types.ts](src/physics/types.ts). A physics engine is a *plugin*: a new
or future engine is adopted by implementing `PhysicsAdapter` (as Rapier and Planck
do today), with **zero changes above the boundary**. The adapter — not the caller
— owns the job of making current and future engines behave compatibly (unit
normalization, Y-axis flip, setter idempotency, feature mapping). When an engine
cannot satisfy a need, that gap is recorded as an *Adapter feature gap* (below),
never patched into a caller. Active engines: **Rapier** (WASM, SI-native,
deterministic — the default) and **Planck** (pure-JS Box2D port). Matter was an
early exploration, removed 2026-05-11.

### 📋 Requirement — the physics curriculum LEADS (diorama-scoped model)
Engines are chosen and tuned to serve the **teaching diorama**, never the reverse.
GIST sims are scoped didactic dioramas, not physical oracles
(`/docs/design-philosophy` /
[DesignPhilosophy.tsx](src/pages/docs/DesignPhilosophy.tsx)). So the order of
operations is always: **(1)** the curriculum states what a sim must demonstrate
(a catch, a tumble, drag, a force balance); **(2)** the default engine must make
that point land cleanly; **(3)** cross-engine portability is *desirable but not
guaranteed* — when engines diverge, the curriculum decides which engine makes the
teaching point land, and that choice is recorded in the sim's refactor note. We do
not chase pixel-identical cross-engine behavior for its own sake.

**Concrete instantiation (2026-07-02): the four-doc curriculum-and-benchmark
roadmap.** "The curriculum LEADS" is now written down as a set of cross-referenced
root docs that drive dev from *physics topics* rather than engine-capability
checklists — each archetype names the physics it teaches, the collider/joint
technique it needs, the analytical solution that anchors the analytical↔numerical↔
experimental triangle, and the graph where that overlay happens on screen:
- **[PHYSICS_SHAPES.md](PHYSICS_SHAPES.md)** — collider archetypes (S-IDs), five
  rungs of climbing concavity; concave-collider refactor is Rung 2+.
- **[PHYSICS_JOINTS_CONSTRAINTS.md](PHYSICS_JOINTS_CONSTRAINTS.md)** — joint
  archetypes (J-IDs); addresses the 🔴 Joints gap below.
- **[PHYSICS_GRAPHS.md](PHYSICS_GRAPHS.md)** — canonical graph observables (G-IDs)
  + the five reading moves (slope / area / intercept / flatness / linearization).
- **[BENCHMARK_SIMS.md](BENCHMARK_SIMS.md)** — external acceptance suite (B-IDs)
  with frozen NL prompts and an A–E rubric; meta-metric = time-to-working-sim.

All four say they **"Feed CLAUDE.md"** — the repo still has no `CLAUDE.md`; the
intent is to synthesize these into one. Treat these as the *topics/curriculum* layer
above the per-refactor notes: they say *what to build and why*; the refactor notes
say *how it lands* (schema + prompt + adapter, the three-places rule).

### 📋 Development notes — per-engine experience & suitability
A consolidated log of where the two engines *perform differently* (distinct from
the outright *mapping-hazard bugs* tracked under "Cross-engine inconsistencies").
Use this to decide which engine a given sim type should run on.

- **Solver parameters / substeps — not engine-tuned.** Default iteration counts
  and substep sizes are the engines' own defaults, not calibrated per-engine (see
  *Performance & tuning* below). The precompute path substeps at ~480 Hz, which
  doubles as a de-facto CCD substitute on both engines — a key reason tunneling
  has been a non-issue even with thin colliders.
- **Air resistance — portable.** The quadratic, mass-dependent drag model maps to
  per-frame `setLinearDamping` → the substep-correct `v / (1 + d·dt)` on **both**
  engines, so damping behaves the same across them. (Matter's per-step `v *= 1−f`
  formula *diverged* and was one reason Matter was dropped — a cautionary data
  point: an engine whose integrator can't express the model uniformly is a poor
  fit.) See [Notes_on_Air_Resistance_Refactor.md](Notes_on_Air_Resistance_Refactor.md).
- **Concave colliders + rotational momentum — partially portable; Rapier favored
  for tumble. (2026-06-22)** Headless parity test of the Phase-0 compound cup
  (decompose → both adapters, stepped at dt=1/480): **portable** — the structural
  build (3 CCW ≤8-vert parts), mass/inertia/COM (~13%), straight-drop **catch**,
  and a **genuine topple** (load carried past the support edge) all match. **Not
  portable** — a within-base *impact* tips the cup in Rapier (peak ω 3→12 over a
  velocity sweep) but **never** in Planck (ω≈0, stays planted); and Planck is
  consistently **more energetic** (slides the cup 2–3× farther, ball retains far
  more post-collision speed). Root cause is solver/contact response, not inertia.
  **CORRECTION 2026-07-10 — the slide/energy divergence is likely (at least
  partly) friction mixing, not the solver:** Planck walls carry `friction: 0`
  and Box2D mixes contact friction as `sqrt(fA·fB)` → Planck ground contacts
  were frictionless in the parity test, while Rapier's walls (then) carried
  default 0.5. Rapier walls are now explicitly 0 with the Max combine rule
  (body's own friction dominates); Planck still needs a mixer/per-contact fix
  before the parity energy claim can be re-tested. See
  [Notes_on_Concave_Colliders_Refactor.md](Notes_on_Concave_Colliders_Refactor.md)
  Findings 2026-07-10 (first drive).
  **UPDATE 2026-08-09 — the Planck blocker is GONE; the sentence above is
  stale.** Planck aligned to the Max rule during the container work: a
  `begin-contact` hook stamps `max(fA, fB)` on every new contact
  (`PlanckAdapter.ts:246-252`), and the `friction` setter refreshes
  already-existing contacts (`:196-202`), since Box2D stamps a contact's
  friction once for its lifetime. **Both engines now combine friction as Max,
  and both create walls at friction 0** (Rapier explicitly; Planck via
  `material.friction ?? 0`). The open item is that nobody has re-run the
  parity energy test since — not the mixer.
  **Suitability:** for sims whose pedagogy hinges on impact-induced tip/tumble or
  precise post-collision energy, **prefer Rapier**; do not assume a tumble tuned
  on Rapier reproduces on Planck. See
  [Notes_on_Concave_Colliders_Refactor.md](Notes_on_Concave_Colliders_Refactor.md)
  "Planck parity — TESTED".
  - **Correction (2026-07-02): Planck's polygon cap in our pinned build is 12, not
    the Box2D-classic 8** that the parity finding assumed. `PolygonShape._set` silently
    **truncates** to the first `maxPolygonVertices` (12) and convex-hulls them — a quiet
    wrong-collider on a decomposed part >12, no throw. `≤8` is a *portability* target,
    not this build's limit. Since gist's `decomposePolygonShape` has **no per-part cap**,
    a part >12 mis-builds silently in Planck (Rapier re-hulls, safe). The scoped collider
    observation overlay + a gist-side post-decompose dev-warn are the mitigations; the
    8-vs-12 decision is deferred pending observation data. See the note's Findings
    2026-07-02.

**Quick engine-suitability guide (living):**
- **Rapier (default)** — deterministic, SI-native, WASM. Favor for: collision-
  response fidelity, impact-induced tip/tumble, post-collision energy accuracy,
  anything where reproducibility matters. Cost: ~2 MB WASM bundle; a single
  process-wide world (the adapter leases it; do not free/recreate mid-process).
- **Planck** — pure-JS Box2D port, no WASM, owns its own world (no singleton
  constraint). Fine for: simple rigid-body scenes, and the eventual friction-demo
  path. **Do not rely on it for** impact-induced rotation parity or matching
  Rapier's collision energy. Carries the per-contact friction-cache hazard (below).
- **General rule:** if a sim type shows up here as engine-sensitive, pick the
  engine that makes the teaching point land and pin `physicsEngine` in the config;
  note *why* in the relevant refactor doc so the choice isn't silently re-litigated.

---

## Legacy & deprecation

### 🟢 Matter removed (was an early exploration)
Matter (`matter-js`) was the project's first physics engine and stayed in-tree as a third `PhysicsAdapter` while Rapier and Planck were brought up. **Removed 2026-05-11.** The motivating costs: Matter's Y-down convention required adapter-level flipping, its per-step `frictionAir` formula (`v *= 1 − f`) diverged from Planck/Rapier's substep-correct `v / (1 + d·dt)`, and several adapter features (joints, sensors, contact events, CCD) were going to need engine-pair-only implementations anyway. Active engines are Rapier (WASM, default) and Planck (pure-JS Box2D port).
- **Migration shim:** [src/schemas/simulation.ts](src/schemas/simulation.ts) preprocesses `physicsEngine: "matter"` → `"rapier"` so any lingering saved configs load cleanly.

### 🟢 `frictionStatic` field on `BodyDef` — removed
Field was advertised in the schema + prompt but no engine mapped it. **Removed 2026-05-11** from `simulation.ts`, `BodyDef`, `ObjectRenderer`, and `gist_instructions.py`. Saved configs that still carry `frictionStatic` continue to load — Zod silently strips unknown keys.
- **Next step:** the principled `μs ≠ μk` story will return as an opt-in `frictionDemo` mode in the applied-forces refactor.
- See [Notes_on_Applied_Forces_Refactor.md](Notes_on_Applied_Forces_Refactor.md) "Static friction caveat".

### 🟢 `frictionAir` field — removed
The legacy constant-linear-damping field. With Matter gone, both remaining engines mapped it to `linearDamping` → `v / (1 + d·dt)`, but the LLM-prompt prose around its ranges was calibrated against Matter's per-step `v *= 1 − f` formula, so AI-generated values were effectively no-ops under the default engine. **Removed 2026-06-17** (air-resistance refactor Phase 3) from `simulation.ts`, `BodyDef`, both adapters, `ObjectRenderer`, `JsonSimulation`, the example sims, and `gist_instructions.py`. The quadratic, mass-dependent drag model (`environment.airResistance` + per-object `dragCoefficient` / `referenceArea`) is now the only damping path. Saved configs that still carry `frictionAir` continue to load — Zod silently strips unknown keys.
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

### 📋 Resting height differs by ~11 mm — Planck polygons carry a 10 mm skin (measured 2026-08-09)
A box authored to rest on the floor settles at **different heights per engine**: Rapier sinks ~5 mm into the contact, Planck **floats ~11.25 mm above** where its collider geometrically should sit. Cause is Box2D's polygon skin — `Settings.linearSlop = 5e-3`, `polygonRadius = 2 × linearSlop = 0.01 m` — which Planck adds around every polygon; Rapier has no equivalent and instead allows a small penetration. At `pixelsPerUnit: 100` the two differ by ~1.6 px. Consequences: (1) any authored gap smaller than 10 mm is already "in contact" on Planck but a real free-fall on Rapier (see the collider-inset trap below); (2) this is the cause of the 0.4987 (Rapier) vs 0.5150 (Planck) rest-height divergence noted while verifying the sleep change. Not a bug in either engine and not worth normalizing — but it means "resting on the floor" is engine-dependent at the millimetre scale, so don't calibrate a sim's y-positions to sub-centimetre precision on one engine and expect the other to match.

### 🟢 `body.mass = X` was a NO-OP on Rapier — FIXED 2026-08-13
Found by Bill driving `/simulation/applied-force-2d`: a mass slider set to 2 kg left the body at its authored 5 kg, so a force that should have lifted the crate correctly did not. Two defects in one line. (1) `setAdditionalMass` does **not** change `rigid.mass()` until `recomputeMassPropertiesFromColliders()` runs, which it never did — so the setter did nothing at all, in **both** directions. (2) Even with the recompute, total mass is `collider base + additional` with additional ≥ 0, so mass could only ever go UP; a body could never be made lighter than authored. **Planck was correct throughout** — a silent cross-engine divergence on the DEFAULT engine, in the one control `a = F/m` rests on. Fixed by scaling every collider's mass by `target/current_total` (creation already sets mass on colliders) then recomputing; scaling preserves a compound's mass distribution, so the centre of mass and inertia stay physical. Verified both engines, up and down, idempotent, survives stepping, compound colliders included. **Watch for the general shape:** a headless harness that constructs bodies with `mass` in the `BodyDef` never exercises the setter the UI uses, so adapter-level verification can pass while the feature is broken.

### 📋 A compliant-friction engine has NO threshold-free breakaway number (sharpened 2026-08-13)
The entry below reports Rapier's breakaway as ~4% low. **That figure is a property of the measurement, not of the engine** — sweeping the "did it move?" criterion over a 5 s window moves it continuously: −18.0% at 1 mm, −7.5% at 10 mm, and **+0.0% at 50 mm**, i.e. Rapier's true threshold matches `µmg` exactly. Planck reads +0.0% at every criterion because its static friction is rigid. So when quoting a breakaway measurement, **quote the motion criterion with it** or the number means nothing; and prefer Planck when you need a threshold-free answer. The angle dependence is mild and in the expected direction (apparent error −18.0% at θ = 0 → −21.7% at θ = 45°, tracking creep 18.5 → 23.4 mm at 0.99·F*, since a lifting pull reduces N). Full sweep: `Notes_on_Applied_Forces_Refactor.md` Findings 2026-08-13 §B.

### 📋 Applied force in 2D — the delivery rule generalizes, including the coupled friction case (measured 2026-08-13)
`J = F · dt_of_the_next_step` was measured in 1D with F horizontal, so N was constant. With a y-component the force changes N and therefore the friction budget µN that resists its x-component — the only genuinely new physics in 2D. Measured on both engines at the app's cadence, m = 5 kg, µ = 0.51: the **sliding regime `a = (F·cosθ − µ(mg − F·sinθ))/m` is exact to ≤0.02% at θ ∈ {−15, 0, 15, 27.02, 30, 45}°**, and Planck's (threshold-free) breakaway matches `F* = µmg/(cosθ + µ·sinθ)` to +0.0% at every angle. **No change was needed; nothing is owed.** The reason it works is invariant #14 — causes go into the solver and the solver resolves the coupling, so there is no app-side arithmetic to get wrong. Bonus: the optimal pull angle `arctan(µ)` reproduces (22.26 N at 27.02° vs 24.99 N flat). **Careful with what that angle means** (Bill's drive, 2026-08-13): `arctan µ` MINIMISES the force required, so at a FIXED force it is where acceleration PEAKS, not where the body starts moving. Solving `F ≥ µmg/(cosθ + µ sinθ)` for fixed F gives a WINDOW bounded by two breakaway angles — on `/simulation/applied-force-2d` (µ = 0.8, m = 5, F = 35 N) that is **[9.65°, 67.67°]**, with peak acceleration at 38.66°. Measured to match on both engines; Bill hand-calculated and observed the lower edge at ~10°.

### 📋 Static friction has different CHARACTER per engine — Rapier compliant, Planck rigid (measured 2026-08-09)
Below the breakaway threshold the two engines do not merely differ in magnitude, they behave differently in kind. Pushing a 5 kg block with µ = 0.51 (breakaway µ·m·g = 24.99 N), displacement over 5 s:

| F | 20 N | 22 N | 24 N | 24.9 N |
|---|---|---|---|---|
| Rapier | 0.2 mm | 5.5 mm | 14.7 mm | 19.5 mm |
| Planck | 0.0 mm | 0.0 mm | 0.0 mm | 0.0 mm |

**Planck's static friction is hard** — exactly zero drift right up to the threshold. **Rapier's is compliant**, creeping asymptotically as F approaches µmg (TGS-soft). So a naive "did it move?" breakaway measurement reads ~4% low on Rapier and ~0.04% high on Planck — the Rapier gap is a creep tail crossing the test's motion criterion, NOT a wrong threshold. The **sliding** regime is exact on both: `a = (F − µmg)/m` to within 0.01% at +50 N and +100 N. Practical read: at `pixelsPerUnit: 100` Rapier's worst-case creep is 1.5 px over 5 s — invisible, so the default engine is fine for B5-style "it doesn't move until you push hard enough" teaching. Worth knowing before anyone tries to measure µs to better than a few percent from a breakaway observation. Specimen: `/simulation/applied-force-1d`.

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

### 🟢 Force / impulse APIs — `applyImpulse` SHIPPED 2026-08-09
~~No `applyForce` or `applyImpulse` on `PhysicsBody` today. Blocks PhET-Forces-and-Motion-style sims.~~ **`applyImpulse(impulse: Vec2)` landed on `PhysicsBody` + both adapters** (Rapier `applyImpulse(v, true)`; Planck `applyLinearImpulse(v, getWorldCenter(), true)` — at the centre of mass, no torque). Callers above the adapter speak **Newtons** and convert once; the adapter speaks impulse.

**There is deliberately no `applyForce`.** Both engines clear accumulated forces after every substep, so a per-frame `applyForce` would reach only the first of ~8 substeps in precompute. The delivery rule that matters — measured, not assumed — is **`J = F · dt_of_the_next_step`**: converting over the LOGICAL frame dt and handing the result to a 1/480 s step collapsed measured breakaway from 19.6 N to 6 N and made a sub-breakaway crate creep 36 mm in 5 s. Delivery is therefore per engine step via `BaseSimulation`'s new `onPreStep(adapter, dt)` hook — the same cadence the engine uses for gravity. **NOT a solver-iteration concern:** cranking iterations 1 → 32 leaves the wrong number unchanged, and neither engine allows (or should allow) an impulse between solver iterations.

Still open: `applyImpulseAtPoint` (off-centre → torque) remains deferred, and there is no schema field yet — Phase 1 is debug-panel only by design. See [Notes_on_Applied_Forces_Refactor.md](Notes_on_Applied_Forces_Refactor.md) Findings 2026-08-09 items #3 and #6.
- **Plan:** [Notes_on_Applied_Forces_Refactor.md](Notes_on_Applied_Forces_Refactor.md) Phase 1.

### 🔴 Joints (spring, revolute, prismatic, rope, pulley)
Biggest content gap after applied forces. Needed for Hooke's law, pendulums, Atwood machines, springs/oscillators.
- Rapier has `JointData.spring(restLength, k, c)` natively (clean Hooke mapping); Planck has `DistanceJoint` + `PulleyJoint` + `MouseJoint` (the Planck-only joints).
- **Now scoped (2026-07-02): [PHYSICS_JOINTS_CONSTRAINTS.md](PHYSICS_JOINTS_CONSTRAINTS.md)** — a topics-driven roadmap of joint archetypes J1–J9 (pendulum, physical pendulum, spring-mass, lever, prismatic rail, ball-on-string, path-constraint, Atwood, double pendulum) with per-archetype definition-of-done and graph observables. Status stays 🔴 (adapter still exposes no joints; this is a *curriculum roadmap*, not a phased implementation refactor yet — no schema/prompt landing). **Engine asymmetries the roadmap flags to budget:** Rapier has **no native `PulleyJoint`** (Atwood needs a composed shim); Rapier rope/spring joints arrived ~0.12 — **verify availability in our pinned version** before committing to J1/J3/J6/J8. Schema should expose physics units (k, L, m) and hide per-engine parametrization in the adapter (Planck springs use `frequencyHz`, `k = m(2πf)²`).

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
- **Partially mitigated today by precompute:** `handlePlay` always precomputes at `precomputeTimestepHz = 480` and replays, so the fine sub-stepping is a de-facto CCD substitute. The concave-collider Phase 0 cup test caught a fast marble through sub-decimeter walls at a 2 m scene with no tunneling. CCD still matters for live (non-precomputed) play and very fast small bodies. See [Notes_on_Concave_Colliders_Refactor.md](Notes_on_Concave_Colliders_Refactor.md), Phase 2.

### 🟡 Per-body friction setter
Adapter doesn't expose `setFriction(μ)`. Needed for the `frictionDemo` mode (Phase 2.5 of applied forces).
- See cross-engine inconsistency note above re: Planck contact-cache.

### 🔴 Mass-property override (custom angular inertia) — Rapier gap; Planck honors def-time `inertia` (corrected 2026-07-16)
**Correction (2026-07-16, field-found via Bill's 1D-collision sim):** the
2026-07-02 code-read below was half right. There is still **no runtime
inertia setter** on either engine, but the **def-time** path is split:
`ObjectConfig.inertia` (schema-landed, `simulation.ts:119` — "1e10 prevents
rotation") IS plumbed by Planck (`setMassData` post-fixtures,
[PlanckAdapter.ts:262](src/physics/planck/PlanckAdapter.ts#L262) — shipped
with the engine itself, missed on 07-02) and **silently ignored by Rapier**
(`RapierAdapter` never reads `def.inertia`). Same sim rotates on Rapier,
doesn't on Planck; until fixed, inertia-reliant sims must pin
`physicsEngine: "planck"`. Rapier affordances verified in the pinned
typings: `lockRotations()` (the exact tool for the 1e10 no-rotation
semantic) and `setAdditionalMassProperties(mass, com, principalAngularInertia,
wake)` for finite overrides (replace-not-accumulate, same gotcha as mass).
Detail: [Notes_on_Concave_Colliders_Refactor.md](Notes_on_Concave_Colliders_Refactor.md)
Findings 2026-07-16 ("inertia override is Planck-only").

*(2026-07-02 read — superseded above on the def-time half; the setter half
stands:)* the adapter exposes a **mass** override (`setMass`/`setAdditionalMass`,
added in the air-resistance refactor — Rapier
[RapierAdapter.ts:226](src/physics/rapier/RapierAdapter.ts#L226), Planck
`setMassData`) but **no angular-inertia setter**. Needed for
`PHYSICS_SHAPES.md` v2's **mass-property override** technique — the rolling
race (S0.2) collides all three bodies as convex circles but must carry a
*different* inertia each (`I = mr²` hoop / `½mr²` disk / `⅖mr²` sphere) so
`a = g sinθ / (1 + I/mr²)` comes out right **without any concave annulus
collider**. It's the cheapest correct route to the hoop and resolves that old
concave open question.
- **Plan:** add an idempotent inertia/mass-properties setter to `PhysicsBody`
  (Rapier `setAdditionalMassProperties`; Planck
  `body.setMassData({ mass, center, I })`), and fix the def-time Rapier path in
  the same pass — suggested mapping: `inertia` ≥ sentinel → lock-rotations on
  both engines (Planck `fixedRotation`), finite → angular inertia over the
  collider-derived base. Idempotency required (see principle above). Gated
  with the shapes rolling-race / joints work. Tracked in
  [Notes_on_Concave_Colliders_Refactor.md](Notes_on_Concave_Colliders_Refactor.md)
  (Findings 2026-07-02 scope item #4 + 2026-07-16).

---

## Schema / LLM coordination

### 🔴 Adding a schema field without an LLM prompt update → silent no-op for AI-authored sims
Every refactor that adds a field (drag coefficients, applied force, frictionDemo, polar vectors) is dead until the LLM knows to populate it. Currently the prompt lives in [modal_functions/gist_instructions.py](modal_functions/) and isn't kept in sync as part of the refactor checklist.
- **Open:** add "update LLM prompt" as an explicit checklist item to every refactor's Phase 2 (when the field becomes JSON-authorable). Today this lives as a "Follow-on" footnote in each refactor doc — easy to miss.

### 🔴 Engine compatibility per field
Some schema fields are inherently engine-specific (`solverIterations` works for both but with different defaults; `positionIterations` is Planck-only; spring joints are cleaner under Rapier). Today the schema accepts everything regardless of which engine the sim picks.
- **Open question:** should the parser warn/error when an authored sim picks an engine that doesn't support a field it uses? Or silently no-op? Lean: warn at parse time, render the sim regardless. Concrete trigger: when the joints adapter lands and `JointConfig` becomes a thing. **No longer hypothetical (2026-07-16):** `ObjectConfig.inertia` is this field *today* — the schema `.describe()` promises it engine-agnostically, Planck honors it, Rapier silently ignores it (see "Mass-property override" gap above). Sub-question: caveat the `.describe()` string now ("currently Planck-only") or wait for the CC4 fix.

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

### 🟢 Body sleep DISABLED globally at body creation — SHIPPED 2026-08-09 (with named revisit triggers)
**Landed + DRIVE-CONFIRMED by Bill 2026-08-09** (`/simulation/ramp-slide`: no perceptible perf cost; vectors persist below the breaking-point angle; expected motion/friction/net force past breakaway). `PlanckAdapter.createBody` passes `allowSleep: false`; `RapierAdapter.createBody` calls `bd.setCanSleep(false)`. Both adapters funnel wall creation through `createBody`, so one edit each covers every body. **Verified through the real adapters:** a 5 kg box resting on ground reads `getContactForces().normal.y` = **49.00 N (exactly m·g, 100%) at every sample across 10 s on BOTH engines** — previously Planck's reading collapsed to 0 by ~0.5 s and Rapier's by ~1.5 s.

Both engines put resting bodies to sleep (**not Planck-only** — Planck by ~0.5 s via `Settings.timeToSleep`, Rapier ~1 s later; measured). A sleeping body's solver impulses flatten, so `getContactForces()` returns zero and its normal/friction arrows vanish — the free-body diagram silently empties out on exactly the resting/below-breakaway scenes that teach static friction. Decision: **disable sleep for all bodies, in both adapters, at creation** (Planck `setSleepingAllowed(false)`; Rapier `RigidBodyDesc.setCanSleep(false)` — Rapier has **no runtime `canSleep` setter** in 0.19.3, which is why this is a creation-time decision rather than a per-body knob). Deliberately **not a debug toggle**: a knob that changes trajectories would have to join the frame-cache key (invariant #13), and keeping it out is worth more than the knob.

**Measured cost** (planck 1.4.2, 10 s of sim = 4800 substepped `world.step` calls, dev Mac): 5 bodies 83 ms · 20 bodies 330 ms · 100 bodies 1488 ms · 500 bodies 7977 ms. At diorama scale that is **~0.5 ms per logical frame, ~3% of the 60 fps budget**. The 22–89× ratios against sleep-on are meaningless — sleeping costs ~0, so the ratio divides by nothing. **Stability cost: none** — a resting box drifts 0.0000 mm over 10 s with sleep off, max |v| 2.3e-18 m/s, on both engines.

**REVISIT WHEN EITHER FIRES** (Bill, explicitly — this is reversible and should stay visible):
- **Object count** — if sims start carrying more objects than we can comfortably handle. The knee is past ~100 bodies; 500 eats 80% of the frame budget. Cost is per-awake-body-that-would-have-slept, so it bites hardest in piles/stacks/bins that settle and stay settled.
- **Low-performance hardware — Chromebooks especially.** The numbers above are from a dev Mac and should not be assumed to travel. Re-measure on target hardware; a 10–20× slower machine turns 0.5 ms/frame into something real.

Graceful fallback if a trigger fires is **narrowing, not reverting**: sleep on by default, disabled only on bodies whose sim declares force display — which costs the Rapier body-recreate workaround this decision currently buys out of. Full data + rationale: [Notes_on_Applied_Forces_Refactor.md](Notes_on_Applied_Forces_Refactor.md) → Findings 2026-08-09 (Goal 2, item #4).

---

## Tooling & developer experience

### 🟢 "Import Object" debug feature — SHIPPED 2026-07-03
Debug-panel button that imports an SVG-generator export (the "Download
approved" `.zip` directly, or loose `.svg` + manifest `.json`) into a live sim
as a new object: SVG + manifest entry register at runtime (session-only, never
touches `public/renderables/`), user picks dynamic vs static, object lands at
scene center at ~20% of the smaller scene dimension so it's immediately
grabbable/resizable via EditOverlay. Native zip reader
([src/lib/zipReader.ts](src/lib/zipReader.ts)) — no jszip dependency. The
workflow companion (and data feeder) to the observation overlay below; basic
functionality confirmed by Bill 2026-07-03. **Three-places intentionally
untouched** — nothing LLM-authorable. **Follow-ups BUILT + CONFIRMED
2026-07-03**: import-time slider-control presets (Speed /
Launch angle / Accel X-Y — Bill's picks; no position sliders) and select +
Delete removal of ANY object with full control/output/graph cleanup — the
first object-removal UI. Full record:
[Notes_on_Concave_Colliders_Refactor.md](Notes_on_Concave_Colliders_Refactor.md)
→ Findings 2026-07-03 (both entries).

### 🟢 Collider debug / observation overlay — BUILT 2026-07-03 (scoped 2026-07-02; engine-actual layer deferred)
A dev-only visualization of the **actual collider geometry** each object gets, to
confirm SVGs + manifest data from the SVG generator are good *before* making dev
decisions here or upstream. **Built:** `?colliders=1` (mirrors `?simdebug=1`) draws a
`body-outline` per object — because `body.shape` for a concave `type:"convex"` collider
*is* the decomposed compound, this renders the poly-decomp split directly (the "render
the decomposed collider" switch the generator repo's `Dev_Tasks.md` Task 13 logs as
Bill's gist TODO). Each part gets a distinct palette color; polygon parts get a
vertex-count label, **red above this Planck build's silent truncate+hull cap of 12**
(see engine-notes correction below); compounds get an "N parts" readout.
[BodyOutline.ts](src/components/simulation_components/renderables/visuals/BodyOutline.ts)
`debugParts` mode + `synthesizeColliderDebugRenderable`. **Deferred:** the optional
engine-actual-fixture overlay (Planck `fixture.getShape().m_vertices` / Rapier collider
verts) that would expose truncation/hull discrepancies — the intended-vs-engine diff.
Its **first live justification** landed 2026-07-18 (baseball on Planck: rehulled
collider bulged past the drawn sprite, invisible to this overlay's intended-parts
view) — deferral **re-affirmed 2026-07-19** (Bill: upstream census cleanup should
make the specimen class rare; revisit if over-cap colliders keep reaching drives).
**Framed as an observation instrument** — gather data on real objects first, defer
threshold/heuristic decisions. Confirmed by Bill 2026-07-03; same day it also became
a debug-panel **"Show colliders" checkbox** (live toggle; `?colliders=1` now sets the
initial state). Full spec + build record:
[Notes_on_Concave_Colliders_Refactor.md](Notes_on_Concave_Colliders_Refactor.md) →
"Collider debug / observation mode" + Findings 2026-07-03.

### 🟢 Seam diagnostics bus + visible badge — SHIPPED 2026-07-20 (scoped 2026-07-19)
Built as scoped and drive-confirmed by Bill:
[src/lib/diagnosticsBus.ts](src/lib/diagnosticsBus.ts) (`reportDiagnostic()` =
console.warn passthrough + keyed session store, microtask-coalesced notify) +
amber count pill on the collapsed Debug Mode button and expandable list in
the panel (dev-gated; three-places untouched — nothing LLM-authorable).
Producers: CC2 over-cap warn + all container-expansion warn/drop cases.
**Ratified semantic (Bill 2026-07-20): the bus reports LIVE config-state
truth, never past events** — the expansion memo clears the store each
re-expansion and producers re-derive (per-call checks, bus-deduped), so a
fixed sim drops its badge without a reload and no stale/past-event notice
survives. The parked **dup-id warning found a different home than predicted**:
duplicate ids are now REJECTED at the commit boundaries (Tweak-JSON editor +
paste-to-create, like a parse error), with a runtime rename-and-badge
backstop for configs that arrive broken (legacy DB / LLM slips).
Ingestion-boundary checks remain future producers. Ship record + lifecycle
rule + dup-id resolution:
[Notes_on_Concave_Colliders_Refactor.md](Notes_on_Concave_Colliders_Refactor.md)
→ Findings 2026-07-20.

### 🔴 No automated test for setter idempotency / cross-engine parity
The Rapier mass-setter bug was caught by hand. A small test harness that pumps each public `PhysicsBody` setter twice with the same value and diffs the resulting state across both engines would catch a whole class of regressions. Same for "after restore, every setter returns to a documented baseline."

### 🔴 No "physics-engine matrix" CI test
For the same input config, do both engines produce *qualitatively* the same outcome (e.g., a 1 kg ball falls X meters in 1 s under g=9.81 within tolerance)? Today, divergences are found by hand at debug time (see the slider-confound investigation in the air-resistance notes).

### 📋 Debug logging convention
The slider-confound investigation in the air-resistance notes used a one-off `console.log` template ([Notes_on_Air_Resistance_Refactor.md](Notes_on_Air_Resistance_Refactor.md), "Empirical debug procedure"). Worth keeping that template handy — same shape catches other UI-input/physics-output confounds.

### 🟢 Local-only sim testing (static JSON + wrapper + route)
A way to exercise a sim entirely from the repo, with no DB round-trip and no prompt→sim generation. The pattern (established by the concave-collider Phase 0 cup tests): drop a config at [src/simulations/](src/simulations/)`<name>.json`, add a thin wrapper `<Name>Simulation.tsx` that does `<JsonSimulation config={…} localJsonEdit />`, and register a `<Route path="/simulation/<slug>">` in [App.tsx](src/App.tsx). Two affordances make it useful for engine work:

- **`localJsonEdit` prop** on [JsonSimulation.tsx](src/components/JsonSimulation.tsx) — surfaces the *Tweak Simulation JSON* / edit / remix / save buttons even though there's no `simulationId`. Saving persists a fresh root row (`parent_id = null`) via `createSimulation` and navigates to `/simulation/:id`, after which the normal DB-backed affordances take over.
- **`?simdebug=1` URL flag** — enables gated per-body logging in [BaseSimulation.tsx](src/components/BaseSimulation.tsx): the initial snapshot (confirms which bodies/colliders were created) plus a throttled per-step dump of each body's position / velocity / angle / angular-velocity. Silent without the flag.

**Gotcha (the divergence trap):** the on-disk `.json` is imported by its `.tsx` wrapper at build time (Vite HMR re-imports on save), but **in-app edits save to the DB, not back to the file**. So a sim tuned through the in-app editor lives in the DB while the repo file stays at its seed value — they silently diverge. Treat the local file as the *seed* and the DB as the *iteration surface*; if you want tuned values back in the repo, copy them in by hand.

**Why this matters going forward:** it's the cheapest way to prototype raw adapter/engine features that the schema and the prompt don't support yet — exactly the 🔴 items under *Adapter feature gaps* above (joints, sensors, contact events, CCD) and wishlist constructs like event sequences. Author the JSON by hand, wire a throwaway route, and watch it with `?simdebug=1` long before the LLM pipeline learns the new field.

### 🟢 Scripted sim screenshots (headless Chrome via Playwright) — BUILT 2026-08-10
A repeatable way to *drive* a local sim and capture publication-quality stills — built to illustrate a collaborator write-up, but the harness generalizes to exhibits, docs-page figures, and before/after evidence in refactor notes.

**Setup, deliberately zero-footprint:** `npm install playwright` (~2 MB of JS) installed OUTSIDE the repo, driving the already-installed Chrome via `channel: 'chrome'`. No browser download, and `package.json` / the lockfile are never touched. **Do NOT run `npx playwright install chrome`** — that invokes `playwright-core/bin/reinstall_chrome_stable_mac.sh`, which opens with `rm -rf "/Applications/Google Chrome.app"` before re-downloading it. Launching the existing Chrome never touches those scripts.

Four things had to be learned by driving, and they're the reusable part:

- **Force arrows do not exist at t = 0.** Contact forces are read back from solver impulses, so a screenshot taken before the first `step()` shows gravity alone. **Play, then pause** — a still of an unstepped sim is not a free-body diagram.
- **Seek to a FRAME, don't race the wall clock.** After precompute the transport exposes a scrub `input[type="range"].accent-blue-500`; setting it via the native value setter + an `input` event lands on an exact frame. Wall-clock waits are hopelessly coarse for fast scenes — `bowlingBallAndFeather` (`pixelsPerUnit: 280`, objects at y = 2 m) lands in ~0.62 s, so even a 1 s wait captures an empty floor.
- **Crop on SATURATION, not luminance.** The canvas grid and axis labels are low-saturation greys; every object and arrow is saturated. Selecting pixels with `max(r,g,b) − min(r,g,b) > ~34` finds the content and ignores the grid — an earlier attempt that also accepted dark pixels selected the whole canvas and cropped nothing. Sims are authored to a diorama viewport, so the interesting region is often a small corner of it and uncropped stills read as empty boxes.
- **Selectors:** `button[title="Play"]` / `button[title="Pause"]`; the debug panel starts collapsed behind a *Debug Mode* button; graph cards are 3 ancestors above `.recharts-wrapper`.

Scripts (`lib.mjs` + per-shot drivers) were kept by Bill outside the repo for reuse. **Not committed and not a dependency** — this is an on-demand harness, not a build step, and nothing in the app knows it exists.

---

## Index of related refactor docs

- [Physics_Chapters_with_Physics_Engines.md](Physics_Chapters_with_Physics_Engines.md) — engine affordances mapped to physics units
- [Notes_on_Air_Resistance_Refactor.md](Notes_on_Air_Resistance_Refactor.md) — quadratic-drag refactor, includes the mass-setter fix writeup
- [Notes_on_Applied_Forces_Refactor.md](Notes_on_Applied_Forces_Refactor.md) — PhET Forces and Motion analogue, includes the static-friction demo mode
- [Notes_on_Vector_Representation_Refactor.md](Notes_on_Vector_Representation_Refactor.md) — magnitude/angle as first-class polar representation for any vector field
- [Notes_on_Concave_Colliders_Refactor.md](Notes_on_Concave_Colliders_Refactor.md) — concave containers via convex decomposition (cup/wagon); Phase 0 shipped

### Curriculum & benchmark roadmap (topics-driven; added 2026-07-02)
The *what-to-build-and-why* layer above the per-refactor notes. See the "curriculum
LEADS" section above for how they relate.
- [PHYSICS_SHAPES.md](PHYSICS_SHAPES.md) — collider archetypes (S-IDs), five concavity rungs
- [PHYSICS_JOINTS_CONSTRAINTS.md](PHYSICS_JOINTS_CONSTRAINTS.md) — joint archetypes (J-IDs); the new joints workstream
- [PHYSICS_GRAPHS.md](PHYSICS_GRAPHS.md) — canonical graph observables (G-IDs) + five reading moves
- [BENCHMARK_SIMS.md](BENCHMARK_SIMS.md) — external acceptance suite (B-IDs), frozen prompts, A–E rubric

---

## Items considered but not included (worth surfacing if relevant)

A short list of things that could plausibly belong here but I'm less sure about — surface them if they ring true:

- **Locales / i18n for physics-related strings** — recent commit added "first pass at localization." Is there a system-level concern about which physics labels are localizable (e.g., "velocity", units like "m/s"), or is this orthogonal?
- **Multiple sliders binding to the same property** — what happens? Race? Last-wins? Probably untested.
- **Stale body references when objects are destroyed mid-sim** — does the slider system hold direct references that go bad? Or look up by id every time?
- **Mouse/touch interaction with physics bodies** — recent commits added drag-to-move and zoom; is that path interacting with physics correctly across both engines?
- **Edit mode vs. play mode setter contract** — does editing a body's position in Edit mode go through the same code path as a slider in Play mode? If they diverge, that's a class of bugs.
