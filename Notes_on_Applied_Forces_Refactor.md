# Notes on Applied Forces Refactor

Status: design notes for review (not yet implemented).
Scope: Planck and Rapier adapters.
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

1. **Force vs impulse semantics in the JSON.** Schema says "force in N" (pedagogical); implementation translates to impulse internally. User-facing units stay clean. Lean: keep this.
2. **Off-center forces (torque from a force).** PhET Basics doesn't need them — bodies are translation-only on flat ground. Defer `applyImpulseAtPoint` until a sim actually needs torque-from-force.
3. **`frictionStatic` field — alias or remove?** Done: **removed** from `BodyDef` + schema + prompt (2026-05-11). The principled `μs / μk` story will return as part of the opt-in `frictionDemo` mode (see the Static-friction demo section), not as a per-body field that's silently a no-op for ordinary sims.
4. **Camera follow / scrolling background.** Not a physics concern — separate UI work; flag for whoever owns the canvas/viewport code.
5. **Per-body `applyForce` (truly continuous) vs impulse-per-frame.** Stick with impulse. Revisit only if a sim shows visible artifacts at 60 Hz.

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
