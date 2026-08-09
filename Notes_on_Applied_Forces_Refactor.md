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
