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
