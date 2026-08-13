# Notes on Applied Forces Refactor

Status: **Goal 1 (free-body diagrams) largely shipped; Goal 2 (applied forces)
plan reconciled 2026-08-09, not yet implemented.**
Scope: Planck and Rapier adapters.

> ⚠️ **Read the plan below against Findings 2026-08-09 §A.** Sections written
> in May 2026 predate the entire Goal-1 workstream, and three of their claims
> are stale: `setFriction` already exists, Phase 4's engine contact-force
> readback already SHIPPED (and inverted its own premise — zero jitter), and
> the force-arrow renderer already SHIPPED. The remaining Goal-2 surface is
> the adapter seam, the per-frame wiring, and the schema.
Reference target: PhET's *Forces and Motion: Basics* — applied-force slider, force arrows, sum-of-forces arrow, friction toggle.

> **Note (2026-05-11):** these notes were written while Matter was still in-tree. Matter has since been removed; "Matter no-op" mentions below are historical. The plan itself is unaffected — it always targeted Planck/Rapier.

---

## Background — what PhET shows, what we have today

PhET's *Forces and Motion: Basics* has four screens, all sharing the same core: a single dynamic body on a horizontal surface with

- An **applied-force slider** (continuous, signed) the user can ramp or zero
- **Force arrows** rendered on the body — applied, friction, and a "sum of forces" arrow
- A **friction toggle** (None / Lots, plus a slider on one screen)
- A **mass picker** (drop a fridge / crate / kid onto the cart; mass changes)
- **Speedometer + value readouts** for force, mass, acceleration

What's already in the codebase that maps:

| PhET feature                | Maps to                                                | Status                          |
|-----------------------------|--------------------------------------------------------|---------------------------------|
| Mass picker                 | Mass slider via `setMassData` / `setAdditionalMass`    | Wired (Rapier setter just fixed) |
| Friction toggle/slider      | `BodyDef.friction` per-fixture                         | Wired                           |
| Speedometer / value readouts| Position/velocity getters → Recharts overlays          | Wired (graphs exist)            |
| Slider + Toggle UI          | `controls/variants/Slider.tsx`, `Toggle.tsx`           | Wired                           |
| **Applied-force slider**    | (none)                                                 | **Missing — adapter API + schema** |
| **Force arrows**            | (none)                                                 | **Missing — visual layer**      |
| **Sum-of-forces arrow**     | (none)                                                 | **Missing — compute + visual**  |
| Camera follow               | (none)                                                 | Missing (not physics)           |

