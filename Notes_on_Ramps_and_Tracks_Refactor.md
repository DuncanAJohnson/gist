# Notes on the Ramps & Tracks Refactor

This is the environment-shapes doc the expanded generator charter promised
(Notes_on_Concave_Colliders_Refactor.md, Findings 2026-07-10, decision 5:
the generator becomes a tool for "custom compound shapes AND
environment/background shapes … opens its own doc when that work starts").
That work starts here, with the **ramp generator**.

## Background

**Curriculum drivers (Bill, 2026-08-05).** A ramp/inclined-plane generator
serves five threads at once:

1. **1D accelerated motion in a rotated coordinate system** — constant-a
   kinematics along the incline; first named customer of the parked
   rotated-basis door in vector-component decomposition (the schema describe
   string already says "a rotated basis (incline plane) is not yet
   supported").
2. **2D motion** — ramp-to-launch handoffs (incline → projectile).
3. **Newton's laws** — net force on a body on an incline; the FBD workstream's
   normal + friction forces (Goal-1 steps 3+5) get their canonical stage here.
4. **Friction** — breakaway at `tan θ = µ_s`, sliding at
   `a = g(sin θ − µ cos θ)`; the needed substrate for future static/kinetic-µ
   work (PHYSICS_SHAPES.md S0.1, S0.4).
5. **Work & energy** — GPE→KE conversion, `v = √(2gΔh)`, work along the
   surface (energy-chapter openers; precursor to Rung 1's S1.0/S1.3).

**Ramps vs tracks — the scoping line.** A straight incline needs no joints,
no chains, no curvature: it is one static convex triangle. The **track
generator** (rolling hills, coasters, loops — Rung 1) needs polyline/chain
surfaces, ghost-vertex handling, energy-drift measurement, and eventually the
contact-vs-path-constraint decision (PHYSICS_SHAPES.md Rung 1 shared-topic
box; J7). Tracks are a SEPARATE future slice; this doc holds the seat for it
but everything below is straight-incline scope.

## Recommended approach

A parametric factory, `makeRamp` in [src/lib/ramp.ts](src/lib/ramp.ts),
mirroring `makeOpenContainer`'s contract exactly: synthesize BOTH manifest
halves (flat-fill SVG sprite + `type:"polygon"` collider in the sprite's own
viewBox coordinates) from one right-triangle outline, register session-side
via `registerImportedRenderable`, return `{ object, dims }` where the object
fragment drops straight into a sim's `objects` array. The collider spans the
FULL viewBox, so the width × height box IS the physical extent and grounded
seating is exact (`centerY = groundLevel + rise/2`). The triangle is convex:
`decomposePolygonShape` returns a single 3-vertex part — trivially under
Planck's 12-vertex cap.

Plus `seatOnRamp(ramp, s, objHeight)` — the incline case of the
twice-recorded "seat this object on that surface" placement-helper seed
(concave note Findings 2026-07-10 decision 4 "generalizes to angled ramps";
2026-07-19 `container.angle` wishlist entry). It returns the flush pose
`{x, y, angle}` for a body resting `s` config-units down-slope from the
crest, offsetting the center by `objHeight/2` along the outward surface
normal and tilting to the signed surface angle. Works for boxes (face flush)
and circles (`objHeight/2` = radius) alike. Authors never hand-solve
trigonometry for a start pose again.

## Schema additions

**NONE in v1 — deliberately** (three-places rule: a capability in code but
not schema+prompt is "not landed", and that is the intended state). The
JSON-authoring slice is phase R3 below and mirrors container Phase 4: an
optional `ramp` field on ObjectConfig expanded at the ingestion seam
alongside `containerExpansion.ts`.

## Implementation touchpoints (v1, built 2026-08-05)

- [src/lib/ramp.ts](src/lib/ramp.ts) — `makeRamp` + `seatOnRamp`.
- [src/simulations/RampSlideSimulation.tsx](src/simulations/RampSlideSimulation.tsx)
  → `/simulation/ramp-slide` — S0.1 box on 30° incline, µ = 0.25 both
  surfaces; `a = g(sinθ − µcosθ) ≈ 2.78 m/s²` read off the speed graph.
- [src/simulations/RampEnergySimulation.tsx](src/simulations/RampEnergySimulation.tsx)
  → `/simulation/ramp-energy` — frictionless 35° incline, high side RIGHT
  (exercises the mirrored geometry), GPE→KE, foot speed `√(2gΔh) ≈ 5.9 m/s`.
- [src/App.tsx](src/App.tsx) — two routes.

## Phased rollout

> Status as of 2026-08-06 (see dated Findings for the full chronology):

- **R1 — factory + exhibits — 🟢 SHIPPED 2026-08-05** (headless-verified;
  first-drive name-collision bug fixed same day).
- **R2 — drive gate — 🟢 PASSED 2026-08-06** (folded into SO-B: drag-snap,
  resize re-seat, clamp; Bill).
- **R3 — JSON `ramp` + `seatOn` + ramp-dimension sliders — 🟡 LANDED in
  code 2026-08-06, deploy gate pending.** Three places moved together
  (schema + regenerated JSON schema + prompt pipeline + docs); seam =
  `objectExpansion.ts` (ramps → containers → seatOn riders + slider
  param-overrides). Gate rounds 1–2 passed via `modal serve` (velocity
  seeding + friction accessor fixes in round 1); ramp-dimension sliders +
  velocity-rides-the-ramp confirmed on local drive; round 3 serve-tested
  2026-08-06 evening (tilt-until-slip validated to ~1%; steepness remix
  exercised — surfaced the Max-rule masking finding, handled via the
  seat-friction-masked diagnostic, prompt HELD). 🟢 **SHIPPED 2026-08-06**
  — Bill ran `modal deploy` (working tree = final round-3 state); future
  dev drives are the ongoing validation surface (issues found there come
  back here as findings).
- **R4 — rotated-basis + FBD convergence.** Incline components (vₓ′/v_y′
  along/normal to surface) through the parked rotated-basis door; normal +
  friction force arrows once FBD steps 3+5 land — the incline is their
  canonical demo and the closure-gate stress test.
- **R5 — tracks.** Own workstream, likely its own doc section or file;
  chains/polylines on STATIC bodies (invariant #7 forbids them on dynamic
  bodies only), energy-drift harness first (PHYSICS_SHAPES Rung 1 box).

## Design rationale (v1 decisions)

1. **Static, axis-aligned geometry — the angle lives in the triangle, not in
   body rotation.** The ramp body never rotates; the incline angle is baked
   into the synthesized outline. No seating arithmetic against a rotated
   rectangle, no rotated-collider edge cases. `isStatic: true` in the
   returned fragment (a future dynamic-wedge sim can override the field, but
   that's a two-body problem for a later curriculum slice).
2. **Parameterization: any two of `{angle, rise, run, slopeLength}`.**
   Teaching-natural — energy problems speak in rise (mgh), kinematics in
   slope length (d = L), geometry in rise-over-run. Angle is authored in
   DEGREES (the authoring-surface convention; env angleUnit default).
   Documented derivation priority; over-specified inputs warn when
   inconsistent (derived wins).
3. **Diorama-scoped angle clamp [5°, 80°]** (angle-authored path): below ~5°
   the triangle is a degenerate sliver, above ~80° it's a wall. Warn +
   clamp, mirroring the container wall-thickness clamp. The rise+run path
   warns without clamping (authored geometry is kept literally).
4. **Ramp friction defaults to 0** — the phantom-friction lesson, applied
   forward: both engines run the Max coefficient-combine rule, so static
   geometry with a nonzero default would silently out-friction every
   slipperier payload (the Phase-1 walls bug, avoided by construction).
   Recommended authoring: set the SAME µ on ramp and payload.
5. **Grounded-only in v1.** `centerY = groundLevel + rise/2`, always seated.
   A floating ramp isn't a curriculum object; no `mode` param until a sim
   needs one.
6. **`highSide: 'left' | 'right'`** with 'left' default (crest left, payload
   slides toward +x — reading direction). The mirrored case is real code
   (different outline, signed surface angle) and is exercised by the
   ramp-energy exhibit and the harness.
7. **`dims.surfaceAngle` is SIGNED RADIANS** — drop-in for raw
   `ObjectConfig.angle` (which is radians while factory `angle` is degrees;
   a known wrinkle inherited from the schema, noted in the API docs).
8. **Gist-staged, three places untouched** — same staging discipline as
   container v1.

## Out of scope (v1)

- Curved/multi-segment surfaces (tracks — R5).
- Dynamic wedges (block-on-sliding-wedge two-body problems).
- Flat crest platform / run-out ledge on the ramp itself (compose with a
  plain static box meanwhile).
- A friction slider — `controls[]` property paths cover kinematics only;
  a `friction` control is a separate controls-surface decision.
- ~~A live `ramp.angle` control~~ **BUILT same day** — see the
  "ramp-dimension sliders" findings entry below. (The physics note stands:
  stick/slide is fully emergent from the engines' Coulomb-cone solve — GIST
  scripts nothing; engines model a single µ (µs = µk), so the threshold
  measures one number and near-threshold behavior creeps rather than
  snaps.)
- Static vs kinetic µ split — engines carry a single friction coefficient;
  the split is its own future workstream (the ramp is its substrate).

## Open questions

- ✅ **Generalized seating — `seatOn: "<any object id>"` (raised 2026-08-14) —
  DISCUSSED AND MOVED OUT the same day. SUPERSEDED by "Object-to-object relative
  positioning," `GIST_Physics_Wishlist.md` §1.** The lead-off discussion
  happened; its outcome was that the idea does not belong to this workstream.
  Stacking promoted it, but the general case is *any* t = 0 pose expressed
  relative to another object — a rack of billiard balls, three rocks whose
  bottoms start level for a Galileo drop, two bodies whose centers of mass sit
  on one line for a top-down 1D collision, "two carts 3 m apart." Only the first
  of those is seating at all, and three of them derive ONE axis while leaving
  the other authored, which `seatOn` cannot express. Bill also invited a rename
  (`seatOn` implies support-contact). **All five design questions raised here
  migrated intact to the wishlist entry** — start-pose-vs-constraint, which
  surface for an irregular collider, ordering/chains/cycles, the collider-inset
  and initial-overlap hazard, and the field name — where they are joined by the
  ones the wider framing raised. Ramps keep `seatOn: "<ramp id>"` as shipped
  sugar regardless: it derives an ANGLE, which no alignment relation does.
- **Pair-friction disclosure shipped 2026-08-26 (bears on the held
  friction-representation question, T11).** ⇧-click info boxes
  (`InfoBoxes.tsx`, gesture in `EditOverlay.tsx`) show any two targets'
  µ / e and the pair's EFFECTIVE contact values under the max rule, naming
  which body governs — walls included (zero material). The hold is NOT
  resolved by this; it is made observable, which is the precondition. See
  `Notes_on_Applied_Forces_Refactor.md` Findings 2026-08-26.
- **Angle units at the JSON seam (R3).** The factory takes degrees; raw
  `ObjectConfig.angle` is radians; env `angleUnit` exists. When the `ramp`
  field lands, should its angle respect `angleUnit` (unit-preservation
  invariant #10 pull) or stay fixed-degrees like the rest of the authoring
  surface? Decide at R3 scoping.
- **Seating payloads from JSON.** `seatOnRamp` is TSX-only; a JSON-authored
  sim can't compute a flush pose. Options at R3: a `seatOn: <rampId>` +
  `s` param on payload objects (the placement-helper seed grown to a schema
  affordance), or leave JSON payloads to author x/y/angle directly. The
  slope-following `grounded` regime (concave note 2026-07-19 entry) is the
  same design space — decide them together.
- **Ramp + container composition** (wagon rolls down ramp into…): nothing
  blocks it today in TSX; worth a composed exhibit before R3 to catch
  interaction surprises.
- **How GIST represents friction to users and the LLM (HELD, Bill
  2026-08-06).** µ is physically a property of a surface PAIR; the engines
  fake it with per-body coefficients + the Max combine rule, and the
  authoring surface inherits that fiction — the remix drive showed the LLM
  reaching for "more friction" by raising the SURFACE's µ (0.6) over a
  slider-governed rider (0.4), silently deadening the slider below 0.6.
  Deliberately NOT patching the prompt further: the fix is a representation
  decision (pair-friction authoring? one-owner convention enforced at the
  seam? surface-µ read-only?) that belongs with the future static/kinetic
  pair-friction workstream. Interim: the `seat-friction-masked` diagnostic
  (below) makes the masking visible whenever it occurs.

  **UPDATE 2026-08-09 — hold RE-AFFIRMED, scope narrowed, instrument
  broadened, and the FORCING FUNCTION now named** (applied-forces session,
  item #5; full lay-out in `Notes_on_Applied_Forces_Refactor.md` Findings
  2026-08-09 item #5).
  - **Scope is narrower than it read.** Walls are created at friction 0 on
    BOTH engines (Rapier explicitly; Planck via `material.friction ?? 0`),
    and an unauthored object also gets 0 (`ObjectRenderer.tsx:44`
    destructuring default). Since both engines combine as Max,
    `max(0, mover's µ) = mover's µ` — **the one-owner convention is already
    the de-facto default.** The bug REQUIRES someone to author µ on another
    body. B5 (crate on a floor, friction switch) therefore needs no
    representation decision to be built.
  - **Instrument broadened (Bill's call): `checkFrictionSliderMasking`
    SHIPPED** (`objectExpansion.ts`, called from JsonSimulation inside the
    bus-cleared window). Fires `friction-slider-masked:<targetObj>` when a
    friction slider's target is out-µ'd by **ANY other object in the sim —
    explicitly not just static ones.** Bill's rationale: we cannot know at
    config time which bodies will touch, and guessing from geometry would be
    a contact inference the seam has no business making; the rule this
    encodes is a dev-facing EXPECTATION — *while exploring forces, the
    friction slider's value should be the operative µ for all object
    interactions in the scene.* The broad net deliberately sets the stage for
    the pair-friction discussion rather than pre-empting it. Distinguishes
    "dead from min to X" from "does NOTHING anywhere in its range"
    (µ ≥ slider max). This SUPERSEDES `seat-friction-masked` in coverage —
    that one only ever saw the declared seatOn pair — but both stay: seatOn
    is a real contact and reports the delta.
  - **FORCING FUNCTION (this is the part to schedule against): the
    representation question must be RESOLVED before G6-with-friction ships.**
    `PHYSICS_GRAPHS.md` G6 asserts *"E_total decays and the deficit equals
    work done by friction"* — a QUANTITATIVE claim the student checks against
    µ·N·d. If contact µ isn't the µ on the slider, that arithmetic simply
    fails, and G6 is flagged ⭐ the single most curriculum-central graph for
    ages 10–18. The subtler half: G6's dual duty as a SOLVER-DRIFT diagnostic
    on frictionless scenes assumes you can be certain a scene IS frictionless
    — under Max masking, authoring µ = 0 on the mover doesn't guarantee it,
    so numerical drift and unintended friction become indistinguishable.
    FBD step 5 (analytical friction needs a defensible contact µ) is the
    second forcing function; they should be resolved together.

## Findings 2026-08-05 — v1 BUILT + headless-verified (factory, seat helper, two exhibits); pending Bill's drive (R2)

Scoped and built same-day, container-v1 style. All numbers from the tsx
harness (Planck-only; Rapier is drive-verified per adapter practice):

- **Geometry/seating:** all four param-pair resolutions agree; grounded
  seating exact; `seatOnRamp` pose matches hand trig to 1e-3 on both
  left-high and mirrored ramps.
- **Collider chain (the real runtime path):** registered manifest item →
  `scaleManifestColliderToShape` (per-entry viewBox) → `decomposePolygonShape`
  → ONE convex 3-vertex part. Over-cap guard silent, as constructed.
- **Planck dynamics, adapter-driven at 1/240 s:** frictionless 30° slide
  measured `a = 4.900` vs `g sinθ = 4.900`; µ = 0.25 measured `2.778` vs
  `2.778`; µ = 0.7 > tan 30° holds statically (|v| < 1e-4 after 1 s — Box2D's
  single-µ friction supports the stick regime); mirrored ramp slides −x at
  the same magnitudes; the block never penetrates the surface (normal-offset
  monitored every step).
- **Harness gotcha worth recording:** first run seemed to show a ~2 m/s²
  acceleration deficit — it was the HARNESS mis-reading the registered
  entry's `viewBox` (an `{width, height}` object, not an array), which sent
  `scaleManifestColliderToShape` to its 64×64 default and built an 18.4°
  mega-ramp. The measured `g sin(18.4°) = 3.10` matched the "wrong" value
  exactly — the physics was perfect on the wrong slope. Diagnostic pattern
  to remember: an incline behaving like a shallower incline means the
  collider scale, not the solver.
- **Three-places status:** schema ✅ untouched by design, prompt ✅ untouched
  by design, docs ✅ this file + RefactorRoadmap node. PHYSICS_SHAPES S0.1
  stays unchecked until the R2 drive passes.

### Findings 2026-08-05 (later) — first drive: cross-sim renderable name collision found + FIXED; stale-seat observation seeds the "pairing" design

**Bug (Bill's drive, screenshot evidence): ramp-slide rendered MIRRORED
(crest right, box floating mid-air, tilt "wrong"); ramp-energy perfect.**
Root cause was not coordinate spaces — it was a **renderable name
collision**: both exhibit sims called `makeRamp({ id: 'ramp' })` at module
scope, both modules are eagerly imported by `App.tsx`, so both registered
the name `ramp-ramp` at startup and the LATER import (ramp-energy) won —
the documented last-registration-wins semantic of
`registerImportedRenderable`. Ramp-slide then looked up the energy ramp's
high-side-RIGHT outline (sprite AND collider) stretched into its own
4.33×2.5 box; the box's seat pose (computed from the correct module-local
`dims`) hung over the mirrored collider and fell, tumbling. Everything in
the screenshot is that one cause; the seating math itself was right.
**Fix:** unique ids (`slideRamp`, `energyRamp`).

**Standing gotcha (applies to makeOpenContainer too):** module-level factory
calls in statically-imported TSX sims share ONE session-global renderable
namespace (`ramp-<id>` / `container-<id>`). Factory ids must be unique
ACROSS sims, not just within one. The container exhibits obeyed this by
accident (cup/box/wagon). The harness missed it because it used unique ids
per call — a same-name two-sim case is now a known hole in headless
coverage. Note: the JSON `container` path does NOT share this exposure the
same way (expansion runs per-mount, one sim at a time, and re-registers on
signature change); it is specifically the import-time TSX pattern.

**Second drive observation (expected, but it names the next design): the
seat pose is a one-shot config value.** Bill drag-stretched the energy ramp
longer → the seated ball was left embedded in the new geometry (screenshot
3). `seatOnRamp` output is baked x/y/angle; nothing re-derives it when the
ramp changes. This is the concrete motivation for the **pairing / `seatOn`**
design (Bill, same session): a declared object↔surface relation where y and
angle become DERIVED from authored x at expansion time — see the R3 open
question, now upgraded to a scoped design discussion.

### Findings 2026-08-05 (later still) — `seatOn` slice SCOPED (Bill's GO after the pairing discussion)

**The ratified frame (Bill):** `seatOn` is a **start-pose / edit-time
relation** — that scoping line is what earned the name. Friction pairing
(µ defined per surface PAIR — the physically honest model; engines' per-body
coefficient + combine rule is the fake) and joint pairing are **runtime-
persistent relations**: a different family, explicitly NOT built here. When
the second runtime-pair customer lands (J1 or pair-friction), that is the
moment to decide whether a general relations section subsumes `seatOn`.
Bill's pairing framing was always aimed at R3 (JSON authoring) — R1's
`seatOnRamp` TSX export stays as the primitive the seam calls internally.

**Decisions (SO1–SO7):**

1. **SO1 — Name + semantics.** `seatOn`, start-pose/edit-time only. At
   t > 0 physics is untouched — departure from the surface stays emergent
   contact physics (the Rung-1 lesson). No per-frame enforcement, ever.
2. **SO2 — Authoring shape.** On the RIDER object: `seatOn: "<rampId>"`
   (string, v1). The rider authors `x` only; `y` and `angle` are DERIVED.
   Authored `y`/`angle` alongside `seatOn` → derived-wins + diagnostics-bus
   entry (container `derived-wins` precedent). Velocity stays authored and
   world-frame (a "speed along slope" convenience is out of scope; noted).
   Door open to an object form `seatOn: {surface, …}` if params accrue.
3. **SO3 — Derivation timing.** At the expansion seam, on EVERY
   re-expansion (live config-state truth semantic, same family as the
   diagnostics bus). Two-pass ordering: surface objects (`ramp`, and
   `container` as today) expand first, riders seat second. Drag-snap falls
   out for free: the editor persists the dragged `x`, re-expansion
   re-derives `y`/`angle` — no snap logic in the editor. Ramp resize
   re-seats riders (kills the screenshot-3 class).
4. **SO4 — Off-span policy.** Seat x clamps into the surface span
   [crest.x, foot.x] + diagnostics-bus entry. Dragging past the foot parks
   the rider at the edge; removing `seatOn` frees it.
5. **SO5 — Seatable surfaces, v1.** Ramp objects only. Generalizing to
   arbitrary polygon tops / sloped ground is the slope-following +
   env-shapes future (same design space as the container 2026-07-19
   wishlist entry; decide together).
6. **SO6 — Seam architecture.** One expansion entry point orchestrating
   ordered passes (containers → ramps → seatOn riders → completeness
   check), generalizing `containerExpansion.ts`'s pattern (per-id signature
   cache, defensive drops, bus warnings) rather than a second parallel
   seam. Implementation naming (extend vs. new `objectExpansion.ts`)
   decided in-build.
7. **SO7 — Dangling references.** `seatOn` naming an unknown/renamed id →
   diagnostics-bus entry, rider passes through un-seated (authored y or
   drop-if-incomplete per existing rules). Interacts with the objectIdGuard
   rename backstop: a runtime-renamed duplicate id can orphan a `seatOn`
   ref — the bus entry is the surface for that, not silent failure.

**Phasing:**

- **SO-A — seam mechanics, gist-staged.** `ramp` + `seatOn` fields expanded
  at the seam; LOCAL JSON sims only (asLocalSimConfig casts — no runtime
  Zod, so local sims can carry the fields with schema/prompt untouched).
  Convert the two exhibits to JSON-authored living exhibits (CupCatch
  precedent). Headless: two-pass ordering, clamp, dangling-ref, cache.
- **SO-B — drive gate (Bill).** Drag-snap feel on both exhibits: drag the
  rider (x moves, snaps flush), resize the ramp (rider re-seats), drag past
  the foot (clamps + badge). Plus the outstanding R2 re-drive of ramp-slide
  post-collision-fix — one drive session covers both.
- **SO-C — three-places landing.** Schema (`ramp` on ObjectConfig +
  `seatOn`) + `generate:schema` + prompt teaching + docs, CC5-style gate
  (modal serve generate/remix, deploy, prod validation). Open question
  carried to SO-C scoping: `ramp.angle` units in JSON (fixed degrees vs
  `angleUnit`, invariant #10 pull).

### Findings 2026-08-05 (session close) — SO-A BUILT + headless-verified; exhibits converted to JSON living exhibits; pending the SO-B drive

Built same-session after the scoping:

- **[src/lib/objectExpansion.ts](src/lib/objectExpansion.ts)** — the unified
  seam entry point (`expandObjects`), three ordered passes: ramp-field
  expansion (delegates to makeRamp; per-id signature cache, derived-wins +
  not-static + synthesize-failed bus entries) → the existing container pass
  unchanged (still the completeness gate) → seatOn rider pass (`seatAtX`:
  x-preserving flush pose, off-span clamp + bus, dangling-ref bus with
  authored-y passthrough / no-y drop). JsonSimulation's expansion memo now
  calls `expandObjects` (one-line swap; dedupeObjectIds + bus-clear
  unchanged). `AuthorableExtras` in objectExpansion.ts is the ONE documented
  pre-schema typing site for `ramp`/`seatOn` (they ride the asLocalSimConfig
  cast until SO-C).
- **SO2 amendment (in-build):** authored y/angle on a seatOn rider are
  overridden SILENTLY, not bus-badged as originally scoped — the drag editor
  writes y back on every move, so a derived-wins badge would be permanent
  noise on any dragged rider. The bus reports only genuine problems
  (dangling ref, off-span clamp). Flagged for Bill's eyes; trivially
  flippable if the badge is wanted.
- **Exhibits converted** (CupCatch precedent): `rampSlide.json` +
  `rampEnergy.json` author `ramp` + `seatOn` compactly (riders author x
  only); the TSX wrappers are now 5-line JSON loaders, routes unchanged.
  `seatOnRamp` stays exported as the R1 TSX primitive.
- **Harness (22 checks, all green):** ramp-field expansion completeness;
  seatOn pose ≡ seatOnRamp on both orientations (x preserved exactly);
  silent y/angle override; off-span clamp + bus key; both dangling-ref
  behaviors + bus keys; signature-cache identity (repeat expansion reuses
  the registered entry, param change re-registers); **container rider on a
  ramp** (wagon-on-ramp: container expands first, then seats flush at the
  surface angle — the pass ordering is load-bearing and verified); and the
  actual rampSlide.json expanded through the seam into Planck slides at
  a = 2.778 vs 2.778 predicted.
- Tolerance note: `dims.surfaceAngle` is factory-rounded to 4 decimals
  (≤5e-5 rad ≈ 0.003°) — assert against it at 1e-4, not 1e-6.
- **Next:** SO-B drive (Bill) — drag-snap feel, ramp-resize re-seat,
  past-the-foot clamp + badge, plus the outstanding ramp-slide re-drive
  after the name-collision fix. SO-C stays gated on it.

### Findings 2026-08-06 — SO-B drive round 1: two edit-loop gaps found + FIXED (stale snapshot on run; ramp resize reverted by derived-wins)

Bill's first SO-B pass: **drag-snap works and is "exactly the UI I want"** —
but (1) running without Save started the rider from the RAW dragged pose,
and (2) resizing a ramp by its handles "didn't take" (move worked, resize
snapped back to the JSON values).

**Item 1 — stale initial snapshot.** `commitObjectEdit` wrote the raw
committed pose onto the live body and called `recaptureInitialSnapshot()`
IMMEDIATELY — before the commit's re-render ran the seam. The seam then
re-seated the rider and the ObjectRenderer rebuilt the body at the seated
pose (the snap Bill saw), but play/reset restored the pre-seam snapshot.
For ordinary objects commit == expansion output, so the immediacy was
invisible until seam-derived poses existed. **Fix:** commits also arm the
existing deferred-recapture flag (`pendingRecaptureRef`), which fires after
`siObjects` changes and the child ObjectRenderer effects rebuild bodies —
same one-commit-deferred pattern add/remove already used. General lesson:
**any commit whose expansion output can differ from the raw commit must
recapture AFTER the seam runs, not at commit time.**

**Item 2 — edit back-feed (`applyEditCommitToObject`,
[objectExpansion.ts](src/lib/objectExpansion.ts)).** The resize commit wrote
width/height onto the ramp object; next expansion's derived-wins reverted
them (correctly, by SO2's rules — the bug was the commit's shape, not the
seam's). The fix is the INVERSE mapping, and the full-viewBox contract makes
it exact: a ramp's AABB IS run × rise, so a handle resize back-feeds
`ramp.run = width, ramp.rise = height`, DROPS the now-stale
angle/slopeLength (angle becomes derived), keeps highSide/fill/stroke, and
never writes raw width/height/y. A pure move rewrites x only. Ordinary
objects take commits verbatim. `commitObjectEdit` routes every commit
through it, so Bill's "edit earns a win until saved" contract holds: the
resize lives in editedConfig's ramp PARAMS immediately (physics + riders
re-derive), and Save persists those params to JSON — the saved file stays in
compact authoring form.

Headless (soB harness, all green): move preserves params; resize back-feeds
+ drops stale members + keeps extras; re-expansion of the resized ramp lands
the new dims AND re-seats the rider flush at the new angle (the
screenshot-3 class exercised through the edit path). Build + lint at
baseline. **Awaiting SO-B round 2.**

### Findings 2026-08-06 (later) — SO-B drive PASSED (Bill); SO-C three-places LANDED in code same day; gate = modal serve + deploy (Bill)

**SO-B gate passed** ("my tests all look good now") — drag-snap, ramp
resize via the edit back-feed, run-uses-what-you-see. That opened SO-C,
landed the same session. Three places moved together:

- **Schema** — `RampConfigSchema` + `ramp` and `seatOn` on ObjectConfig
  ([src/schemas/simulation.ts](src/schemas/simulation.ts)), describe strings
  teaching the two-of-four param rule, static/ground-seated semantics, the
  Max-rule friction guidance (µ < tanθ slides / > sticks), and seatOn as a
  START POSE. width/height/y describes updated to name the new exception.
  `npm run generate:schema` re-emitted `simulation_schema.json` (+52 lines).
- **Prompt pipeline** ([gist_instructions.py](modal_functions/gist_instructions.py))
  — shared preamble (TWO exceptions now); SKELETON fragment: `"ramp": true`
  flag bullet + example row + constraint line ("the ONLY alternatives to a
  manifest name"); FILL OBJECTS: new item 3 (ramp params, sizing, friction
  knob, seatOn authoring — later items renumbered 4/5/6) + example output
  entries for a ramp and a seated rider; legacy "a 'ramp' should be
  isStatic:true" advice replaced (inclines are never manifest-svg
  triangles now); ROUTER: ramp/seatOn edits route to "objects" (the
  showVectors-misrouting lesson applied proactively); REMIX OBJECTS
  preserves `ramp`/`seatOn`; `objects_fill.py` stage reminder extended.
- **Docs** — `/docs/authoring-json` gains the `ramp` + `seatOn` section
  (field table + exhibits); RefactorRoadmap RT2 PASSED / RT3 landed;
  PHYSICS_SHAPES **S0.1 checked implemented** (stopping-distance variant
  still open).

**SO-C decision executed — `ramp.angle` respects `env.angleUnit`** (the
open question from scoping): one rule for every authored angle, matching
`velocity.angle`. The seam converts via `env.angleScale` (the same
`angleUnitToRadians` multiplier scaleObjectToSI uses) before calling
makeRamp (whose TSX API stays degrees); angleScale joined the ramp
signature cache AND the expansion memo deps. `ExpansionEnv` grew to
`ObjectExpansionEnv` (+ angleScale). Consequence for invariant #10's future
unit-migration list: `ramp.angle` is an angle-family dimensional field.

**Type cleanup:** `AuthorableExtras` (the pre-schema typing site) retired —
`ramp`/`seatOn` are real ObjectConfig fields now; objectExpansion and
applyEditCommitToObject read them typed, no casts.

Verified headless (4 harnesses, 61 checks green — incl. new deg/rad
equivalence: angle 30 @ deg ≡ π/6 @ rad, identical triangle); build + lint
at baseline; Python syntax checked. **Remaining gate (Bill, CC5 pattern):
`modal serve` generate + remix ("ball rolls down a ramp", "make the ramp
steeper"), then deploy (invariant #11: deploy bundles the working tree) and
prod validation. The stage checkboxes flip to SHIPPED only after that.**

### Findings 2026-08-06 (gate round 1) — generate + remix respond well; car-on-hill exhibit exposes two slider gaps, both FIXED

Bill's `modal serve` gate: **"Both generate and remix responded to the
prompt well"** — the car-on-a-hill generation authored a correct
`"ramp": true` skeleton, a two-param `ramp` object, and a `seatOn` rider.
Two control-slider gaps surfaced from the same exhibit:

**1 — "Initial Speed Along Incline" slider launched HORIZONTALLY.** The LLM
authored the rider's velocity as cartesian `{x:0, y:0}`, which carries no
direction; the held-polar machinery (which exists precisely so a magnitude
slider on a resting body keeps a direction) seeds only from POLAR-authored
velocities, so the slider fell back to atan2(0,0) = +X. **Fix (seam):
seatOn now seeds direction** — an absent or cartesian-zero velocity on a
seated rider is rewritten at expansion as polar zero aimed DOWN-SLOPE
(−θ for highSide left, θ−180° for right, emitted in the env angleUnit).
Explicit polar authors (any magnitude — up-slope launches included) and
non-zero cartesian velocities are untouched. Consequence: a
`velocity.magnitude` slider on a seated rider IS an "initial speed down the
incline" control with zero authoring — the LLM's existing output shape now
behaves correctly with no arithmetic asked of it.

**2 — the µ slider was a SILENT NO-OP.** The LLM invented
`property: "friction"` (not in the valid list); `setNestedValue` wrote
`body.friction` onto a wrapper property no engine consumed —
**PhysicsBody had no friction accessor.** Fix (adapters): `friction`
get/set added to the PhysicsBody contract and both engines — Rapier
iterates colliders (`setFriction`; contacts re-evaluate materials per
step); Planck iterates fixtures AND refreshes already-live contacts with
the max rule, because **Box2D stamps a contact's friction once at
contact-begin and keeps it for the contact's lifetime** — without the
refresh, a pre-play slider write never reaches a body already resting on
the surface (verified: µ written onto a live resting contact produces
a = 2.778 vs 2.778 analytical). `friction` is now IN the FILL CONTROLS
valid list, with the pairing rule taught: **for a µ slider, author the
ramp's friction 0 and bind the slider to the RIDER** — the Max combine
rule then makes the slider value the contact's µ across its whole range
(Bill's exhibit had ramp µ 0.15 + slider min 0: the bottom 0.15 of the
slider range would have silently done nothing).

Prompt additions (same session): FILL CONTROLS friction-slider bullet +
seated-rider speed-slider bullet (label "down the incline"; up-slope =
explicit polar author); FILL OBJECTS ramp item updated to the
slider-aware friction pattern. Harness #5 (7 checks green): all four
velocity-seeding cases + mirrored, and the live-contact friction write on
Planck. Build + lint at baseline. **Prompt + runtime changed → gate round
2 (re-serve both apps) before deploy.**

### Findings 2026-08-06 (gate round 2 + ramp-dimension sliders) — round 2 PASSED (velocity-along-ramp works); expansion-aware ramp sliders BUILT (three places)

**Gate round 2 passed** (Bill: "velocity along the ramp works with the
slider"). Bill's next ask — ramp dimensions on sliders — is the live-angle
seed from earlier the same day, now built as **expansion-aware controls**:

**Mechanism.** A slider bound to `ramp.angle` / `ramp.rise` / `ramp.run` /
`ramp.slopeLength` never touches a physics body. Its value flows into a
`rampOverrides` map (from controlValues) that
`applyRampControlOverrides` ([objectExpansion.ts](src/lib/objectExpansion.ts))
applies to the authored params AHEAD of `expandObjects` — re-expansion
re-synthesizes the triangle, re-registers the sprite, rebuilds the body,
re-seats riders, and re-aims their at-rest velocity; the replay cache
invalidates automatically because control values are already in the
frame-cache key, and `handleControlChange` short-circuits `ramp.*` paths
(no body write; arms the deferred snapshot recapture). `controlValues`
moved above the expansion memo (its new dependency).

**The companion rule (the one real design decision).** A triangle takes
exactly two params, so an override replaces its own param and keeps the
FIRST-AUTHORED remaining one (priority angle > rise > run > slopeLength);
others drop. The author picks the slider's invariant by choosing what to
author: `{angle, slopeLength}` + angle slider = a fixed-length board being
TILTED (tilt-until-slip); `{angle, rise}` + rise slider = a hill growing at
fixed slope. Taught in the schema describe string, FILL CONTROLS, the
router ("let students change the ramp angle" = controls + objects), and
`/docs/authoring-json`.

**Exhibit upgraded:** `/simulation/ramp-slide` is now the
**tilt-until-slip µ-determination demo** — 5 m board, µ = 0.4 both
surfaces, authored `{angle: 15, slopeLength: 5}`, Ramp-angle slider 5–45°.
Below atan(0.4) ≈ 21.8° the block holds; past it, a = g(sinθ − µcosθ).
Reading the breakaway angle IS measuring µ.

**Headless (harness #6, 12 checks green):** companion-rule cases; board
length invariant under an angle override (run = 5cos θ exactly); rider
re-tilt + velocity re-aim + x preservation; exhibit holds at 15° and slides
at 1.505 vs 1.505 analytical under a 30° override. All six harnesses green;
build + lint baseline; schema regenerated; Python syntax checked.

**Gate round 3 (Bill):** re-serve both apps; try "let students change the
ramp's steepness" as a remix on the car sim and a fresh tilt-until-slip
generation. Then deploy → SHIPPED flips.

### Findings 2026-08-06 (drive) — ramp sliders confirmed (angle + rise, separately); velocity now RIDES the ramp-angle change (slider re-application on seam rebuilds)

Bill's drive confirmed both ramp-dimension sliders work. New finding: an
initial velocity dialed in via the speed slider kept its OLD direction when
the ramp-angle slider then changed the slope — the along-incline speed must
**re-project onto the new surface**.

**Fix — a general mechanism, not a ramp special-case: seam rebuilds
re-apply slider values.** A seam-driven body rebuild (ramp slider, edit
commit, add/remove — anything that arms the deferred-recapture flag) spawns
bodies from config state, dropping slider-held state entirely (the speed
slider's magnitude included). The deferred-recapture effect now re-applies
every non-`ramp.*` slider to the rebuilt bodies BEFORE recapturing the
snapshot. Because the held-polar direction re-seeds to the CURRENT
down-slope on every expansion (declared earlier in the component, so it
runs first), re-application aims the kept speed down the NEW slope: tilt
the ramp and the velocity arrow re-tilts with it, magnitude preserved.
Implementation: the body-write half of handleControlChange extracted as
`applyControlToBody`, shared by live drags and the rebuild path; `ramp.*`
sliders are skipped in re-application (their values are already inside the
expansion that caused the pass — re-applying would re-arm the flag).

**Boundary kept:** an EXPLICITLY authored polar velocity (config
`{magnitude, angle}`) still means what it says — it does not re-aim with
the ramp (world-frame author intent, the SO2 velocity rule). It is the
slider-held, seam-seeded direction that rides. React-effect-order-dependent
behavior → verification is Bill's drive, not headless. Build + lint at
baseline.

### Findings 2026-08-06 (evening) — tilt-until-slip VALIDATED to ~1% (µ measured 0.404 vs 0.4); remix friction-masking finding → representation question HELD, `seat-friction-masked` diagnostic SHIPPED

**The instrument works.** Bill's drive: no slide at 21.5°, slow creep at
22° — tan(22°) = 0.404 against authored µ = 0.4. Reading the breakaway
angle measured µ to about a percent, with the near-threshold creep
behaving exactly as the single-µ Coulomb-solve analysis predicted.

**Remix finding — Max-rule masking in the wild.** "Steeper and more
friction" produced a friction slider (good) but satisfied "more friction"
by setting the RAMP's µ to 0.6 over the box's slider-governed 0.4: the
contact runs at max(0.4, 0.6) = 0.6 and the slider is dead below 0.6. The
taught pairing rule (surface 0, µ on the rider) exists in FILL CONTROLS,
but the remix path didn't honor it. **Decision (Bill): HOLD the prompt** —
this is a symptom of the deeper representation question (per-body µ
presenting as a pair property), now an Open question above, homed with the
future pair-friction workstream.

**Interim diagnostic SHIPPED:** `seat-friction-masked:<riderId>` in the
seat pass ([objectExpansion.ts](src/lib/objectExpansion.ts)) — fires when a
seatOn rider's effective friction (authored or the 0 default, matching
ObjectRenderer's body-creation default) is BELOW its surface's, reporting
the delta (Bill's formulation: rider − surface, e.g. 0.4 − 0.6 = −0.2),
the effective contact µ, and the escape route. Silent when equal (the
fixed-lesson same-µ pattern) or when the rider governs (slider pattern).
seatOn is the declared contact pair, so this is live config-state truth —
squarely the bus's ratified semantic; it re-derives per expansion, so
fixing the JSON clears the badge. Harness (6 checks) green; build + lint
baseline. Note: the badge reflects AUTHORED friction — a friction slider
moved at runtime doesn't re-evaluate it (config truth, not runtime events;
consistent with the bus semantic). **Drive-confirmed same evening:** Bill
sees the badge in the debug panel's Diagnostics box on the remix exhibit.

---

### Findings 2026-08-14 — `seatOn: "ground"` SHIPPED (the flat-ground twin)

`seatOn` was ramp-only. It now also takes the reserved literal `"ground"`,
resting an object on the top of the bottom wall (y = 0 — `Environment.tsx`
builds that wall at `bounds.minY − thickness/2` with `minY = 0`, so its top face
is exactly the origin, which is also `makeRamp`'s `groundLevel` default; the two
therefore agree by construction).

**Why the field exists — the cause was misdiagnosed first.** Sim #1434 ("seat
the sled on the ground") came back with `y: 0` and the sled buried 0.17 m
through the floor. First read blamed the collider-inset trap. **Wrong**:
measured insets are millimetres (sled 5.4 mm, dynamics_cart 24 mm), and
`y = height/2` would have been fine. The real cause is that **the schema teaches
the `y: 0` placeholder idiom** — for grounded containers, ramps, and `seatOn`
riders, "author 0, the runtime derives it" — and the model applied it to a plain
object, where nothing derives anything. Sim #1426 guessed `height/2` on the same
instruction and got away with it. Same instruction, two strategies, coin flip.

That diagnosis picked the fix: rather than adding a prompt rule that has to
out-argue an idiom the schema itself taught, make the `y: 0` the model already
writes **literally correct**, in the vocabulary it already reaches for.

**Behaviour**
- Reserved literal, checked BEFORE the ramp lookup — no object need be named
  `ground`. If a ramp IS named that it is shadowed, and the seam reports it
  (`seat-ground-shadowed`) rather than silently preferring one.
- No bottom wall → seats at y = 0 anyway and reports `seat-ground-no-bottom`,
  mirroring the grounded-container precedent (`containerExpansion.ts`).
- Unlike a ramp seat, it does NOT set `angle` — the ground is flat, so an
  authored tilt is the author's business. It is honoured in the EXTENT instead:
  `(w·|sin θ| + h·|cos θ|)/2`, so a tilted box rests on its corner rather than
  sinking. Degenerates to `height/2` at θ = 0 and 180°.
- Angle is read through `angleScale`, so a radians-authored sim seats correctly.

**Bounding box, not collider — a deliberate call.** Matches `seatAtX`, which
also uses `objHeight / 2`, so both seatOn targets place a body the same way. A
collider-flush seat would need the sprite's collider inset at the expansion
seam, but `expandObjects` runs in a JsonSimulation memo that can evaluate before
`BaseSimulation` finishes gating on `loadManifest()` — the seat would then
depend on load order (bbox first render, collider-aware later). **Invariant #8
closed exactly that class of race; not reopening it for a millimetre.** The
residual settles on the first step and is invisible at any real
`pixelsPerUnit`. Compare the 0.17 m burial it replaces.

**Three places:** schema (`seatOn` describe rewritten to lead with the ground
form; the `y` describe now states outright that `y: 0` puts an object half below
the floor) + regenerated · prompt (FILL OBJECTS gains the resting-on-the-floor
rule, and the incline bullet now cross-references it as the same field) ·
`/docs/authoring-json` (new subsection, including why bbox-not-collider).

**Verified headless** through `expandObjects`: flat box seats at `height/2`;
authored y overridden; an object WITHOUT `seatOn` is untouched (regression
guard — `y: 0` still buries it, which is correct, that is the authored value);
rotations at 45°/90°/180° match the extent formula; radians env; no-bottom-wall
still seats AND fires its diagnostic; unknown seatOn target keeps the old
behaviour and diagnostic. `tsc` clean, `npm run lint` at the known baseline.

**Not addressed:** the same y-is-the-center confusion applies to stacking
(sitting a box ON another box), which still requires hand arithmetic. Promoted
out of this aside into **Open questions → "Generalized seating"** (2026-08-14,
Bill's call) — it is next session's lead-off discussion, not a someday-maybe.