The biggest gap is the **applied-force pipeline itself**: there is no `applyForce` / `applyImpulse` anywhere on `PhysicsBody` ([src/physics/types.ts:60-80](src/physics/types.ts#L60-L80)), and no schema field for "this body has a controllable applied force." Mass, friction, restitution, and damping are wired; force application is not. Everything else is incremental.

---

## Recommended approach: per-frame impulse, not per-step force

In the existing `onUpdate` callback ([BaseSimulation.tsx:279-284](src/components/BaseSimulation.tsx#L279-L284)), translate the user's applied force `F` into an impulse `J = F · FIXED_DT_SECONDS` and apply it once per logical frame.

**Why impulse and not force:**

- An impulse changes velocity once. The new velocity persists across all substeps in precompute mode — no under-delivery, no need to multiply by substep count.
- A force is cleared after `world.step()` in both engines, so applying it in `onUpdate` only reaches the **first** of ~8 substeps in precompute mode (the same trap the air-resistance notes called out at [Notes_on_Air_Resistance_Refactor.md](Notes_on_Air_Resistance_Refactor.md), "Why not `applyForce` directly").
- Apply `J = F · dt_logical` once per frame and the velocity change per logical frame is `F · dt / m = a · dt` — matches the textbook integration to first order. Position is then `v · dt + ½ · a · dt²` from the engine's semi-implicit integrator (correct).
- Zero adapter changes beyond adding `applyImpulse` itself.

**Why not a per-substep `onPreStep(body, dt)` hook:**

It's strictly more accurate (a true continuous force, re-applied at every substep) but more invasive — it changes the BaseSimulation precompute loop's contract — and at 60 Hz with educational masses and forces, the difference between "impulse once per frame" and "force every substep" is below visual threshold. Defer until something genuinely needs it.

---

## `PhysicsBody` interface additions

Add to [src/physics/types.ts](src/physics/types.ts) (per-body, sitting alongside `setLinearDamping` — same shape, same layer):

```ts
export interface PhysicsBody {
  // ... existing fields
  applyImpulse(impulse: Vec2): void;
  /** Off-center impulse — induces both linear and angular response. Optional. */
  applyImpulseAtPoint?(impulse: Vec2, point: Vec2): void;
}
```

Per-engine wiring:

- **Planck**: `body.applyLinearImpulse(impulse, body.getPosition(), true)` (last arg wakes the body). For `applyImpulseAtPoint`: `body.applyLinearImpulse(impulse, point, true)`.
- **Rapier**: `rigid.applyImpulse({ x, y }, true)`. For `applyImpulseAtPoint`: `rigid.applyImpulseAtPoint(impulse, point, true)`.
- **Matter**: leave as a no-op (deprioritized — see [project_matter_deprioritized.md](.) in memory).

---

## Schema additions

```jsonc
"objects": [{
  "appliedForce": {
    "x": 0,                  // N
    "y": 0,
    "controllable": true     // optional; surfaces a slider in Edit mode
  }
}]
```

If `controllable` is true, the existing slider control machinery binds to `appliedForce.x` (and/or `.y`) the same way mass and friction sliders do today via `controls/variants/Slider.tsx`. **No new control variant needed for Phase 1.**

For multi-puller / tug-of-war demos later (PhET's *Net Force* screen), the schema can grow:

```jsonc
"appliedForces": [
  { "id": "left_team",  "x": -200, "y": 0, "controllable": true },
  { "id": "right_team", "x":  150, "y": 0, "controllable": true }
]
```

The adapter sums them per frame; the "sum of forces" arrow comes for free.

---

## `JsonSimulation` `onUpdate` wiring

For each dynamic body with `userData.appliedForce` (or summed `userData.appliedForces`):

```ts
const F = computeAppliedForce(body, controlValues);  // sums all sources
const J = { x: F.x * FIXED_DT_SECONDS, y: F.y * FIXED_DT_SECONDS };
if (J.x !== 0 || J.y !== 0) body.applyImpulse(J);
```

Skip if static or mass ≤ 0. Cache `F` on `userData` so the visualization layer can read it without recomputing each render.

---

## Force-arrow visualization

> **STALE (see Findings 2026-08-09 §A):** the renderer shipped as
> `VectorArrow` + `synthesizeForceDebugRenderables` + `?forces=1`, not as
> `ForceArrow.tsx`. `force-applied` is the last unwired kind and its branch
> already waits at `VectorArrow.ts:94` — no renderer work is owed. The
> "render the sum arrow analytically" instruction below is ALSO superseded:
> engine readback shipped early and measured zero jitter, so analytical-vs-
> engine is now the open step-4 decision, not a settled default.

PhET's arrows are the engaging bit. Where it goes:

- New `renderables/visuals/ForceArrow.tsx` that takes `{ origin, vector, color, label }` and renders an SVG arrow scaled to the body.
- `ObjectRenderer.tsx` reads:
  - `userData.appliedForce` → applied-force arrow
  - `userData.dragK` + velocity → drag arrow (already computable from the air-resistance refactor)
  - On-contact tangential impulse → friction arrow
- **Sum-of-forces arrow**: sum the vectors above + `m · g` for gravity. Phase 1 / Phase 2 use an *analytical* approximation rather than reading contact forces from the engine: on a flat surface the body has no vertical motion, so `normal = -m · g` cancels gravity vertically, and friction is `-sign(v) · μ · m · g` horizontally. The horizontal net is `applied + analyticalFriction`. Good enough for the Basics screens, where the body is on flat ground.
- A debug toggle for "Show force vectors" (PhET has the same), wired through `AdvancedDebugPanel` like the air-resistance toggle.

Reading actual contact forces from the engine (Planck `postSolve` / Rapier `ContactForceEvent`) is Phase 4+ work and only needed for non-flat surfaces or stacks.

---

## Static friction caveat

PhET's "the box doesn't move until force exceeds `μ · m · g`" is approximately what both engines do already: when `v = 0`, the contact's tangential constraint holds the body up to `μ · N`, and beyond that it slides. There's a single μ — no `μs > μk` distinction.

Practical implications:

- For PhET parity, set `friction` to PhET's static value. The slight breakaway "stiction" PhET shows (where μs > μk produces a brief jolt at the moment of slip) isn't reproducible without a custom layer for the *general* case — see the next section for the opt-in demo mode that handles it for explicit static-friction sims.
- **`frictionStatic` removed from `BodyDef` + schema + prompt (2026-05-11).** Was unwired (no engine mapped it) and a footgun for LLM-generated configs. The principled separate-coefficients story lives in the demo mode below, not in a per-body field that's silently a no-op for ordinary sims.

---

## Static-friction demo mode (opt-in)

The general system uses one μ. That's right for ordinary sims (Forces and Motion: Basics, projectile motion on grass, etc.) — adding `μs > μk` everywhere would slow the solver loop down and complicate behavior nobody asked for. But there are **classic static-friction experiments** where the `μs / μk` distinction *is the lesson*:

1. **Rotate ramp until block slides.** Ramp angle ramps up; block stays at rest while `tan(θ) < μs`; at the breaking angle it slips and starts sliding under `μk`. Plot: position vs. time stays at zero, then takes off. Compute μs analytically from the breaking angle.
2. **Force-ramp breakaway.** Block on flat surface, applied force ramps linearly from 0. Friction force tracks the applied force up to `μs · N`, then drops to `μk · N` at the moment of slip. Plot: friction force vs. time has a sawtooth-like kink at breakaway.
3. **Stick-slip / chair leg shudder.** Body alternates between resting (static) and slipping (kinetic) under sustained applied force near the breakaway threshold. Visible as oscillation in velocity. (Lower priority — can ship without it.)

These cases are *intentionally* designed to require the extra complication. So the proposal is: **a clearly opt-in `frictionDemo` mode that adds the μs/μk hysteresis only on bodies that explicitly request it.** The general system stays simple.

### Mechanism

A per-body opt-in field:

```jsonc
"objects": [{
  "frictionDemo": {
    "muStatic": 0.5,
    "muKinetic": 0.3
  }
}]
```

In [`JsonSimulation.onUpdate`](src/components/BaseSimulation.tsx), for each body with `userData.frictionDemo`:

```ts
const fd = body.userData.frictionDemo;
const wasSliding = body.userData.isSliding === true;
const speed = Math.hypot(body.velocity.x, body.velocity.y);

if (wasSliding) {
  // Stay kinetic until the body genuinely comes to rest.
  if (speed < REST_EPSILON) {
    body.setFriction(fd.muStatic);
    body.userData.isSliding = false;
  } else {
    body.setFriction(fd.muKinetic);
  }
} else {
  // At rest: hold under μs. Engine's tangential constraint enforces this
  // up to μs·N automatically; once it slips, speed becomes nonzero and we
  // flip to kinetic on the next frame.
  if (speed >= REST_EPSILON) {
    body.setFriction(fd.muKinetic);
    body.userData.isSliding = true;
  } else {
    body.setFriction(fd.muStatic);
  }
}
```

The sticky `isSliding` flag prevents chattering near the threshold: once the body has broken free, it stays kinetic until it actually stops, even if speed dips momentarily. Captures the right physics — you have to push hard to break free, but once moving, kinetic dominates.

### Adapter additions

> **STALE (see Findings 2026-08-09 §A):** this already landed as a live
> `friction` property setter — `types.ts:76`, `RapierAdapter.ts:262`,
> `PlanckAdapter.ts:191` (including the contact-reset anticipated below).
> Only the `frictionDemo` schema field and the sticky-`isSliding` switching
> remain in Phase 2.5.

Add `setFriction(μ: number): void` to [`PhysicsBody`](src/physics/types.ts#L60-L80). Both engines support it natively:

- **Planck**: iterate fixtures, `fixture.setFriction(μ)` (then call `contact.resetFriction()` on existing contacts so the change takes effect — Planck caches per-contact friction at contact creation).
- **Rapier**: iterate colliders attached to the body, `collider.setFriction(μ)`.
- **Matter**: no-op (deprioritized).

### Visualization

Pairs naturally with the force-arrow work in Phase 2:

- **Friction-force arrow** computed analytically from `isSliding` and the current applied/gravity force: while at rest, `friction = -applied` (capped at `μs · N`); while sliding, `friction = -sign(v) · μk · N`. Renders the breakaway kink visually.
- **Friction force vs. time graph** — a single scalar plot that shows the sawtooth at breakaway. Becomes the canonical visual for the force-ramp demo.

### Scope guard

The demo mode is *only* active for bodies that opt in via `frictionDemo`. Bodies without it use the general single-μ model with zero added solver-loop cost. The LLM prompt should:

- Default to plain `friction` for ordinary sims.
- Use `frictionDemo` only when the sim explicitly teaches static friction (e.g., the prompt mentions "find μs", "ramp angle until slip", "breakaway force", "stick-slip", or similar).

This is the "added complication fits in intentionally designed circumstances" principle — the demo mode is a sharp tool with a narrow brief, not a general upgrade.

---

## Phased rollout (matching the air-resistance pattern)

### Phase 1 — adapter + impulse path, debug-panel-only

- Add `applyImpulse` to `PhysicsBody` and to all three engine adapters (Matter as no-op).
- Add a debug-panel "Applied force X" / "Applied force Y" slider that writes onto a single hand-picked dynamic body's `userData.appliedForce`.
- `JsonSimulation.onUpdate` reads it, computes `J = F · dt`, calls `applyImpulse`.
- **No schema changes, no LLM updates.** Validates the wiring end-to-end.
- **Acceptance test**: push a 2 kg body with 10 N on a frictionless surface → expect 5 m/s² → confirm with velocity slope on the existing graphs. Repeat under Rapier and Planck.
- **AMENDED 2026-08-09 — two grounded cases join it**, because the frictionless test above passes even if contact behaviour is badly wrong: (2) **breakaway** — ramp F from 0 on a crate with authored µ, measure the breakaway F against `µ·m·g`; (3) **sub-breakaway creep** — hold F at ≈0.5·µmg for 5 s, expect ZERO displacement. Isolate against the `ramp-slide` 1% baseline (µ = 0.404 vs 0.4 authored, gravity-driven). Rationale and the predicted artifact: Findings 2026-08-09 (Goal 2, item #3).
- **TWO INVARIANT-ERA ADDITIONS the May-2026 plan could not know:** the debug-panel slider MUST join the frame-cache key (invariant #13 — `JsonSimulation.tsx:1409-1417`; otherwise it silently replays stale frames, the air-toggle bug verbatim), and `userData.appliedForce` MUST ride `FrameBodySnap` (the standing replay rule from FBD step 2) or the arrow is invisible in replay. Write F at ONE site, drag-style (invariant #14).

### Phase 2 — schema field + force-arrow visualization

- Add `appliedForce` to `ObjectConfigSchema` with `controllable: true` opt-in.
- Wire the existing slider variant to `appliedForce.x`.
- Add `ForceArrow` renderable and a "Show force vectors" debug toggle.
- Update LLM prompt with examples ("push the cart with 50 N").
- **Acceptance test**: a JSON sim with `appliedForce: { x: 50, y: 0, controllable: true }` produces a working PhET-Motion-screen analogue.

### Phase 3 — multi-source forces + sum-of-forces arrow

- `appliedForces[]` array with per-source labels (for Net Force tug-of-war).
- Sum-of-forces arrow rendered analytically (gravity + applied + drag + analytical friction).
- PhET-style *Net Force* demo becomes JSON-authorable.

### Phase 2.5 — static-friction demo mode (parallel track)

Independent of Phases 3–4; can run alongside Phase 2 once `applyImpulse` exists.

- Add `setFriction(μ)` to `PhysicsBody` and engine adapters.
- Add `frictionDemo: { muStatic, muKinetic }` to `ObjectConfigSchema`.
- Speed-based switching with sticky `isSliding` flag in `JsonSimulation.onUpdate`.
- Add the friction-force arrow + friction-vs-time graph for the breakaway visual.
- Two reference sims to ship with the LLM prompt: ramp-tilt and force-ramp.
- **Acceptance test**: with `muStatic = 0.5, muKinetic = 0.3`, force-ramp from 0 to 6 N on a 1 kg body → block stays at rest until applied ≈ 4.9 N (`μs · m · g`), then accelerates under net force `applied − μk · m · g`. The friction-vs-time plot shows the kink.

### Phase 4 (optional) — engine-read contact forces

> **SHIPPED EARLY 2026-08-06, out of order** — pulled forward by the Goal-1
> FBD workstream as its step 3 (`getContactForces()`, `types.ts:97`, both
> engines). It also inverted its own gating premise: the spike measured ZERO
> jitter, so "only worth it if the analytical approach feels wrong" no longer
> decides it. See Findings 2026-08-06 and 2026-08-09 §A.

- For non-flat surfaces or stacks, read `postSolve` impulses (Planck) / `ContactForceEvent` (Rapier) and surface real friction/normal vectors.
- Only worth it if Phase 3's analytical approach feels wrong on a real demo.

### Closing phase (inherited 2026-07-04) — all-vectors polar-authoring sweep

Pinned here at the **vector-representation refactor's close-out** (Bill's
disposition; see `Notes_on_Vector_Representation_Refactor.md` Findings
2026-07-04). Vector-rep shipped polar authoring for `velocity` only
(`{magnitude, angle}` union, normalized at the config→SI seam in
`scaleObjectToSI`). Once `appliedForce` exists (Phase 1 here), the complete
2D-vector field set is known — so the LAST phase of this refactor sweeps the
polar-authoring union across **acceleration, gravity, and appliedForce** in one
mechanical pass: apply `Vector2DInputSchema` to each field, extend the seam
normalization, add prompt prose, regenerate the JSON schema. Rationale for
pinning: one sweep over the complete set beats piecemeal extension, and
`appliedForce.magnitude` / `.angle` slider projections already come free from
vector-rep Phase 1 the moment the field lands.

---

## Decisions deferred

1. **Force vs impulse semantics in the JSON.** ~~Lean: keep this.~~ **RATIFIED 2026-08-09 (Bill)** — Newtons at every surface a human or an LLM touches; one conversion line in `onUpdate`; the adapter speaks impulse. `J = F · FIXED_DT_SECONDS` (verified against the loop, NOT `substepDt` — that under-delivers 8×). Two properties earned free: both engines are natively impulse solvers, and the mass slider works by construction since mass never enters the conversion. See **Findings 2026-08-09 (Goal 2, item #3)** — which also records the one place the abstraction leaks (delivery is a frame-boundary kick, not a spread push, unlike gravity) and the revised Phase 1 acceptance test that measures it.
2. **Off-center forces (torque from a force).** PhET Basics doesn't need them — bodies are translation-only on flat ground. Defer `applyImpulseAtPoint` until a sim actually needs torque-from-force.
3. **`frictionStatic` field — alias or remove?** Done: **removed** from `BodyDef` + schema + prompt (2026-05-11). The principled `μs / μk` story will return as part of the opt-in `frictionDemo` mode (see the Static-friction demo section), not as a per-body field that's silently a no-op for ordinary sims.
4. **Camera follow / scrolling background.** Not a physics concern — separate UI work; flag for whoever owns the canvas/viewport code.
5. **Per-body `applyForce` (truly continuous) vs impulse-per-frame.** Stick with impulse. ~~Revisit only if a sim shows visible artifacts at 60 Hz.~~ **The artifact to watch for is now NAMED (2026-08-09): sub-breakaway creep.** A whole frame's impulse lands before substep 1, but substep 1's friction budget is only `µmg·dt_substep`, so for `µmg/8 < F < µmg` the body may creep when it should be dead still — ≈7 mm/s predicted on a 50 kg / µ=0.3 crate. Phase 1's revised acceptance test measures it directly against the `ramp-slide` 1% baseline. If it reproduces, the fix is the deferred per-substep `onPreStep(body, dt)` hook, earned empirically rather than pre-built. See Findings 2026-08-09 (Goal 2, item #3).

---

## Open questions for Duncan

1. **Slider range / units.** PhET uses ±100 N. We could match, or scale to mass (so a 2 kg body and a 50 kg body get comparable acceleration ranges). Lean: ±100 N fixed, since pedagogically the point is that *the same force produces different accelerations on different masses*.
2. **One applied force per body, or always an array?** Single-force is simpler for the LLM and covers Forces and Motion: Basics. Array is needed for tug-of-war (Net Force screen). Lean: ship single in Phase 2, add array in Phase 3.
3. **Should the applied-force slider snap to zero when released?** PhET's does — it's a self-centering slider. Worth replicating since "force is on / off" is a real teaching moment. Needs a small extension to the existing Slider variant.
4. **Drag the cart by hand?** PhET lets you click the cart and drag it directly (no force, just position). We'd lean on a Planck MouseJoint or a Rapier kinematic-body workaround. Out of scope for this refactor — flag for later.
5. **Static-friction demo `REST_EPSILON`.** Speed threshold below which the body is considered "at rest" for `frictionDemo` switching. Lean: 0.01 m/s, but worth tuning on the ramp-tilt sim once it exists. Too low → false slips on numerical jitter; too high → body "snaps" to rest mid-glide.
6. **Should `frictionDemo` live on the body, the surface (ground/ramp), or both?** Real friction is a contact-pair property. Per-body is simplest for Phase 2.5; if a sim has multiple surfaces with different μs/μk pairs, we'd need per-surface or per-contact later. Lean: per-body for now, revisit if a sim shows the limitation.

---

## Out of scope

- Changes to Matter (deprioritized — leave as a no-op `applyImpulse`).
- General `μs ≠ μk` static friction across all bodies (covered in narrow form by Phase 2.5's opt-in `frictionDemo` only — *not* a general system-wide upgrade).
- Engine-read contact forces (Phase 4+).
- 3D forces or rotational applied torques in the schema (PhET Basics is 2D translational only).
- Camera follow / viewport work.

---

## Findings — 2026-07-07: arrow scales are SI-anchored (diorama-invariance violation under non-meter units)

**Symptom.** In a sim authored with `unit: "cm"`, vector arrows render ~100×
shorter than the same diorama authored in meters — a 10 cm/s velocity is
0.1 m/s SI, and arrow length is SI magnitude × a fixed px-per-SI-unit scale.
Found while driving the m→cm unit flip that ratified the "preservation" unit
semantics (see `parking_lot.md` → "Saved sims bypass schema validation"
entry, UPDATE 2026-07-07 — that entry owns the unit semantics and the
ingestion-boundary/one-source-of-truth story; cross-link, don't duplicate it
here).

**Cause.** `VECTOR_DEFAULT_SCALES`
(`src/components/simulation_components/renderables/vectorTheme.ts:60-68`)
is denominated in px per SI unit (20 px per m/s, 10 px per m/s², 2 px per N),
and the per-arrow `pixelsPerUnit` override is likewise documented
"pixels-per-SI-unit" (`src/schemas/simulation.ts:67`). Every other render
path is diorama-anchored (config value × `pixelsPerUnit`, so `unitScale`
cancels); arrows are the one visual whose size depends on the *unit chosen
to describe* the scene rather than the scene itself. Benign today because
every existing sim is meter-authored (factor = 1) — same works-by-accident
genre as the sprite-dimension bug fixed the same day.

**Direction (agreed 2026-07-07, NO dev yet).** Arrow scales should be
diorama-anchored: px per *config unit* (÷ `unitScale` at draw or synthesis),
so the picture is invariant under choice of description. Natural home is the
existing Phase 5 (auto-scale calibration) or a small precursor to it.
Three-places note: landing this moves the schema `.describe()` on the
per-arrow `pixelsPerUnit` override, the prompt prose, and the scale table on
the `/docs/vector-arrows` page **together** — until then the SI-anchored
behavior is the documented reality, deliberately not landed. Force kinds
(px per N) need their own think: Newtons don't rescale with the length unit,
so "diorama-anchored" for force arrows isn't a simple ÷`unitScale` — resolve
when Phase 3 force arrows land.

---

## Goal 1 — Free-Body Diagrams workstream (opened 2026-07-19)

Bill is re-opening force-vector work with two goals, FBD first:

1. **High-quality free-body diagrams during simulations** — break out separate
   force arrows for **air resistance, friction, normal force, and gravity**
   (plus applied + net as they land). This is the entry point.
2. **High-quality applied-force sims in 1D** — start small, on top of the
   applied-force pipeline this note already specs (Phase 1–3 above).

A **seam diagnostics bus** (scoped 2026-07-19, `Notes_on_Concave_Colliders_Refactor.md`;
`GIST_Physics_System_Topics.md:357`) is a named prerequisite Bill flagged for the
"extensive testing" both goals need — see the plan below.

This workstream inherits the shared `VectorArrow` renderable and the 7-kind
`vectorTheme.ts` vocabulary that the vector-representation refactor transferred
here at its 2026-07-04 close-out.

### Current-state R/Y/G readiness (audited 2026-07-19)

The fault line is clean: the **vocabulary + render machinery are built**, two of
the four FBD forces are **data-ready today**, and **normal + friction have no
data source at all**.

| System | Light | State (cite) |
|---|---|---|
| Vector-arrow render pipeline (geometry/scale/label/plumbing) | 🟢 | Built; proven by velocity/accel/net end-to-end. `VectorArrow.ts`, `synthesize.ts:150`. |
| Kind vocabulary / theme | 🟢 | All 7 kinds incl. `force-gravity/friction/drag` (`vectorTheme.ts:15-23`). **Gap: no `normal` kind** — ~4-line add across the `Record` maps. |
| `force-net` arrow | 🟢 | Live: `m·derivedAcceleration` (`VectorArrow.ts:53-56`). |
| Gravity arrow | 🟢 | Data on hand — `m·g`; `g` already threaded to renderers via `DrawContext.gravity` (`renderables/types.ts:169-170`, `RenderLayer.tsx:136`). Only the draw path + double-count policy needed. |
| Drag / air-resistance arrow | 🟢 | *Already vectorized* every frame: `userData.dragForce = −k·|v|·v` (`JsonSimulation.tsx:666`). Renderer early-returns before reading it (`VectorArrow.ts:57-60`) — a ~3-line un-stub. Only populated in quadratic air mode. |
| "Show force vectors" debug toggle | 🟢 | Debug panel extensible; follows the shipped air-resistance-toggle pattern. |
| FBD closure semantics (components sum to net?) | 🟡 | **Design gate.** `force-net` is *measured* (`m·a`); components would be *analytical* or *engine-read*. They must visibly close onto net or the FBD teaches the wrong thing. Gravity is deliberately excluded from net today to avoid double-count (`VectorArrow.ts:23-29`). |
| Force-arrow legibility / scale | 🟡 | Force scales are SI-anchored px-per-N (2 px/N) with a 14 px min-length floor. A 1.5 N friction = 3 px → *suppressed*. Needs per-diorama auto-scale (ties to the 2026-07-07 SI-anchored-scale finding above). |
| Schema + prompt (three-places) | 🟡 | `showVectors` already accepts the force kinds; `normal` kind + prompt + docs are the three-places move. Deferrable (debug-first pattern). |
| Diagnostic bus (testing substrate) | 🟡 | Not built, but fully scoped + shovel-ready (`reportDiagnostic()` singleton + amber dev-gated badge). Producers exist as scattered `console.warn`. |
| **Normal force data** | 🔴 | **No source.** No contact-impulse read in either adapter. |
| **Friction force data** | 🔴 | **No source.** `BodyDef.friction` is a create-time scalar, never read back; analytically blocked on N. |
| **Contact / grounded-state substrate** | 🔴 | **The crux gate.** Neither adapter surfaces contacts as forces — only friction-*combine* hooks (`PlanckAdapter.ts:211-214`). No `applyImpulse`/`setFriction` either. |

Decision (Bill, 2026-07-19): pursue **engine contact forces (Path B)** for the
red gate, with expansive brainstorming — external research on game engines + how
top-tier education systems (PhET etc.) do FBDs. Both captured below.

### Engine contact-force readback — grounded API surface (Path B)

Verified against the exact in-repo versions: `@dimforge/rapier2d-compat@0.19.x`
and `planck@1.4.x`. Both step loops are minimal insertion points
(`RapierAdapter.ts:392`, `PlanckAdapter.ts:325`).

**Rapier 0.19 — read contact pairs directly (no event queue).** After
`world.step()`, walk the collider's live manifolds:
- `world.contactPairsWith(collider, other => …)` then
  `world.contactPair(a, b, (m: TempContactManifold, flipped) => …)`.
- Per point `i`: `m.contactImpulse(i)` = **normal** impulse (≥0),
  `m.contactTangentImpulse(i)` = **friction** impulse (signed, single tangent in
  2D — NOT the `X`/`Y` 3D variants). `m.normal()` is world-space, collider1→collider2;
  `flipped` orients it onto your body.
- **`force = impulse / world.timestep`** (accumulated over the whole step across
  solver iterations — divide by the full `dt`, NOT a sub-iteration/CCD count).
- `TempContactManifold` is a transient view — copy numbers out inside the
  callback; use `target?` out-params to cut wasm-boundary GC. Watch sleeping
  bodies (`body.isSleeping()` flattens impulses). Reserve
  `EventQueue.drainContactForceEvents` (threshold-gated, `totalForce`/`maxForce*`,
  no normal/tangent split) for **collision-spike detection** only.

**Planck 1.4 — `post-solve` callback.** Register once in the adapter constructor
(alongside the existing `begin-contact` friction hook, `PlanckAdapter.ts:211`):
- `world.on('post-solve', (contact, impulse: ContactImpulse) => …)`.
- `impulse.normalImpulses` / `impulse.tangentImpulses` — `number[]` per contact
  point (allocates per call; read once). Sum across points.
- `contact.getWorldManifold(wm)` → `wm.normal` (unit, A→B); tangent =
  `(n.y, −n.x)`. **`force = impulse / dt`.** Fires **mid-step, per contact,
  possibly multiple per body** → buffer into a per-body map, clear before
  `world.step()`, read after. Sign via Newton's 3rd law (force on B = `+n·nSum/dt`,
  on A = `−`); attribute only to dynamic bodies. Coexists cleanly with the
  `begin-contact` Max-combine hook (different event; the Max override actually
  makes reported tangent impulses match GIST's Rapier-parity friction).

**Adapter seam.** Expose a normalized `{ normalForce: Vec2, frictionForce: Vec2 }`
per body per frame so the FBD renderer stays engine-agnostic (invariant #4).
Rapier gives impulses via manifolds (divide by dt); Planck gives impulses via
post-solve (divide by dt) — the seam hides both.

### The pedagogy tension — analytical display vs engine readback

External research (PhET, myPhysicsLab, Physics Classroom, oPhysics, Algodoo,
Physion + PER on FBDs) surfaced a finding that **complicates the Path-B choice
and must be recorded**:

- **The best FBD *pedagogy* is overwhelmingly analytical-display.** PhET runs
  **no general rigid-body engine** — each sim is a hand-authored closed-form
  Newton's-law model (per-sim `doc/model.md`; Scenery is draw-only). Friction has
  an explicit static/kinetic branch; net = clean signed sum. Physics Classroom,
  oPhysics, Physlets: same analytical camp. They are the quality bar we target.
- **Engine-readback tools trade FBD cleanliness for sandbox generality.**
  myPhysicsLab draws its solver's *actual* forces (`SHOW_FORCES`) — but gets
  clean contact arrows only because it solves a proper **LCP** for static contact
  forces, not impulses. Algodoo/Physion/Interactive Physics read engine forces
  and inherit the jitter.
- **Why impulse-engine readback fights the FBD promise.** Impulse solvers
  (Rapier, Box2D/Planck) produce contact normal/friction values that **jitter
  frame-to-frame** at resting contacts and are recovered as `J/dt` — so component
  arrows **shimmer** and **do not cleanly sum to a stable net**. The core FBD
  teaching promise ("component arrows close head-to-tail onto the net; equilibrium
  = exact cancellation") is exactly what impulse readback cannot guarantee without
  heavy smoothing.

**Synthesis / recommended architecture (reframes Path B, does not discard it).**
Both representations have a home, and building the engine path *first* serves the
testing goal:

1. **Analytical display model = the clean student FBD** (default). Gravity `m·g`,
   normal (balancing component on the known surface / `m·g·cosθ` on an incline),
   friction `µN` with a static/kinetic branch, drag from the *same* quadratic
   formula already on `userData.dragForce`, applied from the (coming) applied-force
   field, net = exact vector sum. Stable, closes by construction, full control of
   labels/scaling/decomposition. Lives above the adapter (invariants #4/#5) — the
   same altitude as the collider-observation overlay vs. taught representation
   split we already run.
2. **Engine contact-force readback = the ground-truth instrument** (Path B). Its
   natural roles: (a) an opt-in **"engine-actual forces" debug overlay** (raw/
   noisy, clearly labeled — mirrors `?colliders=1`), and (b) the **validator** the
   diagnostic bus checks the analytical model against (analytical N vs engine N
   should agree within tolerance on flat ground; a divergence is a bus diagnostic).
   This is precisely the "extensive testing" substrate Bill flagged.

The reframe: Path B is still built — it's the correct engine-truth/verification
layer and the thing that makes the analytical model *trustworthy* — but the
representation students see is analytical, matching the PhET-quality bar.

**This is the one open decision that changes the build** (Bill's call): is the
primary FBD representation **(A) analytical-display** (research recommendation) or
**(B) engine-readback-primary** (his initial pick)? The plan below is written for
the hybrid; the sequencing is nearly identical either way (engine readback is
built early regardless), so this can be resolved after step 2.

> **DISPOSITION (Bill, 2026-07-19): DEFERRED — decide after a spike.** Build the
> diagnostic bus + engine contact-force seam first (steps 1 + 3), drive a real
> sim with both representations, and judge jitter/closure empirically before
> committing the student-facing path. The spike is the decision trigger. This
> workstream is at **analysis-recorded** stage — R/Y/G audited, both engine APIs
> grounded, education research done, plan sequenced; **no build started this
> session** (Bill: "just the analysis for now").

### Other design gates (from the research)

- **Center-of-mass origin** for all arrows by default (makes the sum honest);
  contact-point placement is an advanced/torque mode.
- **Capped-linear scale + minimum-visible floor**, the *identical* scale on every
  arrow incl. net (or the sum won't visually close); consider per-scene
  auto-normalize to the largest force present. **Length-only** magnitude encoding
  (constant arrowhead/shaft width — area distorts perception).
- **Layered independent toggles** (PhET model): Show Forces / Values (numeric N) /
  Sum-of-Forces / Components (incline decomposition).
- **Incline**: normal ⟂ surface (not vertical); gravity decomposition into
  ramp-parallel/perpendicular as a *toggle* (PER: decomposition is a major novice
  error source — opt-in, axes rotated to the surface).
- **Static/kinetic**: pre-breakaway, friction drawn exactly equal-and-opposite so
  equilibrium reads as visible cancellation; kinetic magnitude + net arrow appear
  at breakaway. (Dovetails with the `frictionDemo` Phase 2.5 mode above.)
- Add a **`normal` kind** to `vectorTheme.ts` (currently absent).

### Sequenced plan

1. **Build the diagnostic bus first** (🟡→🟢). Shovel-ready, producers already
   exist, and it's the instrument both goals are tested with. Low-risk warm-up.
2. **Un-stub gravity + drag arrows + a "Show force vectors" toggle** (🟢).
   Immediate visible FBD progress; exercises the render path; forces the
   legibility-scale and net-closure decisions into the open on real sims.
3. **Build the engine contact-force adapter seam** (Path B) — Rapier manifold
   reads + Planck post-solve → normalized `{normalForce, frictionForce}` per body.
   Wire it as the engine-actual overlay AND feed the bus validator.
4. **Resolve the primary-representation decision** (analytical-display vs
   engine-primary) with steps 2–3 in hand.
5. **Land the analytical normal + friction** (with the `normal` kind), validated
   against step 3's engine truth. Incline decomposition + static/kinetic as
   follow-on toggles.
6. **Three-places** for FBD authoring (schema `normal` kind + prompt + docs) once
   the debug-first phase proves out.

### Sources (Goal-1 research, 2026-07-19)

- Rapier: [rapier.js narrow_phase.ts](https://raw.githubusercontent.com/dimforge/rapier.js/master/src.ts/geometry/narrow_phase.ts) · [event_queue.ts](https://raw.githubusercontent.com/dimforge/rapier.js/master/src.ts/pipeline/event_queue.ts) · [Advanced collision detection (JS)](https://rapier.rs/docs/user_guides/javascript/advanced_collision_detection_js/)
- Planck/Box2D: [planck Solver.ts (ContactImpulse)](https://github.com/piqnt/planck.js/blob/master/src/dynamics/Solver.ts) · [Contact.ts](https://github.com/piqnt/planck.js/blob/master/src/dynamics/Contact.ts) · [iforce2d: impulse = force×dt](https://www.iforce2d.net/b2dtut/forces) · [Box2D jitter docs](https://box2d.org/documentation/md_simulation.html)
- Education: [PhET Forces and Motion: Basics](https://phet.colorado.edu/en/simulations/forces-and-motion-basics) · [phetsims repo](https://github.com/phetsims/forces-and-motion-basics) · [myPhysicsLab RigidBodySim SHOW_FORCES](https://www.myphysicslab.com/develop/docs/classes/lab_engine2D_RigidBodySim.RigidBodySim.html) · [myPhysicsLab contact forces (LCP)](https://www.myphysicslab.com/engine2D/contact-en.html) · [Physics Classroom FBD Interactive](https://www.physicsclassroom.com/Physics-Interactives/Newtons-Laws/Free-Body-Diagrams)
- PER: [Vector-representation difficulties](https://www.researchgate.net/publication/329882720) · [Why not to decompose forces](https://www.researchgate.net/publication/290476611) · [OpenStax 5.7 Drawing FBDs](https://courses.lumenlearning.com/suny-osuniversityphysics/chapter/5-7-drawing-free-body-diagrams/)

### Findings 2026-07-20 — sequenced-plan step 1 DONE: diagnostic bus shipped

Step 1 of the plan above (build the diagnostic bus, 🟡→🟢) shipped and was
drive-confirmed the next day — full ship record in
[Notes_on_Concave_Colliders_Refactor.md](Notes_on_Concave_Colliders_Refactor.md)
→ Findings 2026-07-20 (`src/lib/diagnosticsBus.ts`; `reportDiagnostic()` =
console.warn passthrough + keyed session store; amber badge on the debug
panel; two initial producers wired).

**Constraint the ship added for THIS workstream's future producer** (the
step-3 analytical-vs-engine force validator): the bus's ratified semantic is
**live config-state truth, never past events** — the store is cleared on
every config re-expansion and producers must re-derive from current state.
The force-delta validator fits (a divergence IS live state while the sim
runs), but it will fire per-frame: the bus dedupes by key and coalesces
notifications, yet the console.warn passthrough is NOT rate-limited — the
validator needs its own thresholding/throttling (e.g. report once per
body+run via key design, or gate on tolerance-exceeded transitions), decided
when step 3 builds.

Next up per the plan: step 2 — un-stub gravity + drag arrows + a "Show force
vectors" debug toggle.

### Findings 2026-07-22 — vector component decomposition SHIPPED (Path B); remix-router gap found + fixed

New capability on the vector-arrows renderable: **component decomposition**. A
`showVectors` full-config entry with `components: true` draws a vector as its two
axis-aligned legs (vₓ / v_y) instead of the single resultant. Requested for
projectile motion — seeing constant vₓ and ramping v_y during flight.

**Approach chosen — Path B (a `components` modifier), NOT Path A (new per-kind
enum members like `velocity-x`).** Path A would multiply `VECTOR_KINDS` (and
every `Record<VectorKind, …>` map) by every kind we'd ever decompose; Path B is
one boolean that generalizes across all kinds and matches how the decomposition
is actually taught. Bill picked the display style: **both legs from the body**
(PhET "show components" style), resultant composed by ALSO listing the plain
kind — `["velocity", { "kind": "velocity", "components": true }]` — not
tip-to-tail, not auto-drawn-with-resultant.

**Three-places — all landed:**
1. Schema: `components?: boolean` on `VectorArrowConfigSchema`
   ([simulation.ts:67](src/schemas/simulation.ts#L67)); JSON schema regenerated.
2. Prompt: §5 of `objects_fill_fragment` in `gist_instructions.py` +
   `router_fragment` fix (below); generate + remix redeployed 2026-07-22.
3. Design doc: `/docs/vector-arrows` (`VectorArrows.tsx`) — new "Velocity
   components" test scene, Schema-additions prose, Geometry-conventions dash +
   anchor bullets. This note = the dated record.

**Implementation touchpoints.** `synthesize.ts` fans a `components: true` entry
into two visuals carrying an internal `axis: 'x' | 'y'` discriminator (schema-
invisible); `VectorArrow.ts` zeroes the off-axis component, dashes the shaft, and
derives the subscript from the kind's default label (v → vₓ/v_y; F_net →
F_net,x/,y); `types.ts` carries `axis`. Dash pattern is theme-owned:
`VECTOR_GEOMETRY.componentDash = [7, 5]` in `vectorTheme.ts` (one knob).
Local exhibit route: `/simulation/projectile-velocity-components`.

**Rotated-basis door LEFT OPEN (deferred, not built).** Bare-boolean schema is
additively forward-compatible; the internal `axis: 'x' | 'y'` generalizes to
`'parallel' | 'perp'` + a basis angle (leg directions become
(cosθ,sinθ)/(−sinθ,cosθ) dot-products; axis-aligned = θ=0). The undecided fork —
whether the incline basis lives **per-arrow** (`componentAxisAngle`) or
**env-level** (a tilted global coordinate frame, DRY across a whole incline
scene; current lean) — is parked in `parking_lot.md` ("Rotated coordinate basis
for component decomposition", 2026-07-22).

**Remix-router gap (found via a live remix that failed, then fixed).** Bill's
remix "I see the components but also need to see the full velocity vector" did
NOT add the resultant. Root cause was upstream of the objects stage: the remix
**router** (`router_fragment`, consumed by `sim_pipeline_remix/router.py`)
described the "objects" slice as physics/geometry only and had no notion of
`showVectors`, so a display-only arrow edit routed to no slice (or toward
graphs/outputs, where velocity is *plotted*) and the objects stage — the only one
that can touch `showVectors` — never ran. Two prompt fixes: (a) the router now
explicitly routes vector-arrow edits ("show/hide/add an arrow, show components,
also show the full/whole/resultant vector") to **objects**; (b) §5 adds a
terminology bridge — "full/whole/total velocity vector" = the plain `"velocity"`
resultant entry; when a sim shows only components and the user wants the
resultant too, APPEND the plain kind and KEEP the components entry. Both apps
share `gist_instructions.py`; both redeployed; **remix acceptance re-run
CONFIRMED working**. General lesson for this workstream: the remix router's slice
descriptions must enumerate *display-only* object fields, not just physics — the
FBD "Show force vectors" toggle (sequenced-plan step 2) will hit the exact same
router seam.

**Tie-in to Goal-1 (FBD).** Component decomposition is the same rendering
primitive the force-vector display will want (decomposing weight along/perpendic-
ular to an incline). Shipping it now means step 5's "incline decomposition"
follow-on reuses this axis-lock machinery rather than reinventing it — and it's
the concrete first customer for the rotated-basis work when that lands.

### Findings 2026-07-24 — sequenced-plan step 2 SHIPPED: gravity + drag arrows, "Show force vectors" toggle, freefall-with-drag exhibit (+ a replay-restore fix)

Step 2 of the Goal-1 sequenced plan (un-stub the two data-ready force kinds +
a debug toggle) is built and drive-confirmed. This is the first *visible* FBD
progress. **Debug-first and deliberately NOT three-places-landed** (that's step
6) — see the three-places status below.

**2a — un-stubbed `force-gravity` + `force-drag`**
([VectorArrow.ts:53-80](src/components/simulation_components/renderables/visuals/VectorArrow.ts#L53-L80)).
The audited ~3-line un-stubs, exactly as the R/Y/G predicted:
- `force-gravity` = `body.mass · drawCtx.gravity`. `DrawContext.gravity` is the
  SI Y-up vector `{x:0, y:−g}` (fed from `JsonSimulation.tsx:221`
  `gravityVec`), so it already points down — no sign handling needed.
- `force-drag` = `body.userData.dragForce`, the `−k·|v|·v` already vectorized
  each frame at [JsonSimulation.tsx:700](src/components/JsonSimulation.tsx#L700).
  Non-zero only in quadratic air-resistance mode; `{0,0}` (→ suppressed by the
  min-length floor) otherwise.
- `force-applied` / `force-friction` still early-return — they await the engine
  contact-force seam (step 3). No adapter changes; stayed above the boundary
  (#4/#5).

**2b — "Show force vectors" debug toggle / `?forces=1`.** New
`synthesizeForceDebugRenderables`
([synthesize.ts](src/components/simulation_components/renderables/synthesize.ts))
draws `[force-gravity, force-drag, force-net]` on every DYNAMIC body regardless
of authored `showVectors` — a debug instrument mirroring the collider overlay
exactly (`showColliders` pattern: `FORCE_DEBUG_INITIAL` const, session-local
`showForces` state, debug-panel checkbox, `?forces=1` URL preset). Static bodies
get nothing. Wired through `AdvancedDebugPanel` with the same prop shape as
`showColliders`.

**2c — the exhibit.** `src/simulations/freefallWithDrag.json` + wrapper + route
`/simulation/freefall-with-drag`. Mass-5 baseball, `Cd 0.8`, `referenceArea 0.5`,
air resistance on → terminal ≈ 14 m/s. Authors the three force arrows directly
(so the FBD shows on load); a `velocity.y` slider launches it downward *faster*
than terminal, flipping net upward (drag > gravity). Drive-confirmed by Bill:
gravity constant, net → 0, velocity converges to terminal. **The closure
property held** — because gravity + drag are the only forces, the two component
arrows sum exactly onto net (`m·a = m·g + F_drag`); the 🟡 closure gate does not
bite until contact forces enter (step 5). Confirms the deferral is sound.

**Bug found + fixed on the drive — `force-drag` invisible in REPLAY (a
frame-capture gap, not a compute bug).** Bill saw gravity/net/terminal-velocity
but no drag arrow. Root cause: `dragForce` lives on `body.userData`, which the
engine doesn't restore; the precompute→replay loop rebuilds each frame from a
recorded `FrameBodySnap`, which carried `ax/ay` (so acceleration + net animate
in replay) but **not** drag. So replay read a stale/zero `userData.dragForce` →
suppressed. Fix = the identical pattern acceleration already uses: added
`dragFx/dragFy` to `FrameBodySnap`
([JsonSimulation.tsx:126-134](src/components/JsonSimulation.tsx#L126-L134)),
captured at frame-record time
([~788](src/components/JsonSimulation.tsx#L788)), restored in
`handleReplayFrame` alongside `derivedAcceleration`
([~467](src/components/JsonSimulation.tsx#L467)). In-memory frames only — no
serialization/schema surface touched. **General lesson for this workstream:**
any future `userData`-sourced force arrow (`appliedForce`, `frictionForce`,
`normalForce` from step 3) MUST ride along in the Frame or it will be invisible
in replay — the engine restores engine state, not userData. This is a standing
gotcha for steps 3 + 5.

**Three-places status (deliberately partial — debug-first).**
- **Schema** ✅ — `force-gravity`/`force-drag` already enumerated in the
  `showVectors` describe string; no change needed.
- **Prompt** 🔴 *by design* — [gist_instructions.py:141](modal_functions/gist_instructions.py#L141)
  still lumps all four force kinds as "Phase 3 … don't author those kinds yet."
  Now inaccurate for gravity/drag (their sources HAVE landed), but **holding the
  prompt is the correct debug-first call**: promoting them to LLM authoring is
  step 6, gated behind the step-4 primary-representation decision. **Open
  decision for Bill:** promote `force-gravity` + `force-drag` to LLM-authorable
  now (split them out of the Phase-3 "don't author" line), or hold to step 6?
  Recommendation: hold — but the doc third-place below must not claim they're
  unwired.
- **Design docs** ✅ (reconciled this session) — fixed the now-false line in the
  new `/docs/authoring-json` page (gravity/drag render today; only applied/
  friction await the seam). `/docs/vector-arrows` already carries force-drag +
  force-gravity demo scenes and their sources.

**Step-2d observations (the gates step 2 was meant to surface).**
1. **Legibility scale** — NOT stressed by this sim: forces here are ~49 N →
   ~98 px at the SI-anchored 2 px/N, so they read large. The small-force
   suppression problem (a 1.5 N friction → 3 px) waits for friction (step 5);
   the per-diorama auto-scale decision can wait with it.
2. **Color separation** — `force-drag` (blue-grey `#455a64`) and `force-gravity`
   (navy `#34495e`) are close in hue when both point vertically. Minor theme
   legibility note, not blocking; revisit when the full force palette is on one
   body.

**Where step 2 leaves the plan:** (1) ✅ diagnostic bus; (2) ✅ gravity+drag
arrows + toggle + exhibit **[this entry]**; (3) NEXT — engine contact-force
adapter seam (Rapier manifolds / Planck post-solve → normalized
`{normalForce, frictionForce}`), feeding both the engine-actual overlay and the
bus validator; (4) resolve primary-representation after the step-3 spike;
(5) analytical normal + friction + the `normal` kind; (6) three-places for FBD
authoring (incl. the prompt decision parked above).

### Findings 2026-08-06 — sequenced-plan step 3 SHIPPED: engine contact-force seam (both engines), force-normal kind, overlay arrows — and the jitter question got an empirical answer

Step 3 of the Goal-1 plan is built and headless-verified on both engines.
The step-4 representation spike now has its data — and the data surprised
us (below).

**3a — the adapter seam** (`getContactForces(): { normal, friction }` on
`PhysicsBody`, [types.ts](src/physics/types.ts)). Per-body summed contact
forces recovered from the most recent step's solver impulses (F = J/dt over
the full step dt), exactly per the 2026-07-19 grounded-API research:
- **Rapier** ([RapierAdapter.ts](src/physics/rapier/RapierAdapter.ts)):
  lazy manifold walk after step — `contactPairsWith` →
  `contactPair(m, flipped)` → per-point `contactImpulse` /
  `contactTangentImpulse`; manifold normal is collider1→collider2, so force
  on us is −n·J when we're collider1 (+ when flipped).
- **Planck** ([PlanckAdapter.ts](src/physics/planck/PlanckAdapter.ts)):
  `post-solve` buffering into a per-body map, cleared at the top of every
  `step()`; force on B = +(Jn·n + Jt·t)/dt, on A the negative, dynamic
  bodies only. Coexists with the begin-contact Max-friction hook (different
  event) — and because that hook aligns contact µ with Rapier's Max rule,
  the reported tangent impulses match GIST's cross-engine friction
  semantics.

**Two engine quirks found + fixed by the harness (this is why we build the
instrument first):**
1. **Rapier's impulse readback overshoots by (i+1)/i** where i =
   `numSolverIterations`. Its TGS-soft solver runs one extra stabilization
   iteration beyond the configured count and `contactImpulse()` accumulates
   across all of them. Probe measured N/(m·g) = 2.0, 1.5, 1.25, 1.125,
   1.0625 for i = 1, 2, 4, 8, 16 — exactly (i+1)/i, so the adapter corrects
   by i/(i+1), reading i live from `integrationParameters` so the
   debug-panel solver-iterations knob stays consistent.
2. **Rapier's 2D tangent convention is opposite Box2D's** cross(n, 1):
   first run showed friction pointing down-slope. Fixed to t = (−n.y, n.x)
   for Rapier only; verified on BOTH ramp orientations (high-left slides +x,
   high-right slides −x) on both engines so the sign isn't a
   one-orientation coincidence.

**3b — render side.** `force-normal` added to `vectorTheme.ts` (teal
#00897b, F_N, 2 px/N) — VECTOR_KINDS feeds the Zod enum, so the generated
schema grew mechanically (regenerated per invariant #1); the prompt's
"don't author force kinds" line already covers it, same posture as
force-applied. VectorArrow wires `force-normal`/`force-friction` from
`userData.normalForce`/`frictionForce`; JsonSimulation stashes the readback
every frame in handleUpdate, and the values RIDE THE FRAME
(`normalFx/normalFy/fricFx/fricFy` on FrameBodySnap, captured + restored) —
the step-2 dragForce replay lesson applied proactively. The `?forces=1`
overlay now draws all five: gravity, drag, normal, friction, net. Only
`force-applied` remains unwired.

**3c — THE SPIKE FINDING: zero jitter in the canonical teaching
scenarios.** The 2026-07-19 research predicted impulse-solver readback
would "shimmer and not cleanly sum to a stable net." Empirically, on BOTH
engines at 1/60: resting box N = 19.600 N exact (std 0.0000 over the awake
window); 30° ramp slide N = 16.974 = mg·cosθ exact, |Ff| = 4.244 = µN
exact, friction up-slope, and closure m·a = m·g + N + Ff with residual
(0.000, 0.000). The feared jitter did not materialize for single-contact
box-on-plane scenarios — the readback is textbook-clean where the FBD
curriculum lives (S0.1 territory). The caveat that DID materialize:
**sleep flattening** — Planck put the resting box to sleep at t ≈ 0.6 s
and the readback drops to zero (Rapier's threshold is laxer; it stayed
awake 4 s). A block that slides to a stop mid-lesson LOSES its N and
friction arrows — and the static-friction regime (tilt-until-slip below
breakaway) is exactly where sleep hits. Options recorded for step 4:
per-body sleep disable when force display is on (both engines expose it),
or the analytical layer covers rest. Multi-contact stacks and
high-restitution scenes remain unprofiled — the zero-jitter claim is
scoped to what the harness drove.

**Where this leaves the plan:** (1) ✅ bus; (2) ✅ gravity+drag; (3) ✅
engine contact-force seam **[this entry]**; (4) **NOW UNBLOCKED — Bill's
representation drive**: `/simulation/ramp-slide?simdebug=1&forces=1` shows
the full 5-arrow engine-read FBD on the tilt-until-slip demo (both
engines); judge closure/stability/legibility live. The zero-jitter finding
weakens the case AGAINST engine-primary, but sleep flattening + the
unprofiled multi-contact regime keep the hybrid recommendation alive.
(5) analytical normal + friction, informed by 4; (6) three-places. The
bus-validator half of step 3 (analytical-vs-engine force-delta diagnostic)
is DEFERRED to step 5 by construction — there is no analytical model to
compare against until step 5 exists, and the runtime-event-vs-config-truth
semantic question (bus reports live config state, forces are runtime
events) goes with it.

**Harness:** scratchpad `contactForcesHarness.ts` (rest + ramp + mirrored
ramp × both engines, 17 checks + jitter/sleep telemetry) — ALL GREEN.
Build + tsc + lint at baseline. Legibility note for the drive: at 2 px/N a
19.6 N normal is ~39 px — fine; the resting-equilibrium N vs gravity
overlap (equal/opposite arrows from body center) may want the
center-of-mass-origin / offset design gate from the research.

### Findings 2026-08-06 (step-4 drive, round 1) — floor-suppressed F_net near breakaway taught the wrong thing; sub-floor force stub SHIPPED (Bill-ratified); numeric-values toggle OPEN

Bill's first step-4 drive (ramp-slide, his tweak: mass 5, ice_block sprite)
surfaced the display-floor pedagogy bug immediately: at 26° — above the
21.8° breakaway, block visibly creeping and accelerating — **no F_net arrow**.
F_net = mg(sinθ − µcosθ) = 3.9 N → 7.7 px at the default 2 px/N, under the
14 px `minPixelLength` floor → suppressed entirely, while at 40° (16.5 N →
33 px) it showed. Engine readback verified EXACT at both angles (probe:
N/Ff/net match analytical to 3 decimals from frame 2). So: display-layer
only. En route, a wrong turn worth recording: from the first screenshots I
inferred per-arrow custom scales (F_N eyeballed longer than F_g, which would
be impossible — N = mg·cosθ); Bill's zoomed screenshots + the mass-5 numbers
showed everything is the stock 2 px/N overlay and the ratios (0.90/0.77) are
correct — RETRACTED. Lesson: compute the expected pixel table from the
actual sim params before reading screenshot geometry.

**The pedagogy call (Bill, ratified):** "we DEFINITELY want to not teach
something wrong where the box slides and accelerates without a visible
F_net." Near breakaway this is structural, not a tuning issue — the net is
~8% of gravity, so NO honest shared scale can draw it legibly next to F_g;
and below breakaway F_net is exactly zero, making *stuck* and *creeping*
visually identical under plain floor suppression.

**Fix SHIPPED — sub-floor force stub**
([VectorArrow.ts](src/components/simulation_components/renderables/visuals/VectorArrow.ts),
constants in vectorTheme's VECTOR_GEOMETRY): a FORCE kind whose true arrow
length lands in (0.1 px, 14 px) draws a fixed 10 px dashed stub with a
HOLLOW (stroked) arrowhead, slightly faded, normal label — direction is
real (creep net points down-slope; that's the teachable part), open head +
tight dash signal "not to scale". At-or-under 0.1 px (solver rest-noise is
~1e-3 px; smallest teachable creep nets ~0.3 px) draws nothing — so
equilibrium stays blank and the stuck/creeping distinction is now visible.
Non-force kinds keep plain suppression (a still box's velocity arrow
vanishing is correct). Applies everywhere VectorArrow draws (overlay +
authored + replay — same code path). Tilt-until-slip progression at m=5:
blank ≤21.8° → stub 21.8°–29.7° → true-scale arrow above. Label resolution
factored into `resolveVectorLabel` (shared by both paths). Canvas-drawing
change → verification is Bill's re-drive, not headless; build/tsc/lint at
baseline.

**OPEN (Bill asked, answered, undecided): numeric values in the FBD** —
PhET-style toggleable magnitude readout rendered next to each arrow's label
("F_f 17.6 N"). Complements the stub (a stubbed F_net would read "3.9 N").
Await Bill's call; natural home is the force overlay first (debug-first),
per-visual `showValue` if it graduates to authoring. Per-diorama auto-scale
(identical scale on all force arrows, normalized to the largest present)
remains the queued deeper legibility fix — note it cannot rescue the
near-breakaway net (8% of F_g is invisible at any shared scale); the stub
is the honest answer there.

**Addendum, same evening — stub drive-CONFIRMED + dispositions.** Bill
re-drove: "the dashed stub looks GREAT." Sub-floor force stub is drive-
confirmed shipped. **Numeric-values toggle: HELD (Bill's call)** — stays
recorded here as the parked companion (would render "F_f 17.6 N" beside
each arrow label, PhET-style, toggleable; a stubbed F_net would carry its
true newtons); revisit when step 5's analytical layer or a values-hungry
exhibit pulls it. **Exhibit baked:** rampSlide.json block is now
`ice_block`, mass 5 (Bill's drive tweak made canonical — mass scales all
force arrows 5× at the fixed 2 px/N without touching breakaway or a, so
the default FBD reads well; authored velocity showVectors kept).

---

### Findings 2026-08-08 — the dynamic-range problem generalized; log arrows REJECTED, per-body scale REJECTED-as-silent, **force loupe SCOPED** (design views live in /docs/vector-arrows)

**How it surfaced.** `bowlingBallAndFeather` was re-authored to real values
(5 kg ball, 10 g feather) and migrated off legacy `showForceArrows` onto
`showVectors: ["force-gravity","force-drag","force-net"]`. Computing the
rendered lengths against the shipped thresholds showed the migration is
functionally inert on one body:

| body | F_g | F_drag | F_net |
|---|---|---|---|
| bowling ball (49 N) | 98 px | stub | 96 px |
| feather (0.098 N) | **0.20 px → stub** | **0.20 px → stub** | 0.20 px → **blank** |

So the ball reads perfectly — big weight, big net, drag correctly stubbed as
"present but negligible" — while the feather's ENTIRE diagram is two
identical fixed-length stubs plus a vanishing third. The sim's whole premise
(drag growing until it exactly cancels weight) is invisible. This is the
2026-08-06 near-breakaway finding again, one order of magnitude worse, and
now it is clearly **structural rather than scenario-specific**: any scene
with mixed masses has it. 49 N vs 0.098 N is a 500× spread.

**Idea 1 — logarithmic arrow lengths (Bill). REJECTED, and the rejection is
arithmetic, not taste.** log|A| + log|B| ≠ log|A+B|, so arrows stop closing
head-to-tail — and closure is the ratified design gate at "Other design
gates" above ("the *identical* scale on every arrow incl. net, **or the sum
won't visually close**"). Three further failures from the same root:
component decomposition breaks (log|v| does not decompose into log legs);
log(0) is undefined and F_net → 0 at terminal velocity is precisely the case
we are trying to show; and it needs an arbitrary reference F₀ that silently
sets every length. Audience objection on top: B18/B19 are the ages-10–13
front door and log scales are a late-secondary skill — a log arrow silently
asserts "these forces are comparable," the exact misreading at issue.
**Precedent check:** log-scaled arrows ARE standard in *field* visualization
(COMSOL offers normalized/logarithmic arrow length for vector fields) —
where arrows depict a pattern across space and never need to sum. No
instance found in FBD-style physics-education sims (PhET, Physics Classroom,
oPhysics, myPhysicsLab); their answer is layered toggles plus separate
autoscaled bar charts. Recorded honestly as "no precedent found," not
"proven absent" — PhET's published model docs do not document arrow scaling
at all. **Bill: "No log."** Settled; do not re-open.

**Idea 2 — silent per-body scale. REJECTED as undisclosed.** The arithmetic
is fine: **closure is a per-body property** (forces are only ever summed on
one body — nobody adds the feather's weight to the ball's), so a per-body
scale keeps every diagram internally valid and is standard textbook practice.
The objection is representational, and it is Bill's: *"I've had students who
are observant enough to question the resulting representation."* Two arrows
of equal length meaning wildly different forces, with nothing on screen
saying so, is a new silent lie replacing the one we removed. Note the sub-floor
stub's whole design premise is the opposite — the hollow head and tight dash
exist to ANNOUNCE "not to scale."

**Idea 3 — FORCE LOUPE (Bill). SCOPED.** A disclosed, local, per-body
rescale: an inset near a body whose forces are sub-threshold, showing that
body's FBD at a boosted px/N. It does not escape per-body scaling — **it
legitimises it**, by wrapping the rescale in a signifier that says "enlarged."
That directly answers Bill's own objection: the observant student still
notices, but now asks the right question and the answer is on screen.
Closure survives because the loupe's interior is exactly one body.

Design decisions taken:

1. **The body inside the loupe is a DOT — the particle model** (Bill's call,
   and the right one). A magnifying glass magnifies SPACE; we need to change
   FORCE scale. Those come apart badly: a 500× spatial zoom on a feather shows
   a few mm² of barrel with the arrows in the same proportion, because the
   problem was never spatial resolution. The dot is the actual FBD convention
   and the same reduction every textbook makes ("treat the object as a point
   mass"), so the absence of a spatial claim becomes explicit rather than
   hoped-for. A silhouette inside a lens promises magnification the loupe does
   not deliver — rendered as an explicit rejected-alternative card in /docs.
2. **A labelled scale bar, not a "×500" factor** — the micrograph/map
   convention. States the magnitude a fixed pixel length represents, in the
   units of the quantity. It is the honesty device.
3. **Gated on pause, live under SCRUB.** An FBD is inherently a single-instant
   object; textbook FBDs are always drawn at an instant, and drawing them
   continuously is a bonus GIST happens to offer. Playing = qualitative read
   (stubs: "a force is here, too small to draw"); paused = quantitative read.
   The stub becomes an invitation rather than a dead end. **Cost, and its
   fix:** the feather's lesson is DYNAMIC (drag growing to cancel weight is a
   process), so static snapshots lose it — therefore "live under scrub" is
   part of the definition, not an enhancement. Free from the frame cache
   (invariant #12: replay never drops frames), and arguably better than real
   time since at 1.6 m/s terminal the interesting part lasts ~0.3 s.
4. **Placement: selection-gated and anchored**, fixed pixel size, leader line,
   docking to a canvas corner near edges. Solves crowding, multi-body
   ambiguity and occlusion at once, and reuses the existing debug-tool
   selection affordance. Auto-appearing on every sub-threshold body is
   rejected as blooming — if ever automated, trigger on the body's LARGEST
   force arrow being under the floor (whole diagram illegible), not any one
   component.

**Design views SHIPPED to [/docs/vector-arrows](src/pages/docs/VectorArrows.tsx)** —
new "Force loupe" section with four React-rendered SVG scenes (the problem;
the particle-model proposal; the silhouette rejected-alternative; and
placement in a mixed-scale ball+feather scene), plus a reusable
`StubArrowDemo` — the docs page could not previously draw a stub at all,
since `VectorArrowDemo` returns null under `minPixelLength`. Per Bill, that
page is where vector look-and-feel gets worked out before it is built.

**Cost / sequencing.** Purely render-side (same altitude as the parked
vector-arrow decay item): no physics, no `Frame` schema change, no
three-places pass, so it can ship debug-first behind a flag as `?forces=1`
did. It does NOT depend on step 4's analytical-vs-engine call, since it
concerns scale legibility rather than where the numbers come from.

**Open questions** (full list in the docs section): circle vs rounded-rect
inset (the metaphor that aids recognition is the same one that implies
spatial zoom); overlap with the proposed autoscaled vector PANEL (cross-body
/quantitative/always-on) — both are defensible but shipping both without
naming one primary leaves a student two answers to "how big is this force";
whether the HELD numeric-values toggle is a cheaper stepping stone; what sets
the loupe's interior scale (normalise on open, then HOLD for the selection,
so scrubbing shows real growth rather than a rescaling illusion); and whether
two loupes may coexist (if so they should share one interior scale).

**Interim for the exhibit.** `bowlingBallAndFeather` still needs the feather
legible before the loupe exists. Options: per-arrow `pixelsPerUnit ≈ 1000` on
the feather's three entries with an honesty note in the description (the
per-body principle applied by hand), or leave the stubs and let the loupe fix
it properly. **Undecided — Bill's call.**

**Related but separate — Phase 5 refinement.** Phase 5 auto-scale is currently
scoped as per-KIND global normalize-to-largest. The closure analysis above
says **per-BODY** is the better unit for mixed-mass scenes, since closure is
per-body. Worth re-scoping Phase 5 accordingly when it is picked up; it also
clears the parked cm-sim arrow-shrink bug and the suppressed-friction-arrow
case.

### Findings 2026-08-08 — force loupe PROTOTYPE SHIPPED + drive-confirmed (supersedes the "SCOPED" status in the entry above)

**Status move: SCOPED → PROTOTYPE SHIPPED, same day.** The entry above scopes the
loupe; this records what was actually built and what the build decided. Roadmap
node `FBD4` added to [RefactorRoadmap.tsx](src/pages/docs/RefactorRoadmap.tsx).

**What shipped.**
[ForceLoupe.ts](src/components/simulation_components/renderables/visuals/ForceLoupe.ts)
— a new `force-loupe` PixelVisual, registered in the renderables registry and
synthesized per dynamic body (`synthesizeForceLoupeRenderable`,
[synthesize.ts](src/components/simulation_components/renderables/synthesize.ts)),
zIndex 40 (above the collider overlay). Gated by `showLoupe && !isRunning` in
JsonSimulation's `pixelRenderables` memo, with `?loupe=1` + a debug-panel
checkbox following the `?forces=1` pattern exactly.

**Three decisions the implementation forced (none were in the scoping entry).**

1. **It self-triggers on the whole-diagram rule, so v1 needs no selection.** The
   draw function returns early unless the body's LARGEST force arrow is under
   `minPixelLength` — the "whole diagram illegible, not merely one component"
   rule the scoping entry proposed only as a hypothetical if the loupe were ever
   automated. Adopting it *now* sidesteps a real blocker: `editModeActive =
   !isRunning && !pickingPosition && !simIsDirty`, and `handlePlay` sets
   `simIsDirty`, so **selection is impossible after a run until Reset** —
   *(`simIsDirty` was renamed `simAtInitialConditions` on 2026-08-09, polarity
   inverted; see Findings 2026-08-09 below. The gate itself is unchanged.)* — a
   selection-anchored v1 could not have been driven at all. Verified against the
   exhibit: ball 98 px → no loupe; feather 0.20 px → loupe.
2. **Interior scale normalizes to WEIGHT (m·g), not to the largest live force.**
   This answers the scoping entry's open question ("normalise on open, then
   HOLD"). Weight is constant for a body, so the scale is stable across the whole
   run with no state to hold — growth reads as growth rather than as rescaling.
   `scale = (radius · 0.7) / weight`; on the feather that is ≈443 px/N against
   the canvas's 2 px/N.
3. **Scale bar snaps near the WEIGHT, not to a fraction of the lens.** First
   implementation targeted ~1.1·radius and produced a 0.2 N bar — *longer than
   the largest arrow*, which reads as though the reference exceeds the thing
   measured. Snapping `niceValue(weight)` gives 0.1 N ≈ 44 px beside a 43 px
   weight arrow, so the bar reads as "that arrow is about 0.1 N."

**Drive round 1 (Bill, screenshot) — one real defect, fixed.** The body-id label
was anchored inside the lens at `ly − r + 12`; an up-pointing drag arrow at
terminal velocity puts its `F_ar` label at `ly − 53` against the id at `ly − 50`
— a guaranteed collision whenever drag approaches weight, i.e. exactly the
instant the sim exists to show. **Ruling: the lens interior is reserved for the
diagram; ALL metadata goes below it** (the figure/caption convention, matching
the docs page's own `SceneCard`). New stack: scale bar `+12`, value `+24`, body
id `+38` below the lens edge, with the placement clamp's bottom reserve raised
34 → 44 px so the id cannot clip when the loupe docks near the canvas bottom.
Arrow labels also pulled from 12 px to 10 px past the head, recovering room at
the rim where `F_g` was sitting tight. Bill re-drove: "Looks GREAT."

**Two behaviours the drive confirmed as designed, worth recording as intended.**
The feather's on-canvas arrows remain dashed hollow-headed sub-floor stubs at
true scale while the loupe carries the reading — *the canvas never rescales, the
loupe discloses*. And `F_net` is correctly ABSENT at terminal velocity (below the
1 px cutoff → nothing drawn), preserving the stub design's blank-means-zero
distinction. The vanishing net arrow is the lesson, and it survives the new
affordance intact.

**Three-places rule: DELIBERATELY untouched, and that is the landing state.** The
loupe is a debug-only render-side affordance — no schema field, no prompt prose,
not LLM-authorable — exactly like the collider overlay and `?forces=1`. Per
invariant #2 this is "not landed" *by design*, not an oversight. If it ever
graduates to authoring it needs all three places at once; until then the flag +
checkbox is the whole surface.

**Fallout for Phase 5.** The closure analysis behind the loupe (closure is a
**per-body** property — forces are only ever summed on one body) says Phase 5's
auto-scale should be re-scoped from per-KIND global normalize to **per-BODY**.
Noted on the roadmap node. Per-body also clears the parked cm-sim arrow-shrink
bug and the suppressed-friction-arrow case.

**Still open (unchanged by the prototype).** The step-4 primary-representation
call (analytical vs engine) — the loupe does not depend on it, since it concerns
scale legibility rather than provenance. Circle-vs-rounded-rect. Overlap with the
proposed vector/bar panel. The numeric-values toggle (still HELD). And the
interim question for `bowlingBallAndFeather`: the loupe now makes the feather
legible **while paused**, which may remove the need for a per-arrow
`pixelsPerUnit` override entirely — leaving the canvas honest at 2 px/N and the
loupe as the reading. **Lean: drop the override idea; the loupe superseded it.**

**Exhibit changes in the same session.** `bowlingBallAndFeather.json` migrated
off legacy `showForceArrows` → `showVectors: ["force-gravity","force-drag",
"force-net"]` on both bodies, and the feather gained an explicit
`referenceArea: 0.1` — its 90° rotation presents its long axis to the airflow,
but `effectiveA = referenceArea ?? width`
([ObjectRenderer.tsx:122](src/components/simulation_components/objects/ObjectRenderer.tsx))
is NOT rotation-aware, so the modelled frontal area disagreed with the picture.
Terminal velocity 2.58 → 1.63 m/s; the feather now lands 1.31 s against the
ball's 0.63 s (was 0.94 s), a better-separated demo. **Generalizable gotcha: the
drag reference-area default ignores body rotation — any rotated body wanting
honest drag must author `referenceArea` explicitly.**

### Findings 2026-08-09 — `simIsDirty` → `simAtInitialConditions`: naming the edit-mode gate that blocked selection-anchoring

**Why this is here and not in a maintenance log.** The loupe entry above records
`editModeActive` as the blocker that forced the loupe to self-trigger. Reading
that line back, Bill asked what its three booleans actually mean — specifically
whether `pickingPosition` and `simIsDirty` referred to the playback scrubber.
Neither does, and the fact that the question was reasonable is the finding.

**What the three gates are** (now documented at the declaration site in
[JsonSimulation.tsx](src/components/JsonSimulation.tsx)):

1. `!isRunning` — playback state.
2. `!pickingPosition` — **not a playback concept at all.** A transient canvas
   INPUT MODE owned by the experimental-data overlay: the user clicks "pick
   position" in `ExperimentalDataModal`, the modal hides, and the next canvas
   click is claimed as an origin coordinate (`handleCanvasClick` converts it and
   clears the flag immediately). The gate stops that one click from also
   selecting an object. Nothing in play/pause/scrub sets it.
3. body displacement — the renamed flag.

**The rename.** `simIsDirty` collided with `hasUnsavedChanges`, declared ~25
lines above it: two flags, adjacent, one word, two unrelated meanings — "dirty"
reads as *unsaved config edits*, but nothing here is unsaved. What is displaced
is the BODIES. Renamed to **`simAtInitialConditions`** with polarity inverted
(7 call sites; `useState(true)`), so the gate reads positively:
`!isRunning && !pickingPosition && simAtInitialConditions` — which states the
actual precondition for editing: *you may only move an object while it is where
the JSON put it.*

`simIsReset` was considered (Bill's proposal) and is the better half of the
change — it kills the collision either way. Rejected on one wrinkle: the initial
value must be `true`, so a flag named "is reset" would assert a reset that never
happened on first load or on navigation. **Reset is one of three ways INTO the
state, not the definition of it** (the others: initial mount, and the
`simulationId` effect on navigating to another sim). Naming the state rather
than its most common cause keeps the name honest in all four cases.

**Semantics worth stating once, because they are not guessable from the name
alone:** exactly one way out (pressing Play) and three ways in. **Pausing and
scrubbing do NOT restore it** — the bodies are still displaced, they just aren't
moving. This is the whole reason editing stays locked after a run until Reset,
and therefore the reason the loupe self-triggers.

Verification: `tsc` and `npm run lint` both at the known baseline (4
react-refresh context splits; `da.ts` locale typing). No behavior change — pure
rename plus comments; the truth table is identical.

---

### Findings 2026-08-09 — Goal 2 opened: plan drift reconciled, and the force-flow architecture RATIFIED

Bill re-opened the applied-force half of this note (Goal 2 — the 1D
applied-force sims, `BENCHMARK_SIMS.md` coverage-matrix **cell 7 / B5**, the
one cell marked 🔴 BLOCKED). Two products from the session: the plan above is
reconciled against what the Goal-1 FBD detour actually shipped, and the
question Bill raised about double-counting got a ratified architectural
answer.

#### A. Plan drift — three claims above are stale, all in our favor

The plan (lines 1–310) was written in May 2026 and predates the entire
Goal-1 workstream. Corrections, recorded rather than edited away:

1. **"`setFriction` needs adding to `PhysicsBody`" (Phase 2.5, §Adapter
   additions) — ALREADY LANDED.** It exists as a live `friction` property
   setter: `src/physics/types.ts:76`, wired at
   `RapierAdapter.ts:262` (per-collider) and `PlanckAdapter.ts:191`
   (per-fixture, with the contact-reset the note correctly anticipated).
   Phase 2.5's adapter work is done; only the `frictionDemo` schema field and
   the sticky-`isSliding` switching remain.
2. **Phase 4 ("engine-read contact forces — only worth it if Phase 3's
   analytical approach feels wrong") — SHIPPED EARLY, and it inverted its own
   premise.** `getContactForces()` landed 2026-08-06 (`types.ts:97`) and the
   spike measured ZERO jitter in canonical scenarios. So the Phase 2/3
   instruction to draw the sum-of-forces arrow *analytically* is no longer the
   default choice — it is now exactly the open step-4 primary-representation
   decision (analytical-primary vs engine-primary). **Consequence for
   sequencing: applied force does NOT need to wait on that decision, but the
   sum arrow does.**
3. **"Force-arrow visualization — new `renderables/visuals/ForceArrow.tsx`
   … a debug toggle for Show force vectors" — SHIPPED** as `VectorArrow` +
   `synthesizeForceDebugRenderables` + `?forces=1`. `force-applied` is the
   LAST unwired kind, and its branch is already waiting at
   `VectorArrow.ts:94`. No renderer work is owed.

Net: the remaining Goal-2 surface is narrower than the plan reads — the
adapter seam, the per-frame wiring, and the schema.

#### B. The double-count question, and the invariant it produced

**Bill's concern, stated precisely:** don't end up firing both
`ObjectConfig.acceleration` AND an acceleration derived as ΣF/m from a force
sum that now includes applied force. He recalls this class of bug biting us
very early, over the acceleration of gravity.

**Finding: the system is already immune, but only by accident of how the code
happens to be written.** `force-net` is not a sum. It reads
`userData.derivedAcceleration` (`VectorArrow.ts:64-65`), which is a finite
difference of actual velocity (`JsonSimulation.tsx:827-830`):

```
a_derived = (v_now − v_prev) / dt      →      force-net = m · a_derived
```

There is no summation anywhere on the causal path, so there is nothing to
double-count. The early gravity bug is precisely what happens when that loop
closes: the engine integrates g, and an app-side sum re-integrates it.

**RATIFIED (Bill, 2026-08-09) — promoted to CLAUDE.md invariant #14: net
force is DERIVED, never SUMMED. Forces flow one way, into the engine.**
Bill's framing: *we want the solver to do its job, and we want to be smart
about how we feed the solver so we don't lose any physics AND so we can
reconstruct physics after the fact for display purposes* — with no
pre-calculation that double-counts and undermines either the position solve
or the displayed quantities (vector, numeric, or graph). Component forces
exist for DISPLAY; closure onto the derived net is a validation, not a
construction. The precedent to copy is drag (`JsonSimulation.tsx:800-806`):
`k` is computed once, handed to `setLinearDamping` for the physics *and*
stashed on `userData.dragForce` for the arrow — one site, one value, so
physics and display cannot drift. `appliedForce` will be written the same way
in the same loop.

**Bonus property, and it is the validator this note has wanted since the
2026-07-19 research entry:** if the component arrows ever fail to close onto
the derived net, something is injecting unmodelled motion. The FBD becomes
the double-count alarm — self-reporting, not something we have to reason
about.

**Decided against: unifying the integrators.** Routing
`configuredAcceleration` through `applyImpulse` (J = m·a·dt) for
one-mechanism tidiness was considered and REJECTED. In free flight it is
arithmetically identical; grounded, both are pre-solve velocity
modifications the solver resists identically; both wake sleeping bodies. It
is a cosmetic change with a nonzero regression surface and no physics
payoff — the immunity comes from the derivation rule, not from having one
integrator. (Correcting a claim made earlier in the same session that
velocity writes "bypass the solver": they do not. `onUpdate` runs before
`world.step()`. The impulse-over-force argument in §Recommended approach is
untouched — forces really are cleared per substep.)

#### C. The chapter split — `acceleration` vs `appliedForce`

This is why the two fields are NOT redundant, and it came from Bill's
teaching side: **physics teachers cover acceleration BEFORE Newton's laws**,
so GIST needs sims with acceleration in them before applied forces have ever
been taught.

| | `acceleration` | `appliedForce` (coming) |
|---|---|---|
| Claim | "this body accelerates at *a*" | "something pushes with *F*" |
| Chapter | kinematics — taught first | dynamics / Newton's 2nd |
| Cause | stipulated, deliberately unmodelled | named, and on the diagram |
| Mass slider | does nothing (that is the point) | `a = F/m` — **the lesson** |
| FBD | not meaningful | closes by construction |

Bill's characterization: acceleration is "like an *override* that adds
acceleration to the system for users that have not specified any applied
forces." It is there for THAT chapter, **and its use in other chapters can
lead to outcomes that are unexpected — unexpected if you don't know it's
there.**

The concrete failure: a 5 kg body with `acceleration: {x: 2}` renders
`force-net` = 10 N (measured, correct), while gravity + normal + friction +
drag sum to 0. **The parts don't close onto the whole.** From the FBD's point
of view, `ObjectConfig.acceleration` is an unmodelled force. This is a live
gap today, not something applied force creates — applied force merely makes
it visible by finally giving the FBD something to close with.

**Ratified disposition:** the two fields keep distinct pedagogical domains
rather than being unified or forbidden. Superposition stays LEGAL (it is
honest physics: `a_total = a_cfg + F/m`, and the engine handles it), because
forbidding it would need runtime validation the system deliberately doesn't
do — nothing runs Zod `.parse()` at runtime (invariant #1), so a `.refine()`
would be dead code. Instead it is **surfaced**.

#### D. SHIPPED — the `checkChapterSplit` diagnostic

New fourth pass at the expansion seam, `src/lib/objectExpansion.ts`
(`checkChapterSplit`, called from `expandObjects` after `seatRiders`, on
settled ids; mutates nothing). Fires
`kinematic-acceleration-in-force-scene:<id>` when a body carries non-zero
`acceleration` AND at least one real force:

- authored non-zero `friction` (absent really means absent — invariant #1);
- air resistance enabled AND the body hasn't opted out via
  `dragCoefficient: 0`;
- **applied force — the one-line addition marked in the code, to land with
  Phase 2.** It is the sharpest case, since it is the field the author
  probably meant to reach for.

**Gravity is deliberately NOT a trigger** — additivity over gravity is the
field's ratified contract (invariant #9), and the prompt already teaches the
gravity double-count separately at FILL CONTROLS. `ObjectExpansionEnv` gained
`airResistanceEnabled`; the `JsonSimulation` call site passes
`environment.airResistance?.enabled === true` and joins the memo deps.
Consistent with the ratified bus semantic: authored config-state truth,
cleared on every re-expansion, never runtime events.

**Three places, LANDED** (unusually, all three in one pass — the chapter
split is exactly the choice the LLM makes blind today):
- **Schema** — `acceleration`'s `.describe()` (`simulation.ts:152`) now names
  it a kinematic stipulation, names the chapter, and carries the
  FBD-won't-close caution; JSON schema regenerated.
- **Prompt** — `gist_instructions.py` FILL OBJECTS step 4 gained the chapter
  rule ("author it when the prompt describes MOTION rather than a CAUSE";
  don't reach for it on a push/pull/force prompt); FILL CONTROLS' existing
  gravity-double-count paragraph gained the companion warning that an
  acceleration slider deliberately ignores mass, so pairing one with a mass
  slider teaches the opposite of `a = F/m`.
- **Docs** — this entry, plus invariants #9 (extended) and #14 (new) in
  `CLAUDE.md`.

**Bill's standing instruction: KEEP SURFACING the chapter split.** It is a
design decision that reads as a bug to anyone who doesn't know the field
exists, so it should stay visible to him and the dev team (Ethan, Duncan)
rather than settling into silence — same disposition as air-resistance Q6.

#### E. Recommended next step (Phase 1, unchanged in shape)

Adapter seam only: `applyImpulse` on `PhysicsBody` + both engines, a
debug-panel slider **added to the frame-cache key** (invariant #13 — the
plan's Phase 1 predates that invariant and a debug-panel force would
otherwise replay stale frames, the air-toggle bug verbatim), and
`userData.appliedForce` riding `FrameBodySnap` (the standing replay rule).
That lights up `force-applied` for free and runs the plan's acceptance test
(2 kg, 10 N, frictionless → 5 m/s²) on both engines before any authoring
surface is committed to.

**Two scope questions still open for Bill** (raised, not yet answered):
whether the **all-vectors polar-authoring sweep** stays pinned to this
refactor's closing phase, and whether B5 adopts the interim **ground-µ-zero
convention** so building it doesn't force the held pair-friction decision.

Verification: `tsc` clean on all touched files (`da.ts` locale typing is the
known baseline); `npm run lint` at the known baseline (4 react-refresh
context splits). `npm run generate:schema` re-run after the `.describe()`
change.

---

### Findings 2026-08-09 (Goal 2, item #3) — force-in / impulse-under RATIFIED; the substep-delivery asymmetry and what it costs at breakaway

Bill, ratifying: *"Since we don't want anything cleared in a substep then I
think we are talking about impulses. From a higher level abstraction, the user
can think in terms of applied Force but the system delivers expected outcomes
via an impulse path."* This closes **Decisions deferred #1** (force-vs-impulse
semantics in the JSON) — see that entry, now marked RATIFIED.

#### The boundary

**Newtons at every surface a human or an LLM touches** — schema field, slider,
output readout, graph series, arrow label, diagnostic text. **One line in
`onUpdate` converts. The adapter speaks impulse.** That is the entire
abstraction.

Two properties make this more than a convenient fiction:

- **Both engines are natively impulse solvers.** Rapier and Box2D/Planck
  resolve contacts by accumulating impulses, so `applyImpulse` is the
  primitive the solver already thinks in — not a workaround for a missing
  force API. We are not translating into a foreign vocabulary.
- **The mass slider then works BY CONSTRUCTION.** The conversion uses `dt`
  only; mass never enters it. The engine divides by mass when it applies the
  impulse, so `Δv = F·dt/m` falls out and a mass slider immediately changes
  the acceleration with no extra code. **B5's core lesson — same force,
  different mass, different acceleration — comes free from the arithmetic
  rather than being staged.** (Contrast `acceleration`, which deliberately
  ignores mass: the chapter split, Findings 2026-08-09 §C.)
- `userData.appliedForce` in Newtons joins `dragForce` / `normalForce` /
  `frictionForce`, which are already N. Same unit convention, so the
  `force-applied` arrow's 2 px/N default scale needs no special-casing.

#### The dt, verified — and the 8× trap next door

Read the loop rather than trusting the plan
(`BaseSimulation.tsx:337-343`):

```
onUpdate(a, t)                                   // ONCE per logical frame
for (i = 0; i < substeps; i++) a.step(substepDt) // 8 substeps at the default
simulationTime += FIXED_DT_SECONDS               // 1/60 s
```

`FIXED_DT_SECONDS = 1/60` (`BaseSimulation.tsx:60-61`); default
`precomputeTimestepHz = 480` (`JsonSimulation.tsx:477`) →
`substeps = round((1/60)/(1/480)) = 8`, `substepDt = 1/480`.

So **`J = F · FIXED_DT_SECONDS` is correct** — the impulse covers exactly the
span the substep loop then advances. **NOT `substepDt`**, which would
under-deliver by 8× — the same trap as the cleared-per-substep `applyForce`
in a different costume. Write the constant, not a derived local.

#### Where the abstraction leaks: delivery is a kick, not a push

The impulse arrives **entirely at the frame boundary**; the engine then
integrates 8 substeps. A true continuous force would be spread across all 8 —
and **gravity IS spread across all 8**, applied internally by the engine per
substep. So `F_applied` and `F_gravity` are **not delivered symmetrically**.

In free flight that is an O(dt²) difference, below visual threshold. **In
contact it may not be**, and the mechanism is specific:

An impulse solver clamps the tangential (friction) impulse each substep to
`µ × (normal impulse that substep)` ≈ `µ·m·g·dt_substep`. We inject a whole
frame's worth — `F/60`, i.e. `8F/480` — before substep 1, but substep 1's
friction budget is only `µmg/480`. Friction can absorb the kick outright only
when `8F ≤ µmg`.

**Prediction:** for `µmg/8 < F < µmg` — comfortably BELOW breakaway — the body
picks up velocity in substep 1 and creeps before the remaining substeps brake
it. B5-scale worked estimate (50 kg crate, µ = 0.3 → breakaway 147 N, push
100 N): ≈0.03 m/s after substep 1, arrested around substep 5, ≈0.1 mm per
frame — **≈7 mm/s of steady creep on a crate that should be perfectly
stationary**, recurring every frame.

If that holds, *"the box doesn't move until you push hard enough"* degrades to
*"…until you push one eighth as hard"* — **precisely the lesson B5 exists to
teach**, and precisely the regime the sub-floor force stub was built to make
legible (Findings 2026-08-06, step-4 drive round 1).

**Stated uncertainty, deliberately not designed around:** this is a
first-principles prediction. Warm-starting and the joint normal/friction solve
could soften or erase it. It is a thing to MEASURE in Phase 1, not a thing to
pre-emptively engineer against.

#### Phase 1 acceptance test — REVISED (this is the actionable change)

The plan's acceptance test (§Phase 1: *2 kg body, 10 N, frictionless →
5 m/s²*) **would not catch this** — no contact, so it passes regardless. It
stays, and a grounded case joins it:

1. **Free-body (unchanged):** 2 kg, 10 N, frictionless → 5 m/s², confirmed on
   the velocity-slope graph, both engines.
2. **NEW — grounded breakaway:** crate on flat ground, µ authored. Ramp F from
   0 and measure the F at which it actually breaks away, against `µ·m·g`.
3. **NEW — sub-breakaway creep:** hold F at ≈0.5·µmg for 5 s and measure total
   displacement. **Expect zero. Any monotonic drift is the delivery
   artifact.**

**Isolation baseline (why this experiment is clean and cheap):** `ramp-slide`
already measures µ = 0.404 against an authored 0.4 — about a 1% instrument —
with GRAVITY as the driving force, i.e. delivered per-substep by the engine.
If applied-force breakaway reads materially worse than that 1%, **the
difference IS the delivery artifact**, separated from ordinary solver error by
construction. The instrument exists; no new harness is owed.

#### If it shows up: the escape hatch is already scoped

The fix is the per-substep `onPreStep(body, dt)` hook deferred in §Recommended
approach ("strictly more accurate… defer until something genuinely needs it")
and again as Decisions deferred #5. **This would be the thing that needs it**,
and the loop it touches is the four lines quoted above. Deliberately NOT
pre-built: keep Phase 1 small, earn the hook empirically. Decisions deferred
#5 now names the artifact to watch for instead of the vague "visible artifacts
at 60 Hz".

---

### Findings 2026-08-09 (Goal 2, item #4) — sleep RATIFIED OFF globally at body creation; measured, with named revisit triggers

The FBD step-3 spike (Findings 2026-08-06) left **sleep flattening** as its one
unresolved caveat: a resting body loses its normal/friction arrows when the
engine puts it to sleep, and that is exactly the sub-breakaway regime B5
teaches. Item #4 resolves it. Bill asked three questions; all three were
measured against the pinned versions (planck 1.4.2, rapier2d-compat 0.19.3)
rather than reasoned about.

#### Q1 — "I take it this is a Planck issue only?" — NO. Both engines sleep.

Same scene (1 kg box resting on ground, 1 s settle, then 10 s observed):

| engine | slept at |
|---|---|
| Planck | already asleep by the end of the 1 s settle (`timeToSleep` = 0.5 s) |
| Rapier | 1.0 s AFTER the settle |

Rapier is roughly twice as slow to nod off — which is why the step-3 spike
recorded it as "laxer" — but **it sleeps.** A B5 crate sitting below breakaway
loses its arrows on BOTH engines, just a beat apart. **Fixing Planck alone
would have left the bug on the default engine**, which is the trap this
question caught.

#### Q2 — "Can we turn sleep off for certain objects?" — Yes, and the control is asymmetric in an inconvenient direction

| | Planck 1.4.2 | Rapier 0.19.3 |
|---|---|---|
| Per-body | `body.setSleepingAllowed(bool)` — **runtime** | `RigidBodyDesc.setCanSleep(bool)` — **creation-time ONLY** |
| World-level | `world.setAllowSleeping(bool)` | — |
| Runtime escape | — | `wakeUp()` / `sleep()` / `isSleeping()` |
| Tunables | `timeToSleep` 0.5 s, `linearSleepTolerance` 0.01 m/s, `angularSleepTolerance` 2°/s (`Settings` statics) | not exposed in the JS bindings |

Rapier has **no runtime `canSleep` setter** in the pinned version. A per-body
runtime toggle there would mean recreating the body or calling `wakeUp()`
every step as a workaround. **That asymmetry is the argument for deciding once
at creation rather than building a per-body knob.**

#### Q3 — "What's the performance hit?" — negligible at diorama scale

Planck, sleep on vs off, 10 s of sim time (600 frames × 8 substeps = 4800
`world.step` calls), measured:

| bodies | sleep ON | sleep OFF | ratio | per logical frame (OFF) | % of 60 fps budget |
|---|---|---|---|---|---|
| 5 | 1 ms | 83 ms | 66× | 0.14 ms | 0.8% |
| 20 | 4 ms | 330 ms | 89× | 0.55 ms | 3.3% |
| 100 | 44 ms | 1488 ms | 34× | 2.5 ms | 15% |
| 500 | 359 ms | 7977 ms | 22× | 13.3 ms | 80% |

**READ THE ABSOLUTE COLUMN, NOT THE RATIO.** The 22–89× ratios look alarming
and mean nothing: sleeping bodies cost essentially zero (1–4 ms), so the ratio
divides by ~nothing. At diorama scale the real cost is **about half a
millisecond per logical frame, ~3% of the 60 fps budget**; a 10 s precompute
gets a third of a second longer. Bill's read of why the feature exists is
confirmed by the 500-body row — that is the regime it was built for.

#### The measurement that actually settled it: there is no stability cost

The expected tradeoff was that sleep freezes a body EXACTLY, so an awake body
keeps being integrated and might micro-drift — which would trade one FBD
problem for another. **It does not:**

| | drift over 10 s | max \|v\| |
|---|---|---|
| Planck, sleep ON | 0.0000 mm | 0 |
| Planck, sleep OFF | 0.0000 mm | 2.3 × 10⁻¹⁸ m/s |
| Rapier, canSleep true | 0.0000 mm | — |
| Rapier, canSleep false | 0.0000 mm | — |

Machine epsilon. Nothing to pay.

#### DECISION (Bill, 2026-08-09): disable sleep GLOBALLY at body creation, in both adapters

Not per-body, and **not a debug toggle.** Four reasons:

1. **It is ~free** (0.5 ms/frame at diorama scale) and measurably costs nothing
   in stability.
2. **This is not an applied-force problem — it is an FBD problem we already
   ship.** Any resting body loses its normal/friction arrows TODAY;
   `ramp-slide` below breakaway has this bug right now, on both engines.
   Scoping the fix to bodies carrying an applied force would fix the new sim
   and leave the shipped one broken.
3. **Per-body is a false economy** given Rapier's creation-time-only control.
4. **Not a toggle, on purpose.** Invariant #13 — a debug knob that changes
   trajectories must join the frame-cache key. A constant does not. Keeping it
   OUT of the key is worth more than the knob.

Engine-specific logic stays in the adapters (invariant #4): Planck sets
`allowSleep: false` / `setSleepingAllowed(false)` at create; Rapier sets
`RigidBodyDesc.setCanSleep(false)`. Nothing above the adapter changes.

#### REVISIT TRIGGERS (Bill's explicit instruction — communicate thoroughly, this is reversible)

This decision buys display correctness with CPU we currently have to spare.
**Both halves of that sentence can change.** Re-open it when either fires:

- **TRIGGER 1 — object count.** If GIST starts authoring sims with more
  objects than we can comfortably handle. The table above is the sizing data:
  the knee is somewhere past 100 bodies, and 500 eats 80% of the frame budget.
  Note the cost is per-AWAKE-body-that-would-have-slept, so it bites hardest
  in exactly the scenes that motivated the feature — many bodies that settle
  and stay settled (a pile, a stack, a bin of objects).
- **TRIGGER 2 — low-performance hardware.** These numbers are from a dev Mac.
  **Chromebooks are a real target for GIST** and are the likeliest place this
  shows first. Re-measure there before assuming the 3% figure travels; a
  10–20× slower machine turns 0.55 ms/frame into something that matters.
  Benchmark method is reproducible — see the scratchpad harness described
  above (build N resting bodies, settle, time 600 substepped frames both ways).

If a trigger fires, the graceful fallback is **not** re-enabling sleep
wholesale — it is narrowing the scope: sleep allowed by default, disabled only
on bodies whose sim declares force display. That costs the Rapier body-recreate
workaround, which is exactly the complexity this decision is buying out of
today.

#### Consequence for the still-open step-4 decision

The step-3 spike left analytical-vs-engine primary representation balanced on
"zero jitter weakens the anti-engine case, but **sleep flattening keeps hybrid
alive**." **With sleep off, that second argument disappears** — the engine
readback now survives at rest, which is where it used to fail. This pushes the
primary-representation call further toward engine-primary. Weigh it there;
this entry does not decide it.

#### SHIPPED same day (2026-08-09)

- `PlanckAdapter.createBody` — `allowSleep: false` in the body def
  (`PlanckAdapter.ts:321-333`).
- `RapierAdapter.createBody` — `bd.setCanSleep(false)`
  (`RapierAdapter.ts:387`), carrying the full rationale + the "don't re-enable
  this to fix a perf problem" warning as a comment at the callsite, since that
  is where a future dev meets the decision.
- Both adapters funnel `createWalls` through `createBody`, so one edit each
  covers every body in the world.

**Verified through the real adapters** (not raw engines): 5 kg box resting on
ground, 10 s, sampled every 2 s —

| engine | expected N | N at t = 0, 2, 4, 6, 8, 10 s |
|---|---|---|
| Rapier | 49.0 | 49.00, 49.00, 49.00, 49.00, 49.00, 49.00 |
| Planck | 49.0 | 49.00, 49.00, 49.00, 49.00, 49.00, 49.00 |

Exactly m·g, 100%, held for the full run on both engines. Before the change
Planck's reading collapsed to zero at ~0.5 s and Rapier's at ~1.5 s. **The
step-3 spike's sleep-flattening caveat is closed.**

`tsc` clean on all touched files; `npm run lint` at the known baseline (4
react-refresh context splits). Incidental confirmation of an unrelated known
divergence: resting y settles at 0.498727 (Rapier) vs 0.515000 (Planck) —
engine penetration-allowance difference, not sleep-related.

**DRIVE-CONFIRMED by Bill, same day** — `/simulation/ramp-slide`: performance
fine (no perceptible cost from the always-awake bodies), **vectors stay visible
below the breaking-point angle** — the exact failure this fixed — and past
breakaway the expected motion, friction force and net force all read correctly.
Item #4 is closed.

---

### Findings 2026-08-09 (Goal 2, item #5) — friction representation: hold RE-AFFIRMED, scope narrowed, instrument broadened + SHIPPED, forcing function NAMED

Item #5 of the Goal-2 walk-through. The held question (Bill 2026-08-06,
`Notes_on_Ramps_and_Tracks_Refactor.md` → Open questions) is *how GIST should
represent friction to users and the LLM*, given that µ is physically a
surface-PAIR property while both engines fake it per-body with a Max combine
rule. That note remains the question's home; this entry records what the
applied-force work changed about it.

#### Scope is narrower than it read — B5 needs no decision

Checked rather than assumed:

- Walls are created at **friction 0 on both engines** — Rapier explicitly
  (`RapierAdapter.ts:478`), Planck via `material.friction ?? 0`
  (`PlanckAdapter.ts:62`).
- An object with no authored friction also gets **0**
  (`ObjectRenderer.tsx:44`, a destructuring default).
- Both engines combine as **Max** (Rapier natively; Planck aligned by the
  begin-contact hook, `PlanckAdapter.ts:246-252`).

So `max(0, mover's µ) = mover's µ`: **the one-owner convention is already the
de-facto default**, and the masking bug REQUIRES someone to author µ on
another body. **B5's crate-on-a-floor scene with a friction switch is
therefore safe to build with the hold still in place** — which retires the
"does B5 force pair-friction?" scope question raised at the start of this
session. It does not.

(Bonus catch: `GIST_Physics_System_Topics.md` still claimed Planck needed a
friction-mixer fix before the cross-engine parity energy claim could be
re-tested. Stale — the Max alignment shipped during the container work. Fixed
there; the real open item is that nobody has re-run the parity test.)

#### Instrument broadened + SHIPPED — `checkFrictionSliderMasking`

`seat-friction-masked` only ever covered the DECLARED `seatOn` pair, so it
missed every other geometry — including the case that actually bit us. New
producer `checkFrictionSliderMasking` (`objectExpansion.ts`, called from
`JsonSimulation` inside the bus-cleared window, since `expandObjects` takes
objects and not controls) fires `friction-slider-masked:<targetObj>` when a
friction slider's target is out-µ'd by another body.

**Bill's scoping call: compare against ANY other object in the sim, not just
static ones.** Rationale, recorded because it is the interesting part: we
cannot know at config time which bodies will touch, and inferring contact from
geometry is not the seam's business. The rule this encodes is a **dev-facing
expectation** instead — *while exploring forces, the friction slider's value
should be the operative µ for all object interactions in the scene.* The broad
net deliberately **sets the stage for the pair-friction discussion rather than
pre-empting it**.

Distinguishes two severities: "dead from `min` to X" vs. **"does NOTHING
anywhere in its range"** when µ ≥ slider max, which reads as a broken sim
rather than a floored control. Config-state truth only; a slider drag does not
re-evaluate it (matching `seat-friction-masked`, per the ratified bus
semantic). Both producers stay — `seatOn` is a real declared contact and
reports the pair delta.

Verified headless, 6/6:

| case | result |
|---|---|
| ramps remix failure (slider 0–1, ramp authored 0.6) | FIRES — "dead from 0 to 0.6" |
| correct authoring (surface µ 0, the taught pairing rule) | quiet |
| surface µ unauthored (the default; floor/walls) | quiet |
| slider tops out 0.5, shelf carries 0.8 | FIRES — "does NOTHING anywhere in its range" |
| **non-static** offender (dynamic box at 0.7) | FIRES — Bill's broadening |
| no friction slider present | quiet |

#### FORCING FUNCTION — named (this is the schedulable output)

Bill asked for the conservation angle in the discussion, and it is what turns
this from an authoring wart into a correctness precondition.

**The friction-representation decision must be RESOLVED before
G6-with-friction ships.** `PHYSICS_GRAPHS.md` G6 asserts *"E_total decays and
the deficit equals work done by friction — area bookkeeping meets
conservation."* That is a QUANTITATIVE claim: the student checks ΔE against
µ·N·d. Under Max masking the operative contact µ need not be the µ on the
slider, and **the arithmetic simply fails**. G6 is flagged ⭐ *the single most
curriculum-central graph for ages 10–18*, so this is a hard dependency of the
most important graph in the roadmap.

**The frictionless half carries the subtler version of the same dependency.**
G6's dual duty is that on a frictionless scene, E_total drift is *numerical
artifact by definition* — the "the simulation is also an approximation"
lesson. That inference needs certainty that the scene IS frictionless, and
under Max masking, authoring µ = 0 on the mover does not guarantee it. **Solver
drift and unintended friction become indistinguishable**, quietly invalidating
the diagnostic.

**Second forcing function, same decision:** FBD step 5 — an analytical friction
model needs a defensible contact µ. Resolve the two together.

Dependency recorded at BOTH ends: `PHYSICS_GRAPHS.md` G6 (found from the graph
side) and the ramps note's Open questions (found from the question side).

#### Energy follows invariant #14 — derived, never summed

`PHYSICS_GRAPHS.md` harness rule 4 already says derived quantities are computed
outside the engine from sampled state, never trusting engine-internal energy
reporting. That is invariant #14's shape applied to energy, and it is now
stated explicitly at G6: **compute E_total(t) from measured state and let the
friction loss be the RESIDUAL — do not integrate ∫F_fric·v dt to construct
it.** The analytical µ·N·d prediction is the overlay you compare against, which
makes energy closure a *validation* rather than a construction — the same
protection, for the same reason, as force closure.

#### Adjacent capability gap, deliberately NOT bundled here

Checking the conservation thread surfaced that the recorded gap is worse than
the matrix states. It reads "outputs/graphs take per-object property paths so
system totals (Σp, ΣKE) are inexpressible." In fact **KE, PE and p are not
expressible AT ALL** — no such property path exists anywhere in `src/`, and
every output and graph is anchored to a single `targetObj`. The workaround is
visible in the wild: `CupCatchSimulation.tsx` teaches momentum conservation by
watching *"the two vx traces converge"* — a proxy for momentum, not momentum.

**Consequence: G6 and G8 (both ⭐) are currently unbuildable, and B2/B3/B8 with
them.** This gates more benchmarks than friction representation does, it is
INDEPENDENT of it, and it already has a design rule written down that matches
invariant #14. Flagged as its own scoping item — not opened here.

---

### Findings 2026-08-09 (Goal 2, item #6) — Phase 1 BUILT: `applyImpulse` seam, the `onPreStep` hook (earned, not assumed), and the debug-panel force dropdown

Item #6 was meant to be the short one — "the two invariants that bite
mechanically." The acceptance test turned it into the most consequential entry
of the session.

#### The finding that changed Phase 1's shape

`J = F · FIXED_DT_SECONDS` applied once per LOGICAL FRAME is arithmetically
correct and **passes the free-body test exactly** — but it breaks contact
behaviour, because our precompute loop then takes 8 substeps of 1/480 s. Item
#3 predicted this; item #6 measured it:

| delivery | F = ma (2 kg, 10 N) | breakaway (truth 19.6 N) | creep @ 9.8 N over 5 s |
|---|---|---|---|
| frame boundary | 5.0000 m/s² ✅ | Rapier **6 N** (−69%), Planck **8 N** (−59%) | **35.6 / 30.6 mm** |
| per engine step | 5.0000 m/s² ✅ | Rapier **19 N** (−3.1%), Planck **20 N** (+2.0%) | **0.333 / 0.000 mm** |

Mechanism confirmed to the threshold: at F = 2 N — just below the predicted
`µmg/8 = 2.45 N` — drift is 0.09 / 0.0000 mm; above it, creep. A crate that
should sit still until 19.6 N began sliding at 6 N. **That is B5's entire
lesson, inverted.** Bill: *"an applied force less than a static friction force
should not move an object"* — a must-have, and explicitly WITHOUT resorting to
an analytical/logical override: keep letting the solver do its job, just feed
it honestly.

#### Two axes, and the one that mattered (Bill's clarifying question)

Bill asked whether "substep" meant solver iterations. It does not, and the
distinction is load-bearing enough to measure:

| axis | result | conclusion |
|---|---|---|
| **Solver iterations** (1→32), broken cadence | Rapier 8, 6, 6, 6, 6 N | **cranking iterations does NOTHING** |
| **Substeps** (1→16), impulse per `world.step()` | Rapier 18, 18, 18, 19, 20 N | correct at every count |

A *substep* is a full `world.step(1/480)` — integrate forces, solve
constraints, integrate positions. *Solver iterations* are convergence passes
INSIDE one step. **Neither engine lets you inject an impulse between solver
iterations, and we do not want that** — those iterations converge a single
time-step's constraint system, and injecting mid-convergence would corrupt it.
**No new engine API is needed:** `applyImpulse` before each `world.step()` IS
the cadence gravity uses. (Refinement on "as gravity does": gravity is not
applied per solver iteration either — the engine applies it once per step,
before the constraint solve. Right instinct, one level up.)

**The rule, stated as unit consistency rather than "spread it out":
`J = F · dt_of_the_next_step`.** The bug was handing an impulse computed over
1/60 s to a 1/480 s step, dumping eight steps' worth of tangential impulse into
one step's friction budget. The 1-substep column reading 18 N is the tell — at
one step per frame the two cadences coincide, which is why the error scales
with substep count. Corollary: applied force stays correct at every timestep
dropdown setting.

#### BUILT

- **`applyImpulse(impulse: Vec2)` on `PhysicsBody`** (`types.ts`) + both
  adapters. Rapier `rigid.applyImpulse(v, true)`; Planck
  `applyLinearImpulse(v, getWorldCenter(), true)` — at the center of mass, so
  no torque (off-center stays Decisions-deferred #2). `wake: true` on both.
- **`onPreStep(adapter, dtSeconds)` on `BaseSimulation`** — the hook this note
  deferred with *"defer until something genuinely needs it."* It genuinely
  needed it, and the deferral was right: we now have numbers instead of an
  assertion. Fires before EVERY `adapter.step(dt)` with that step's own dt, at
  both step sites (live: one full-dt step; precompute: 8 substeps).
  **`onUpdate` is untouched and still strictly once per logical frame** —
  graphs, outputs and finite differences depend on that
  (`GIST_Physics_System_Topics.md` → Loop-mode semantics), so this is a
  separate lightweight hook, not a relocation.
- **`handlePreStep`** in JsonSimulation reads the Newton value stashed by
  `handleUpdate` and converts per step. **ONE compute site** (invariant #14's
  drag precedent): `handleUpdate` writes `userData.appliedForce` in Newtons;
  the engine path, the Frame capture, and the arrow all consume that same
  number, so physics and display cannot drift.
- **`force-applied` is now WIRED** (`VectorArrow.ts`) — the last unwired kind
  in `vectorTheme.ts`; its branch had been waiting since Phase 1 of the vector
  work. Added to `FORCE_DEBUG_KINDS` so `?forces=1` draws all six. Reads
  {0,0} and self-suppresses on every sim except the debug target.

#### The debug UI (Bill's spec: a dropdown, like solver iterations)

Two selects in `AdvancedDebugPanel`, both disabled while running/precomputing:

- **"Applied force"** — discrete signed values
  `0, ±1, ±2, ±5, ±10, ±25, ±50, ±100 N`. **Discrete rather than a slider for
  two reasons worth recording:** a continuous control rewrites the frame-cache
  key on every drag tick, so every micro-adjustment forces a fresh precompute;
  and the two-engine acceptance test needs the SAME force on both engines, not
  approximately-the-same-slider-position. ±1/±2 are kept deliberately — they
  probe the sub-breakaway band on a light test body.
- **"Force on"** — a body-id dropdown of dynamic bodies. An id list rather
  than canvas selection because **selection is impossible after a run**
  (`editModeActive` requires `simAtInitialConditions`, which Play clears) —
  the same blocker the force loupe hit.
- **X-only for Phase 1.** B5 and PhET Forces-and-Motion are 1D horizontal and
  gravity already supplies Y. The schema field can still be `{x, y}` in Phase 2;
  this is only the harness.

#### The two invariants, honoured

- **#13 frame-cache key** — both the force value AND the target id join the
  key at `handlePlay`. The May-2026 plan predates this invariant, and a
  debug-panel force outside the key would have silently replayed stale frames:
  the air-toggle bug verbatim. Discrete values keep the key space small enough
  that flipping between forces can genuinely REUSE cached frames.
- **Standing replay rule** — `appFx`/`appFy` ride `FrameBodySnap` beside
  `dragFx`/`normalFx`, restored in `handleReplayFrame`. Without it
  `force-applied` would be invisible in replay, exactly as `force-drag` was
  until the step-2 drive caught it.

#### Three places: deliberately UNTOUCHED

No schema field, no prompt, no LLM support — debug-first, exactly as
`?forces=1` and the loupe were. Per invariant #2 that IS the landed state, not
a gap. Bill's framing for the sequence: **test an applied force on both engines
through the debug panel BEFORE it enters the authoring system.** Phase 2 is
where `appliedForce` becomes authorable.

Verification: `tsc` clean on all touched files; `npm run lint` at the known
baseline (4 react-refresh context splits). Physics measured headless through
the real adapters at the app's exact cadence. **Owed: Bill's drive** — the
headless harness cannot exercise the React wiring (dropdowns → cache key →
precompute → replay → arrow).

---

### Findings 2026-08-09 (Goal 2, item #6 cont.) — Bill's drive PASSED; `appliedForce1D` hardwired as the applied-force test case

Bill drove the Phase 1 debug force on a modified ramp-slide scene and reported
it working: *"things work great … the comparison between analytical and
numerical solutions is within acceptable limits."* The sim is now hardwired as
a permanent fixture so **Phase 2's authoring surface has something to be tested
against rather than a fresh scene**: `src/simulations/appliedForce1D.json` +
`AppliedForce1DSimulation.tsx` + route `/simulation/applied-force-1d`.

**Design of the fixture (Bill's):** m = 5 kg, µ = 0.51, g = 9.8 → breakaway
µ·m·g = **24.99 N**, chosen so the dropdown's **±25 N step lands right on the
threshold**. The sim is built around the one menu value that can straddle it.

**`g` is exactly 9.8** — asked and answered: three places (schema default
`simulation.ts:276`, and both adapter fallbacks), all `9.8`. Not 9.81, not
9.80665. Paper calculations at 9.8 are the sim's own number.

#### Headless verification, both engines

| regime | result |
|---|---|
| **sliding**, `a = (F − µmg)/m` | +50 N and +100 N → **0.01% error** on both engines. Exact. |
| **breakaway** | Planck **25 N** (+0.04%), Rapier **24 N** (−3.96%) |

**The Rapier gap is not a breakaway error — it is a difference in the CHARACTER
of static friction**, and that is the finding worth keeping. Drift over 5 s
below the 24.99 N threshold:

| F | 20 N | 22 N | 24 N | 24.9 N |
|---|---|---|---|---|
| Rapier | 0.2 mm | 5.5 mm | 14.7 mm | 19.5 mm |
| Planck | 0.0 mm | 0.0 mm | 0.0 mm | 0.0 mm |

Planck's static friction is **rigid** (exactly zero until it breaks); Rapier's
is **compliant**, creeping asymptotically toward the threshold (TGS-soft). So a
"did it move?" criterion reads Rapier ~4% low. At `pixelsPerUnit: 100` that
worst-case creep is **1.5 px over 5 s** — invisible, which is precisely Bill's
"within the noise of the simulation system overall". Recorded in
`GIST_Physics_System_Topics.md` → Cross-engine inconsistencies.

#### Bill's observed start transient — explained exactly

Bill: *"my initial location of the ice block 'drops' before the block engages
with the floor … the net force arrow points both above and below the horizontal
from 0 to 0.07 seconds."* Cause: **`y = height/2` does not rest a manifest
sprite on the floor.** `ice_block`'s collider is 98.6% of its bounding box
(57.37 of a 58.1818 viewBox), so at `y: 0.25, height: 0.5` the collider bottom
starts **3.75 mm above** the floor. Predicted free fall 27.7 ms; measured
Rapier `vy` at 17 ms = **−0.163 m/s**, and `g × 0.01667 = 0.163` — exact. His
0–70 ms noise window is that fall plus settling.

**Planck never drops** — its 10 mm polygon skin (`polygonRadius =
2 × linearSlop`, `linearSlop = 5e-3`) already spans a 3.75 mm gap. Same cause
as its resting **11.25 mm higher** than Rapier, which also explains the
0.4987 / 0.5150 rest-height divergence noticed while verifying the sleep
change. Both recorded — the authoring trap in `Local_Sim_Workflow.md`, the
engine divergence in the topics tracker.

**Kept as authored, deliberately.** `y: 0.2462` would remove the transient;
the fixture keeps `0.25` because it is what Bill drove and validated, and
because the drop is a useful in-repo specimen of the collider-inset trap.

#### Harness honesty

The first headless run reported the +50 N case running 42% fast. That was a
harness bug, not physics: an 8.8 m floor, and the block slid 26 m — off the
end, losing friction, and continuing at F/m. Re-run on a long floor it matches
theory to 0.01%. Recorded because the failure mode is easy to repeat: **an
above-breakaway push covers real distance fast** (22.5 m in 3 s at +50 N), so
any harness testing sustained force needs a floor sized for it.

---

### Findings 2026-08-10 — the ratified dt rule was still taught WRONG at the adapter seam (doc drift, fixed)

Caught while re-reading the Phase 1 diff. Item #3 ratified `J = F ·
FIXED_DT_SECONDS` (per logical frame) and item #6 then MEASURED that rule and
replaced it with `J = F · dt_of_the_next_step` (per engine step, via the new
`onPreStep` hook). Both entries are correct and correctly dated — but the
`applyImpulse` docstring in `src/physics/types.ts` was written between them and
never revised, so it shipped in `d92ea0f` still prescribing the superseded rule
**and explicitly warning against the one that turned out to be right**
("the LOGICAL frame dt, not the substep dt … using substepDt would
under-deliver 8×"). It also described the sub-breakaway creep as a live "known
leak" when item #6 had already closed it.

**Why this one mattered more than an ordinary stale comment:** it sat on the
interface declaration — the first thing a dev reads when wiring the *next*
caller of `applyImpulse` (Phase 2's `appliedForce`, or `applyImpulseAtPoint`
whenever it lands). Every other record of the correction lived in this note and
in `GIST_Physics_System_Topics.md`; the one surface a future implementer meets
at the point of use taught the bug. Doc drift is normally cosmetic — at an API
seam it is a trap.

**Fixed** (`types.ts`): the docstring now leads with `J = F ·
dt_of_the_NEXT_STEP`, names `onPreStep` as the delivery mechanism, and keeps
the wrong rule as an explicit DO-NOT with the measured numbers (breakaway 6 N
vs. true 19.6 N; 36 mm creep) and the solver-iteration disclaimer. Superseded
rationale marked, not deleted.

**Generalizable lesson, worth carrying:** when a session ratifies a rule and
then supersedes it *the same day*, the second decision has to sweep the first
one's code comments too. The refactor note self-corrects by append; a docstring
does not — it just keeps asserting. Cheap check for next time: after any
same-session reversal, grep the touched files for the superseded phrasing
before committing.

Verification: `tsc` clean on the touched file; comment-only change, no behavior
delta. Numbers re-checked against Findings 2026-08-09 items #3 and #6 rather
than restated from memory.

---

### Findings 2026-08-13 — Phase 2 SHIPPED: `appliedForce` is authorable, in 2D, in polar; and the 2D delivery rule MEASURED

Bill: *"Since it worked well in 1D, there is no reason to think it won't work
well in 2D. Any issues we should discuss before developing a 2D applied force
ready for json authoring?"* The premise held — `applyImpulse` takes a `Vec2` and
both adapters already passed both components through, so nothing about the
second dimension was new to the *delivery* path. The risk was all in the
*authoring* surface, and four of its decisions were much cheaper to make before
the field shipped than after.

#### A. What 2D actually earns a measurement for — and the result

A y-component is not symmetric with x: it changes the normal force, hence the
friction budget µN. The "pull the sled at 30°" scene is therefore COUPLED —
F_x drives the motion while F_y changes what resists it — and the 1D breakaway
numbers were all taken with N constant. Measured through the real adapters at
the app's exact cadence (8 substeps of 1/480 s per 1/60 s frame), on the
`appliedForce1D` fixture's numbers (m = 5 kg, µ = 0.51, g = 9.8):

```
F* = µmg / (cosθ + µ·sinθ)        a_slide = (F·cosθ − µ(mg − F·sinθ)) / m
```

| θ | −15° | 0° | 15° | 27.02° | 30° | 45° |
|---|---|---|---|---|---|---|
| analytic F* (N) | 29.97 | 24.99 | 22.76 | **22.26** | 22.29 | 23.40 |
| Planck breakaway | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% |
| sliding a, both engines | ≤0.02% | ≤0.02% | ≤0.02% | ≤0.02% | ≤0.02% | ≤0.02% |

**The delivery rule generalizes to 2D — unchanged, no fix owed.** Two reasons
this is a strong result rather than a weak one:

1. **The sliding row is the coupled case** and it is exact on BOTH engines at
   every angle, including θ < 0 where the force pushes DOWN and *increases* N.
   That is the only genuinely new physics in 2D, and the solver gets it right
   because we feed it causes and let it resolve them (invariant #14).
2. **Planck's breakaway is a threshold-free test.** Its static friction is
   rigid — exactly zero drift until it breaks — so "did it move?" has an
   unambiguous answer, and that answer matches `F*` at every angle.

#### B. A correction to the 1D record: Rapier's breakaway error is the INSTRUMENT, not the engine

Findings 2026-08-09 (item #6 cont.) recorded Rapier's breakaway as −3.96% and
attributed it to compliant friction. The attribution was right; the NUMBER was
never a property of the engine. Sweeping the motion criterion shows it directly:

| criterion (5 s window) | 1 mm | 10 mm | 50 mm |
|---|---|---|---|
| Rapier breakaway error, θ = 0 | −18.0% | −7.5% | **+0.0%** |
| Rapier breakaway error, θ = 45° | −21.7% | −9.7% | **+0.0%** |
| Planck, any θ | +0.0% | +0.0% | +0.1% |

**Rapier's true threshold is exact.** Everything between is the creep tail
crossing whatever bar the test sets. So the honest statement is not "Rapier
reads ~4% low" but "a compliant-friction engine has no threshold-free breakaway
measurement, and any single number you quote is a property of your motion
criterion." The apparent error grows mildly with angle (creep at 0.99·F* rises
18.5 mm → 23.4 mm from 0° to 45°) — expected, since a lifting pull reduces N.
At `pixelsPerUnit: 100` the worst case is 2.3 px over 5 s: still invisible,
still Bill's "within the noise of the simulation system overall".

#### C. The four authoring decisions (Bill ratified all four)

1. **Polar authoring — and it broke a pin, deliberately.** The all-vectors
   polar-authoring sweep was PINNED to the *end* of applied-forces at vector-rep
   close-out. It landed with Phase 2 instead, because "50 N at 30° above
   horizontal" is how a 2D force is actually phrased — most of the pedagogical
   value of the second dimension is in that sentence — and shipping the field
   components-only would have meant migrating the field AND its accumulated
   prompt corpus later. Bill: *"I agree on polar authoring for applied force.
   And definitely make the change for acceleration as well. Just to keep
   everything consistent."* So `acceleration` swept in the same pass.
   **`gravity` is not in the sweep and never was in scope** — it is a signed
   scalar on `environment`, not a 2D vector. The sweep is COMPLETE.
   Normalization is now one shared `vectorToSI` helper at the seam
   (`unitConversion.ts`), so a future vector field cannot silently skip it —
   which matters precisely because nothing Zod-parses at runtime (invariant #1).
2. **Singular now, array later, and the migration is free.** Phase 3's
   `appliedForces` array (multi-puller, sum arrow) stays where it is: a later
   widening union (`Vec | Vec[]`) is backward compatible, so the Phase 2/3 split
   costs nothing. Decided deliberately rather than by default.
3. **Duration DEFERRED, and now it has a home.** Bill: *"I want to add that in
   when we work on it as a general feature for element duration (like applied
   force), sim sequence, and event detection. The latter enables us to stop an
   applied force when we hit the simulation walls for instance."* This is the
   important scoping move in the session: "push for 2 seconds" is not an
   applied-force feature, it is one instance of a **general temporal/event
   layer** — element duration, sim sequencing, and event detection — and
   event detection is what makes it interesting (stop the force ON a wall
   contact, not at a wall-clock time). Building a one-off `duration` field on
   `appliedForce` would have pre-empted that design with the weakest possible
   version of it. The schema `.describe()` says the force is constant and points
   authors at a slider; the prompt says the same and forbids inventing a
   time-varying field. **New parking-lot entry owns the general feature.**
4. **World-frame, at the centre of mass, no torque.** Never came up in 1D with a
   non-rotating block. World-frame is right for a push or a wind and wrong for a
   body-fixed thruster; COM-only means an off-centre push cannot tip a box, which
   is a student's likely mental model. Both are now stated in the schema and the
   prompt so the LLM cannot assume otherwise, and the prompt explicitly says not
   to fake rocket thrust. `applyImpulseAtPoint` remains Decisions-deferred #2.

#### D. Superposition, not override — where authored force meets the debug force

`handleUpdate` resolves ONE number per body per frame
(`JsonSimulation.tsx`): `userData.appliedForce = configuredAppliedForce +
debugForce`. Two sources ADD rather than one overriding the other, because two
pushes on a crate add — and because the debug harness stays usable on a sim that
already authors a force instead of silently discarding it. The single-compute-site
discipline is unchanged and is the whole point (invariant #14, drag precedent):
one number, now four consumers — the engine path (`handlePreStep`), the
`force-applied` arrow, the outputs/graphs readback, and the `FrameBodySnap`
replay capture. They cannot drift apart because there is nothing to drift.

Reads and writes deliberately target DIFFERENT fields, mirroring `acceleration`:
a slider bound to `appliedForce.magnitude` writes `configuredAppliedForce`;
an output bound to `appliedForce.magnitude` reads the RESOLVED
`appliedForce`. So a readout always shows the force that actually acted.

**`handlePreStep` had to stop being single-target.** Phase 1 visited only the
debug body; with authoring, every body may carry a force, and the shortcut would
have silently dropped authored ones.

#### E. Force is length-scaled at the seam (a units judgment call, recorded)

`appliedForce` multiplies by `unitScale` exactly as `acceleration` does, and
`unitScaleFor` returns the length scale for `appliedForce.*`. Rationale: force
carries a length dimension (N = kg·m/s²) while MASS does not (kg is kg in every
sim). Scale it and `F = m·a` holds in authored numbers; don't, and a cm-unit sim
authoring `F: 10` with `m: 5` reads an acceleration of 200 in its own display
units. Verified: `{x: 10}` in a cm sim → `{x: 0.1}` SI. The consequence worth
naming is that in a non-metre sim the authored force unit is kg·(unit)/s², not
newtons — the same bargain velocity and acceleration already make, and
consistent with invariant #10 (units describe the diorama).

#### F. `checkChapterSplit` — the marked one-liner landed, and the pass was quietly broken

The `NEXT: when appliedForce lands` comment (`objectExpansion.ts`) is now the
third trigger, and the message ADAPTS: when the body already names its cause it
says so, explains that the two superpose (`a_total = a_authored + F/m`), and
tells the author to drop the acceleration rather than the force.

**The polar sweep exposed a latent bug in the same pass.** `checkChapterSplit`
tested `a.x === 0 && a.y === 0`. It runs BEFORE `scaleObjectToSI`, so the moment
`acceleration` accepted polar, a `{magnitude, angle}` acceleration would read
`undefined === 0` → false → **the diagnostic would have gone silent on exactly
the authoring form we just added**. Now compared by magnitude through a
`vectorMagnitude` helper that handles both forms. Generalizable: *any* seam
predicate that reaches into `.x`/`.y` is a polar-authoring hazard, because the
seam is upstream of normalization by design.

#### G. Doc drift, again — this time in the architecture manual

The 2026-08-10 entry fixed the superseded `J = F · FIXED_DT_SECONDS` rule in the
`applyImpulse` docstring and drew the lesson that a same-session reversal must
sweep code comments too. It did not sweep far enough: `src/pages/docs/RuntimeLoop.tsx`
still taught the superseded rule in THREE places — the Mermaid node
(`F · FIXED_DT`), the bullet ("once per logical frame"), and a bullet stating the
per-substep `onPreStep(body, dt)` hook "was considered and deferred — both
refactors found a substep-invariant formulation that doesn't need it." That hook
shipped 2026-08-09 and is what makes applied force correct. Fixed: the diagram
now shows the `userData → onPreStep → applyImpulse` path with the frame-boundary
rule as an explicit red DON'T carrying the measured 19.6 → 6 N collapse.

**Sharper version of the 2026-08-10 lesson:** grepping the *touched files* is not
enough, because the in-app docs site describes code it does not import. The
check after a reversal is "who TEACHES this rule?", not "who calls it?".

#### H. Verification

- `tsc` clean on all touched files (`da.ts` locale typing is the known baseline);
  `npm run lint` at the known baseline (4 react-refresh context splits).
- `npm run generate:schema` re-run (+92/−23 lines).
- Physics measured headless through the real adapters at the app's cadence.
- Authored path verified end-to-end headless: polar → seam → SI
  (`{magnitude: 50, angle: 30}` → `{x: 43.3013, y: 25.0000}`), components
  unchanged, cm scaling, `checkChapterSplit` fires on the mixed case and stays
  quiet on force-alone, and the fixture's headline claim reproduced on both
  engines (23 N at 0° → 9.4 mm / 0.0 mm; 23 N at 27.02° → 2.13 m / 2.07 m).
- **New fixture** `/simulation/applied-force-2d` (`appliedForce2D.json`): the
  AUTHORING fixture, where `applied-force-1d` is the DELIVERY fixture. Seated
  flush at `y: 0.2462` (the collider-inset trap), so its FBD is clean from
  frame 1.
- **OWED: Bill's drive.** The headless harness cannot exercise the React wiring —
  polar sliders through `writeVectorPolar`, the frame-cache key, precompute →
  replay, and the arrows. Same gate as Phase 1.

#### I. Still open (unchanged by this entry)

The FBD step-4 primary-representation call; the friction-representation hold
(B5 remains safe to build under it — walls are µ 0, so one-owner is the de-facto
default); and the KE/PE/momentum inexpressibility that gates G6/G8 and B2/B3/B8,
which is independent of both and still un-scoped.

---

### Findings 2026-08-13 (cont.) — Bill's drive found it: `body.mass = X` was a NO-OP on Rapier

The Phase 2 entry above closed with "OWED: Bill's drive." The drive paid for
itself immediately, and what it found was not in Phase 2's diff at all.

**Bill's report:** at 27° the crate stayed on the ground; then, playing out
*"a move students would do — max the force, max the pull angle, min the mass"*
(40 N, 60°, 2 kg), it still would not lift. His arithmetic was exactly right:
`F·sin60° = 34.64 N` against `mg = 19.6 N` at 2 kg, so the lift threshold is
`mg/sin60° = 22.63 N` and 40 N should clear it comfortably.

**Cause — and it is a pre-existing adapter bug, not an applied-force one.**
`RapierAdapter`'s mass setter was:

```
set mass(value) { this.rigid.setAdditionalMass(Math.max(0, value - this.baseMass), true); }
```

Two independent defects, measured through the real adapters:

1. **`setAdditionalMass` alone does not change `rigid.mass()` at all.** It only
   takes effect after `recomputeMassPropertiesFromColliders()`, which was never
   called. So `body.mass = X` was a **complete no-op on Rapier — in BOTH
   directions** (setting 2 *or* 10 on a 5 kg body left it at 5.0000).
2. **Even with the recompute it could only ever ADD.** Total mass is
   `collider base + additional`, and additional is clamped ≥ 0, so a body could
   never be made LIGHTER than its authored mass. A mass slider that cannot go
   down is precisely the wrong half of `a = F/m`.

Planck was correct throughout (2 → 2.0000, 0.5 → 0.5000), so this was a
**silent cross-engine divergence on the DEFAULT engine**, in the one control
B5's whole lesson rests on. Bill's crate was never 2 kg; it was still 5 kg, so
34.64 N < 49 N and the engine was right to keep it on the floor.

**Fix.** Mass in Rapier lives on the COLLIDERS — creation already sets it there
(`addCollidersForShape`, `cd.setMass(...)`, split evenly across compound parts)
— so the runtime setter now goes back to the same place: scale every collider's
mass by `target / current_total`, then
`recomputeMassPropertiesFromColliders()`. Scaling (rather than assigning) keeps
the compound's mass DISTRIBUTION, so the centre of mass stays put and the
recomputed inertia stays physical. The now-unused `baseMass` field is gone.

Verified through both adapters: 5 kg authored, then set to 2 / 10 / 2 / 20 /
0.5 — every value lands exactly, on both engines, idempotently, and survives
stepping; compound colliders track too (2.0000 kg). Bill's scenario end-to-end:
**rise 15.07 m (Rapier) / 15.06 m (Planck)**, with the 5 kg control correctly
staying down (0.001 m).

**The lesson worth keeping — a headless harness that calls the ADAPTER can
still miss an adapter bug if it never uses the setter the UI uses.** Every
measurement in the entry above created bodies with `mass` in the `BodyDef` and
never touched `body.mass = X`. The delivery physics was verified exactly right,
and the feature was still broken for the student's first move. When a control
writes through a setter, the harness has to write through that setter too.

#### The fixture was also mis-tuned — the lesson was invisible

Separately, and found while checking Bill's 27° observation: the window in
which the optimal-angle lesson lives is `F*(0)/F*(θ_opt) = √(1 + µ²)`, so a low
µ squeezes the whole demonstration into a sliver. At the 1D fixture's µ = 0.51
the window is 12% wide, and the default 23 N at 27° accelerates the crate at
**0.166 m/s²** — about 2 m over a full 5 s run, which reads as *nothing
happened*. Retuned to **µ = 0.8, default 35 N** (window 28%, optimal angle
38.66°, F* = 30.61 N): the same move now gives **1.12 m/s² and 14 m in 5 s**.

Verified on the retuned fixture, both engines: 35 N at 0° → 7.9 mm (Rapier
creep) / 0.0 mm — stuck; 35 N at 38.66° → 14.1 m — moves; 60 N at 60° on 2 kg
→ rises 32 m — lifts. The two fixtures are now tuned for different jobs and say
so in their headers: `applied-force-1d` is built so the debug dropdown's ±25 N
step lands exactly on breakaway; `applied-force-2d` is built so the angle
slider produces motion you can SEE.

Verification: `tsc` clean on all touched files; `npm run lint` at the known
baseline (4 react-refresh context splits).

---

### Findings 2026-08-13 (cont.) — Bill measured the 2D fixture's breakaway at ~10°, and it corrects a conflation in the entry above

**Bill's drive, and his hand-calculation, both say ~10°** for the default scene
(m = 5 kg, µ = 0.8, F = 35 N), confirmed on BOTH engines. At θ = 10°:

```
N   = mg − F·sinθ = 49 − 35(0.1736) = 42.92 N
F_f = µN          = 0.8 × 42.92     = 34.34 N
F_x = F·cosθ      = 35 × 0.9848     = 34.47 N      → F_x just exceeds F_f
```

(His write-up says "horizontal applied force = F·sin10" — a slip for `cos`; the
number he quotes, 34.5 N, is the cosine. Same conclusion.)

**He is right, and the previous entry's framing was wrong.** It said the crate
"breaks loose as you raise the angle toward ~39°", which silently conflated two
different angles. Solving `F ≥ F*(θ) = µmg/(cosθ + µ·sinθ)` for fixed F gives a
WINDOW, not a threshold:

```
cosθ + µ·sinθ ≥ µmg/F   ⇔   √(1+µ²)·cos(θ − arctan µ) ≥ µmg/F
```

which for F = 35 N is **θ ∈ [9.65°, 67.67°]**. Three distinct angles, and only
the first is a breakaway:

| angle | what it is |
|---|---|
| **9.65°** | **BREAKAWAY** — the crate is stuck at 0° and lets go here. What a student finds first. **NOT arctan µ.** |
| **38.66°** | **MAXIMUM ACCELERATION** (1.12 m/s²). `arctan µ` minimises the REQUIRED force, so at fixed F the surplus `F − F*(θ)` peaks here. Not a threshold at all. |
| **67.67°** | **RE-STICKS** — the horizontal component dies faster than friction does. |

Measured, 3 s of pull, dx in metres:

| θ | 0° | 9° | 9.72° | 15° | 38.66° | 60° | 67.6° | 70° |
|---|---|---|---|---|---|---|---|---|
| Rapier | 0.005 | 0.022 | 0.102 | 1.799 | 5.081 | 2.314 | 0.046 | 0.018 |
| Planck | 0.000 | 0.000 | 0.023 | 1.670 | 5.063 | 2.295 | 0.023 | 0.000 |

Analytic edges 9.65° / 67.67°; the sub-threshold millimetres on Rapier are its
compliant-friction creep, not motion (see the breakaway-criterion note in
`GIST_Physics_System_Topics.md`).

**Why this matters beyond a comment fix:** the window is a BETTER lesson than
the one the fixture was built for. "Tilt a little and it lets go; tilt more and
it accelerates hardest around 39°; tilt too far and it stops again" is a
two-edged investigation with an interior optimum — and the optimum is
observable as *fastest*, not as *starts moving*. The fixture header now names
all three angles and warns against exactly the conflation it used to make. The
prompt's phrasing was already correct and is unchanged — it says `arctan(µ)` is
the angle that makes the sled *easiest to pull*, which is the F*-minimising
statement, not a breakaway claim.

**Generalisable:** a threshold expressed as "the value at which X starts" and an
optimum expressed as "the value at which X is cheapest" are different animals,
and a fixed-input sweep turns the second into a RANGE bounded by two instances
of the first. Worth checking any future fixture comment that says "breaks away
at" against a fixed-input sweep rather than against the minimiser.

---

### Findings 2026-08-13 (close-out) — straggler sweep after the Phase 2 commit

A deliberate pass for work the main entries implied but did not land. Four
items; one was a live bug.

#### 1. LIVE BUG — polar held-state was seeded for `velocity` only

`JsonSimulation` seeds `heldVectorStateRef` from polar-AUTHORED vectors so an
authored direction with zero magnitude (`{magnitude: 0, angle: 30}`) survives
normalization to `{x: 0, y: 0}` — otherwise the first magnitude-slider drag
launches along angle 0 instead of the authored direction. That effect covered
**`velocity` only**, and extending polar authoring to `acceleration` and
`appliedForce` left it behind.

Concretely: author `appliedForce: {magnitude: 0, angle: 30}` with a strength
slider defaulting to 0, drag it up, and the crate is pushed **horizontally**
rather than at 30°. Now loops over all three polar-authorable bases. One loop
serves them because all three scale their magnitude by the length unit (force
carries a length dimension too).

**The shape of this miss is worth naming, because it is the second instance in
one session:** extending a field-level capability (polar authoring) requires
finding every place that ENUMERATES the fields it applies to. `checkChapterSplit`
was the first (it tested `.x`/`.y` on a value that might now be polar); this
seeding effect is the second. Both were single-field lists that silently became
incomplete. A grep for the OLD field name (`velocity`) next to the new capability
finds them; a grep for the new field name does not.

#### 2. Lifecycle — the `body.velocity = {...}` trap is FIXED, entry retired

Parked earlier the same day with "mark the interface members `readonly`" as the
preferred fix. Landed: `PhysicsBody.position` and `.velocity` are now `readonly`
in the INTERFACE (the concrete wrappers always were), carrying a docstring that
explains the accessor. `tsc` is clean, so no caller legitimately reassigned —
the check the parking-lot entry asked for. **Entry deleted from
`parking_lot.md`** per the holding-pen discipline: it had a clear, cheap fix, so
it graduated rather than accumulating. The rationale lives at the seam now,
where the next person meets it.

#### 3. Superseded rationale linked, not overwritten

`Notes_on_Air_Resistance_Refactor.md` still presented its `baseMass` fix as the
resolution of the Rapier mass setter. It is now marked SUPERSEDED with a
forward link and, more usefully, **an account of why its verification passed on
a broken setter**: that entry's observable was *oscillation between repeated
calls*, and a no-op is perfectly stable — it never oscillates. A test that only
watches for instability cannot see a value that never changes at all.

#### 4. Stale in-app doc summaries

`DocsIndex.tsx` still summarised this note as "Per-frame impulse = F·dt" — the
rule superseded 2026-08-09 — and `AppOverview.tsx` described applied forces
without `onPreStep` or the now-shipped schema field. Both updated. This is the
third distinct surface carrying that superseded rule (after `types.ts` on 08-10
and `RuntimeLoop.tsx` earlier today), which retires the last of them.

Verification: `tsc` clean on all touched files (`da.ts` locale typing is the
known baseline); `npm run lint` at the known baseline (4 react-refresh context
splits).
