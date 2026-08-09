# Notes on Concave Colliders Refactor

Status: Phase 0 SHIPPED (capability proven). Phases 1–4 proposed —
**agent-side dev PAUSED 2026-06-22** (Bill driving the manual hand-authoring loop;
see Findings → "Dev paused"). Phase 1/4 prereq checks both done.
**Tier 1 gate RESOLVED 2026-07-02** — the priority shape list arrived as the
topics-driven curriculum roadmap (`PHYSICS_SHAPES.md` and siblings); the concave
Tier 1 is now the **Rung 2 open-container factory** (cup/box/wagon). See Findings
→ 2026-07-02. Resume still awaits Bill's explicit go.
Scope: collider content + authoring + robustness. The engine path already exists.
Goal: support genuinely concave collider shapes — open containers (cups, buckets)
and open-top vehicles (wagons, carts) — so the physics curriculum can express
"catch the marble" projectile sims and the Newton's-1st-law ball-in-wagon demo.

---

## Background — what we have, what's missing

GIST's renderables have all been **convex** by design (the safe choice — both
engines collide convex shapes natively). Two high-value curriculum scenarios
need concavity:

- **(a) Cup / bucket catch.** The classic "marble off the table": a marble rolls
  off a table at a known horizontal speed, the student places a cup at the
  predicted landing spot to catch it. Needs an open container — a concave U.
- **(b) Ball in a wagon (Newton's 1st law).** A wagon rolls forward with a ball
  resting in it; it strikes a curb and stops; the ball keeps moving (inertia)
  and rolls into the front wall. Needs an open-top **dynamic** concave body plus
  a separate ball carried by friction.

Neither engine supports true concave *dynamic* colliders directly — and per the
Rapier docs, trimesh/polyline colliders are explicitly discouraged on dynamic
bodies (no interior volume → undefined mass, tunneling). The blessed route is
**convex decomposition**: model the concave shape as a *compound of convex
parts*. Rapier exposes `ColliderDesc.convexDecomposition` (VHACD); we already do
the 2D analog.

### What already exists (the happy surprise)

The decomposition path was fully plumbed before this refactor — it was just
never exercised, because every manifest collider happened to be convex:

- [src/physics/shapeHelpers.ts:13](src/physics/shapeHelpers.ts#L13)
  `decomposePolygonShape` runs `poly-decomp`'s `makeCCW` + `quickDecomp` and
  returns a single `polygon` for convex input or
  `{ type: 'compound', parts }` for concave input
  ([shapeHelpers.ts:21](src/physics/shapeHelpers.ts#L21)).
- A manifest collider of `type: 'convex'` is routed through that function at
  load time ([shapeHelpers.ts:70](src/physics/shapeHelpers.ts#L70)) — so the
  type name is a **misnomer**: it accepts concave vertices and decomposes them.
- Both adapters consume the result:
  [RapierAdapter.ts:128](src/physics/rapier/RapierAdapter.ts#L128) and
  [PlanckAdapter.ts:84](src/physics/planck/PlanckAdapter.ts#L84) each build one
  convex collider per part; Planck also sums per-part area for mass
  ([PlanckAdapter.ts:45](src/physics/planck/PlanckAdapter.ts#L45)).

So the gap was never the engine — it was **content** (no concave sprites),
**robustness** (no CCD), and the **authoring/LLM surface** (the prompt + schema
say colliders are "rectangle, circle, or convex hull").

---

## Collider-behavior strategy (three tiers)

Concave decomposition is one *mechanism* inside a larger goal: **colliders that
behave the way a teacher/student intuitively expects**. The umbrella teardown
(see Findings) shows the broader failure mode — a convex hull swallows a
mostly-empty, thin-featured sprite into a solid blob, and *concavity isn't even
the only fix* (an umbrella wants a thin **shell**, or a **compound** canopy+stem,
not decomposition). We prioritize the work in three tiers. **(Scope note: this
section is broader than "concave"; it lives here for now but the note title
undersells it.)**

### Tier 1 — shapes critical to defined physics sims — **PRIORITY**
The shapes a specific, intended curriculum sim cannot run without. Confirmed
anchors: the **cup/bucket** (concave U, catch-the-marble) and the **open-top
wagon/cart** (Newton's 1st law). **Full membership is pending Bill's canonical
defined-sim list** — those two are confirmed; others slot in when provided. This
is where Phase 1 content + Phase 4 landing earn their keep first.

### Tier 2 — everyday shapes an LLM might use creatively — *low priority*
Common objects the LLM reaches for in open-ended prompts, used in ways the asset
author never anticipated. Exemplar: the **umbrella** — a rain "shield"
sheltering an entity under the canopy, or flipped into a "sled" bowl that cradles
a rider down a slope. Today its collider is a single 8-vertex convex hull
spanning the canopy apex down to the handle tip — a solid wedge that fills both
under-canopy voids and swallows the thin stem (wrong in every use). The right fix
is a thin canopy **shell** (likely **compound** canopy+stem), not just
decomposition. See the deferred sprite-vs-context open question.

### Tier 3 — mop-up — *lowest priority*
Whatever shapes remain or fall out of the Tier 1/2 work — the long tail of assets
whose colliders are "good enough" until something specifically breaks.

**Relationship to the phases:** the tiers are *orthogonal* to Phase 0–4. The
phases are *capability* steps (decompose path → content → CCD → catch detection →
schema/LLM landing); the tiers say *which shapes/sims* claim that capability
first. Tier 1 drives Phase 1 content and Phase 4 landing; Tiers 2–3 wait.

---

## Recommended approach

Author concave outlines as `type: 'convex'` manifest colliders (the existing
decompose path), keep them as compounds of convex parts, and never reach for
trimesh on dynamic bodies. Treat concavity as a content + authoring problem, not
an engine problem.

---

## Implementation touchpoints

- **Content**: SVG sprite in `public/renderables/` + a concave collider polygon
  in `public/renderables/manifest.json` (64×64 viewBox, Y-down; the function
  flips Y to physics-Y-up and scales to the object's bounding box).
- **Decomposition**: [src/physics/shapeHelpers.ts](src/physics/shapeHelpers.ts)
  (`decomposePolygonShape`, `scaleManifestColliderToShape`).
- **Engine**: `case 'compound'` in both adapters (no changes needed for Phase 0).
- **Authoring/LLM** (future phases): the "convex hull" wording in
  [src/schemas/simulation.ts:92](src/schemas/simulation.ts#L92),
  [simulation.ts:250](src/schemas/simulation.ts#L250), and
  [modal_functions/gist_instructions.py:131](modal_functions/gist_instructions.py#L131).

---

## Phased rollout

### Phase 0 — prove the dynamic-compound path — **SHIPPED 2026-06-22**
Hand-author one concave collider and confirm a dynamic compound both catches and
tips. Done — see Findings below. Zero engine changes.

### Phase 1 — concave content
**REVISED 2026-07-10 — Phase 1 is now the parametric open-container factory**
(`makeOpenContainer`, see Findings 2026-07-10): the factory synthesizes the U
outline in gist and decomposes it; no SVG assets or generator motion needed
for Tier 1. The SVG-authoring route below is superseded for the Rung 2
containers and remains the Tier-2 path for arbitrary art-driven shapes.
*Original (superseded-for-Tier-1) plan:*
Author cup/bucket + open-top wagon/cart SVGs with concave collider polygons.
Establish a **wall-thickness convention** tied to diorama scoping
(`/docs/design-philosophy`): walls must be a
meaningful fraction of the 64×64 viewBox so they survive down-scaling at small
scenes. Use the manifest `parent`/variant mechanism for size families.
**Prerequisite:** either keep hand-authoring concave colliders in `manifest.json`
or extend the external SVG generator to emit them — see *Pipeline & engine-parity
checks* below. Also verify Planck parity before assuming the content is engine-agnostic.

### Phase 2 — tunneling robustness (CCD)
Wire `rigidBody.enableCcd(true)` (Rapier) / `setBullet(true)` (Planck), gated by
a per-object `ccd?: boolean` (default-on for small fast circles via a
`|v|·dt > min-extent` heuristic). Lower priority than first thought — see the
precompute finding below.

### Phase 3 — pedagogical payoff: catch detection
A conditional output ("body X inside cup AABB AND speed < ε" → flash "Caught!").
Graduates to real sensors/events later (see *Adapter feature gaps* in
[GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md)).

### Phase 4 — authoring + schema/LLM clarity (the three-places work)
Rename manifest `type: 'convex'` → `'polygon'` (or document that it accepts
concave); add a build-time validator (CCW winding, self-intersection rejection,
decomposition part-count cap); update schema `.describe()` + `gist_instructions.py`
so the LLM knows concave containers exist and how to author the two canonical
sims. **Also confirm the external SVG generator emits concave collider vertices
+ corresponding `manifest.json`** (see *Pipeline & engine-parity checks*) — the
LLM picks SVGs by name, so the asset library must actually contain correct
concave colliders, generated not hand-authored, for this to scale. **This is the
phase that "lands" the capability under the three-places rule** — until it runs,
AI-authored sims can't use concave shapes.

---

## Collider debug / observation mode — SCOPED 2026-07-02 (Bill request); BUILT 2026-07-03 (all but the engine-actual layer)

A dev-only visualization of the **actual collider geometry each object receives**,
so we can confirm the SVGs + manifest data coming from the SVG generator are good —
*before* making dev decisions here or upstream. Framed deliberately as an
**observation instrument**: gather data on real objects first; do not pre-bake
thresholds or heuristics (Bill 2026-07-02: "we need observation data on real objects
before we can make dev decisions here and upstream with svg gen").

**Foundation already exists — the drawing primitive is built and unwired.**
[src/components/simulation_components/renderables/visuals/BodyOutline.ts](src/components/simulation_components/renderables/visuals/BodyOutline.ts)
already renders any `ShapeDescriptor` — circle, rectangle, polygon, **and each
`compound` part** — to canvas via the same visuals registry the vector arrows use. It
is registered but nothing currently *emits* a `body-outline` visual. Key point: for a
concave `type:"convex"` manifest collider, `body.shape` **is** the decomposed
compound (via `scaleManifestColliderToShape` → `decomposePolygonShape`), so drawing it
renders the **poly-decomp split directly**. That makes this mode the "render the
decomposed collider" debug switch the SVG generator's `Dev_Tasks.md` **Task 13** logs
as *Bill's TODO in gist* — the sanctioned way to ground-truth decomposition downstream
without importing `poly-decomp` into the generator repo.

**Scope (BUILT 2026-07-03 — see Findings "Import Object follow-ups"; every
item below landed except the optional engine-actual layer, which is
deferred):**
- **Toggle:** dev-only — a `?colliders=1` URL flag (mirroring `?simdebug=1`) and/or an
  AdvancedDebugPanel switch. Never production.
- **Draw** a `body-outline` per object; color `compound` parts distinctly so the
  decomposition is visible at a glance.
- **Per-body readout:** part count + per-part vertex counts, flagging any part that
  exceeds **this Planck build's real cap of 12** (`planck.Settings.maxPolygonVertices`;
  see Findings 2026-07-02) — the point at which Planck silently truncates + hulls. The
  Box2D-classic 8 / portability threshold is an **OPEN decision deferred pending
  observation data**, not enforced here.
- **Optional "engine-actual" layer:** read the real fixture polygons back from the
  engine (Planck `fixture.getShape().m_vertices`; Rapier collider verts) and overlay
  them, so any discrepancy between the intended `ShapeDescriptor` and what the engine
  actually built (Planck truncation, hull convexification) is visible. This is the only
  layer that truly confirms *Planck is colliding with what we think it is*.
- **Pairs with** the gist-owned post-decompose dev-warn (generator `Dev_Tasks.md`
  **Task 15**): after `quickDecomp`, a dev-build `console.warn` on any part > cap. The
  overlay is the visual complement to that log.

**Not gated on the concave-dev "go."** This is tooling to confirm manifest data (e.g.
the runner) and is useful independent of the open-container-factory build.

---

## Design rationale

- **Convex decomposition, never trimesh** for dynamic bodies — matches Rapier's
  own guidance; preserves interior volume and well-defined mass.
- **Concavity is content, not engine** — the cheapest correct framing; it kept
  Phase 0 to a single SVG + manifest entry with no `src/physics` changes.
- **Diorama scoping still governs sizing** — a cup at a 2 m scene has sub-decimeter
  walls; thickness is chosen for visibility + robustness, not realism.

---

## Out of scope

- True concave (trimesh) dynamic colliders.
- Multi-sprite "weld N primitives into one rigid body" compound *authoring*
  (distinct from auto-decomposing one concave outline) — no current sim needs it.
- 3D.

---

## Open questions

1. Manifest collider type name: rename `'convex'` → `'polygon'`, add explicit
   `'concave'`, or just document? (Leaning: rename to `'polygon'`.)
2. Should `ccd` be schema-exposed per object, or inferred purely by heuristic?
3. Wagon "rolling": real wheels (revolute joints, gated on the joints wishlist
   item) vs. a low-friction sliding body? (Leaning: sliding for the demo.)
4. **(Tier 2, DEFERRED)** Is a collider a property of the **sprite** or the
   **sprite-in-context**? The umbrella's shield-vs-sled uses suggest one sprite
   may need different physical behavior by orientation/use. Working lean: a
   single thin concave canopy shell may serve *both* (convex top sheds rain;
   flipped, the bowl cradles a rider), so one-collider-per-sprite probably holds
   — but this is unresolved until a real sim forces it. Fallback if it doesn't:
   per-use collider variants via the manifest `parent`/variant mechanism. Not
   resolving now; logged so the tension isn't lost.
5. **(four-option generator, 2026-06-25)** Should "pill" be a true capsule
   primitive, or emitted by the generator as a **2-circle + rectangle
   `compound`**? Leaning: compound — it rides the existing `compound` path with
   zero adapter change, and Planck/Box2D has no native capsule anyway (only Rapier
   does). Revisit only if a sim needs true capsule-rounding contact behavior the
   compound can't fake. See the 2026-06-25 Findings entry.

---

## Decisions deferred

- Catch-success detection mechanism (cheap AABB+speed output now vs. real
  sensors later) — tied to the sensors/contact-events gap.
- Part-count cap for decomposition (guard against a sloppy outline exploding
  into many colliders).

---

## Findings

### 2026-06-22 — Phase 0 validated (cup catch + tip-over)
- Authored [public/renderables/cup.svg](public/renderables/cup.svg) (a U: two
  sidewalls + a bottom, open top, hollow interior) and a matching concave
  `type: 'convex'` collider in the manifest. The U-outline decomposes into
  exactly **3 convex parts** (left wall, floor, right wall) via the existing
  `poly-decomp` path → a single `compound` body. First real dynamic compound in
  the system.
- Two local test sims (`ballIntoCupDrop`, `ballIntoCupArc`) confirmed: the ball
  **catches** on a straight in-line drop, and an off-center rim hit makes the cup
  **tip and tumble** (angular velocity climbs in the `?simdebug=1` logs). Both
  outcomes correct, in Rapier, with no engine changes.
- **Tunneling was a non-issue.** `handlePlay` always precomputes at
  `precomputeTimestepHz = 480` ([JsonSimulation.tsx:267](src/components/JsonSimulation.tsx#L267),
  [JsonSimulation.tsx:922](src/components/JsonSimulation.tsx#L922)) and replays —
  so the fine sub-stepping acts as a **de-facto CCD substitute**, even at a 2 m
  scene with sub-decimeter cup walls. This is why Phase 2 (CCD) is lower priority
  than expected; it matters mainly for live (non-precomputed) play and very fast
  small bodies.
- **Three-places status:** Phase 0 changed none of schema/prompt/design-doc (by
  design — it's a capability proof). The capability is proven but **not landed**
  for AI authoring until Phase 4.
- Tooling spun up alongside (now documented in
  [GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md) →
  *Local-only sim testing*): the `localJsonEdit` prop on `JsonSimulation` and the
  `?simdebug=1` per-body logging in `BaseSimulation`. Full contributor how-to:
  [Local_Sim_Workflow.md](Local_Sim_Workflow.md).

### 2026-06-22 — umbrella export teardown (Tier-2 grounding)
Audited [public/renderables/open_umbrella.svg](public/renderables/open_umbrella.svg)
+ its `manifest.json` entry (version 5) against the rendered sprite. Only the
canopy `<path … fill="#475569">` (`M12 32 Q32 8 52 32 Z`) is a *filled* shape;
the stem, ribs, and handle are stroke-only (`fill="none"`, or `fill:none` buried
in `style=`). The exported collider is `type:"convex"` with 8 hull vertices:
canopy apex `(31.99,0)` + shoulders `(16,4.8)/(47.98,4.8)` (verified by
flattening the quadratic bezier and baking the group `scale(1.5992) translate(…)`),
out to canopy corners `(7.47,15.4)/(58.49,17.48)`, and **down to `(28.9,64.65)`
— the handle tip**. Net: a solid kite/wedge filling both hollow under-canopy
voids and the stem column. Two lessons:
1. **Convex hull destroys thin-feature shapes, not just concave ones** — the
   umbrella's real fix is a thin shell / compound, beyond the cup's decomposition.
2. **The manifest geometry reflects BAKED group transforms and stroke-region
   extent**, which the in-repo `colliderGenerator.js` (handles only element-level
   `rotate()`; skips `<line>`; tests the `fill` *attribute*, not
   `style="fill:none"`) would NOT reproduce. So either the export pipeline
   normalizes/bakes transforms upstream of that file, or this asset predates the
   current generator. **Confirm the real preprocessing path before editing the
   generator** (ties into the Pipeline check below).

### 2026-06-22 — dev paused; Bill driving the manual loop
Agent-side concave-collider dev is **paused** — both Phase 1/4 prerequisites are
now resolved (generator audited, Planck parity tested, above), so the next move is
*content/curriculum*, not code. Bill is taking that on **independently**, working
directly from the Phase 0 findings: hand-editing SVGs + `manifest.json` colliders
(the same loop Phase 0 used), testing ball-in-cup and Newton's-1st-law sims, and
**defining the Tier 1 "physics-curriculum-priority" sim subjects**. That Tier 1
list (see *Collider-behavior strategy → Tier 1*, still "full membership pending
Bill") is the input that will **drive the resumed dev**: lock Tier 1 → implement
the generator change set in `../physics_sim_icon_dev` → Phase 4 landing.

The hand-authoring loop is now written up as a contributor how-to:
[Local_Sim_Workflow.md](Local_Sim_Workflow.md) — JSON in `src/simulations/` → a
one-line `JsonSimulation` wrapper → a route in `App.tsx`; `npm run dev`;
`?simdebug=1`; and the manifest collider conventions (64×64 viewBox, the
`type:"convex"`-accepts-concave misnomer, CCW winding, wall thickness). **Do not
resume agent-side dev until Bill brings the Tier 1 list back and signals go.**

### 2026-06-25 — upstream "four-option collider" generator plan (box / circle / pill / polygon)

Bill is getting ahead on the **external SVG generator** (`../physics_sim_icon_dev`)
while the Tier 1 list firms up: the goal is a **four-option collider per SVG —
box, circle, pill, and closed-polygon outline** (he initially called the fourth
"polyline"). Walked the plan against the *consuming* side in this repo; verdicts:

**The polygon-outline option is engine-ready — but for different reasons than
assumed.** Two corrections to the working mental model:
- **Decomposition is engine-agnostic and lives in gist, not Rapier.**
  `decomposePolygonShape` ([shapeHelpers.ts:13-22](src/physics/shapeHelpers.ts#L13-L22))
  runs `poly-decomp`'s `makeCCW` + `quickDecomp` at load and feeds *convex parts*
  to **both** adapters (Rapier re-hulls each part,
  [RapierAdapter.ts:128](src/physics/rapier/RapierAdapter.ts#L128); Planck builds
  one `planck.Polygon` per part, [PlanckAdapter.ts:84](src/physics/planck/PlanckAdapter.ts#L84)).
  We do **not** use Rapier's VHACD. Upshot: concave-by-decomposition already works
  on *both* engines (matches the Planck-parity test above), not just Rapier.
- **CCW winding is normalized for you** by `decomp.makeCCW`
  ([shapeHelpers.ts:15](src/physics/shapeHelpers.ts#L15)) — the generator does
  **not** need to pre-guarantee winding. The real upstream requirement is an
  **ordered, simple (non-self-intersecting) CLOSED ring**, not a point cloud —
  i.e. exactly the `extractFilledVertices`-returns-unordered-points blocker
  already flagged in *Pipeline & engine-parity checks* below.

**Naming trap — emit a closed *polygon*, not a "polyline".** An open polyline =
edge/chain shape in both engines: one-sided, no interior volume, invalid on
dynamic bodies (the very "never trimesh on dynamic bodies" failure this whole
refactor avoids). We want a closed ring that decomposes to a compound. Recommend
naming the option `polygon` (aligns with Open Question #1's lean) and, more
importantly, making the generator emit a closed traversal.

**Planck's ≤8-vertex cap is per-part-AFTER-decomposition, not per-outline.**
`quickDecomp` does not guarantee ≤8 verts per part for a complex silhouette, so a
decomposed part with >8 verts builds fine in Rapier (re-hulled) but **fails in
Planck** (`b2_maxPolygonVertices` = 8). Add a post-decomp part-vertex check or an
outline-complexity cap. (Refines change-set item #2 below, which only addressed
the raw-outline `validateConvex` cap.)

**"Pill" / capsule is the odd one out — NOT a free primitive.** The
`ShapeDescriptor` union ([types.ts:18-22](src/physics/types.ts#L18-L22)) is only
`circle | rectangle | polygon | compound` — **no capsule**. Rapier has a native
capsule; **Planck/Box2D has none**. Cheapest correct route: have the generator
emit a pill as a **2-circle + rectangle `compound`**, which rides the
already-supported compound path with **zero adapter change** (collapsing the four
options to three engine primitives + compound). A true capsule primitive would
mean new code in `types.ts` + both adapters + the three places. See Open
Question #5.

**Today's concrete Phase-0 test decision (keeps it content-only):** Bill will
test-generate closed polygon colliders but **label them `type:"convex"` in the
manifest** (the accepted-concave misnomer), ≤8 ordered vertices, 64×64 viewBox
Y-down — the exact Phase 0 cup recipe, **zero gist code change**. Rationale:
gist's loader has **no `polygon` manifest type** — `ManifestCollider` is
`convex | box | circle` ([renderableManifest.ts:13-16](src/lib/renderableManifest.ts#L13-L16))
and `scaleManifestColliderToShape`'s switch has no `polygon` case and no default
([shapeHelpers.ts:43-74](src/physics/shapeHelpers.ts#L43-L74)), so a
`type:"polygon"` entry returns `undefined` and the body silently builds with **no
collider** (reads as a generator bug). Meanwhile a `convex` outline ALREADY
resolves to an internal `{type:'polygon'}` ShapeDescriptor for a single convex
piece — so the `convex`-named manifest *is* the polygon path under test. Plan:
generate one **convex** outline (→ single `polygon`) and one **concave** outline
(→ `compound`) to exercise both branches; verify with `?simdebug=1`.

**The `convex`→`polygon` manifest rename stays Phase 4.** It's a landing, not
content: `ManifestCollider` union + a `case 'polygon'` in
`scaleManifestColliderToShape` (aliased to `decomposePolygonShape`, keep `convex`
for back-compat) + the schema/prompt "convex hull" wording (the three places).
Doing it now would be a deliberate Phase-4 down-payment to *log*, not a
content-only test tweak. Until then, the Phase-0 tests stay on `convex`.

### 2026-06-25 — manifest collider viewBox mis-scaling FIXED (Option A); library-wide

**Filed here** because it's the gist (downstream) half of the *same* non-square-
viewBox problem the Collider Lab fixed upstream — the collider-pipeline story
already lives in this note. Not concave-specific: it hit **every** non-square
sprite.

**Symptom.** `dynamics_cart` and `frisbee` **sank into the surface** they landed
on instead of resting on their wheels/rim — even after Bill re-authored their
colliders correctly in the Collider Lab.

**Root cause.** gist's `scaleManifestColliderToShape`
([shapeHelpers.ts:30](src/physics/shapeHelpers.ts#L30)) hardcoded a **64×64**
source viewBox (`MANIFEST_VIEWBOX` for `sx`, `sy`, and the centering `half`). But
rescaled sprites are **non-square** — `dynamics_cart.svg` is `64×27.4286`,
`frisbee.svg` `64×18.2857`. Dividing Y by 64 instead of the true height baked in
an extra vertical squish (`27.43/64 ≈ 0.43`) and mis-centered the collider,
cramming it into the **top ~43%** of the sprite and leaving the lower extent
(wheels/rim) with no collider. X was right only by luck (these sprites are
genuinely 64 wide; a tall sprite would have broken on X instead).

**Two halves of one bug, split across repos.** The Collider Lab fixed its
*editing / ground-truth* view to be non-square-aware (`ColliderGroundTruth`,
sidestepping the `ColliderEditor` 64×64-hardcode) — so re-authored colliders look
right **upstream**. gist still assumed 64×64 **downstream** and re-broke them. The
cart proved it: collider authored correctly in `64×27.43`, sank in gist.

**Fix — Option A (SHIPPED + visually verified 2026-06-25).** Map using the
sprite's **true authoring viewBox**, per-axis:
- [shapeHelpers.ts:30](src/physics/shapeHelpers.ts#L30) —
  `scaleManifestColliderToShape` takes `srcW`/`srcH` (default `MANIFEST_VIEWBOX`
  each → genuine 64×64 sprites are **byte-identical** to the old behavior);
  per-axis `sx/sy` and `halfX/halfY`.
- [renderableManifest.ts:37](src/lib/renderableManifest.ts#L37) — `loadManifest`
  now fetches each sprite and parses its `viewBox` (regex, no DOMParser),
  attaching `{width,height}` to the `ManifestItem`; the cache is published only
  **after** so the invariant "item present ⟹ viewBox known" holds. Best-effort:
  a failed parse leaves `viewBox` undefined → square fallback.
- [ObjectRenderer.tsx:63](src/components/simulation_components/objects/ObjectRenderer.tsx#L63)
  — passes `item.viewBox?.width/height` through.

**Verification.** Math: cart collider bottom `+0.08H → −0.48H` (at the wheels);
frisbee `+0.22H → −0.47H` (at the rim); baseball (`64×64`) unchanged. `tsc` clean
on all three files. **Visual spot-check PASSED** — cart + frisbee collide as
expected.

**Blast radius — LIBRARY-WIDE, not two assets.** **172 of 208 sprites are
non-square** and were all mis-scaled on the off-64 axis: mild for near-square
(`pumpkin` 64×56 ≈ 12% squish), severe for the flat ones (`sled` 64×12,
`skateboard` 64×16.6, `frisbee`, `cart`). So existing sims using non-square
assets now collide **correctly** — a behavioral change worth knowing.

**Audit — fix is uniformly correct.** All 206 approved colliders were authored in
**true-viewBox space** (their coordinates track each sprite's actual viewBox dims,
not 64), so none mis-map the other way. The 54 entries that exceed their viewBox
do so by only **1–5 units** (benign silhouette overshoot, e.g. `drum` +3.7,
`hamburger` +5) — pre-existing authoring imprecision the Collider Lab's
out-of-bounds reveal already surfaces; the new mapping just shows it at true
proportion.

**Cross-repo division of labor (workflow decision, 2026-06-25).** Now that gist's
viewBox mapping is correct, the **Collider Lab (`../physics_sim_icon_dev`) is the
place to spot-check and rebuild colliders** against ground truth. gist *consumes*;
the Lab *authors/corrects*. ("Who fixes what" for the items below is still open —
Bill to decide.)

**Deferred — Option B (the durable contract).** Option A has gist **infer** the
coordinate space by fetching+parsing each SVG at load. Option B makes the manifest
**self-describing**: the Collider Lab emits each entry's authoring viewBox (e.g. a
per-entry `viewBox` / `collider_space`), gist reads it — robust even if
collider-space and SVG-viewBox ever diverge, and it drops the startup SVG-fetch
pass. **Cross-repo, three-places-style coupling:** Collider-Lab export +
manifest-schema + gist loader move together. This is the manifest counterpart of
the `convex → polygon` rename also pending downstream.

**Latent race noted** (separate, pre-existing): `ObjectRenderer` builds bodies
without awaiting manifest readiness → see `parking_lot.md` (2026-06-25 entry). The
Option A load is slightly heavier now (parses every SVG viewBox before publishing
the cache), nudging that window wider, though it still resolves long before any
user-driven sim mount.

### 2026-07-02 — Tier 1 gate RESOLVED: the curriculum roadmap arrived

The "Tier 1 priority shape list pending Bill" item (Dev-paused finding, above) is
**answered**. Bill delivered it not as a bare list but as a four-doc **topics-driven
curriculum-and-benchmark roadmap** at repo root, cross-referenced by stable IDs:

- **`PHYSICS_SHAPES.md` (v2)** — collider archetypes (S-IDs) in five rungs of
  climbing concavity. **This note's whole subject is now Rung 2+ of that file.**
- **`PHYSICS_JOINTS_CONSTRAINTS.md` (v1)** — joint archetypes (J-IDs); a *sibling*
  workstream, not concave (pendulums/springs/levers/pulleys).
- **`PHYSICS_GRAPHS.md` (v1)** — canonical graph observables (G-IDs); every
  archetype's definition-of-done names one.
- **`BENCHMARK_SIMS.md` (v1)** — external eval suite (B-IDs) with frozen prompts.

**What it settles for this refactor:**

1. **The concave Tier 1 is concrete: the Rung 2 "open-container factory."** Cup
   (S2.1), open-box / ballistic pendulum (S2.2), and wagon (S2.3) are recognized as
   *the same build* — 3–4 convex boxes seated into one rigid body — behind one
   constructor: `makeOpenContainer({ innerWidth, wallHeight, wallThickness,
   floorThickness, mode: free|grounded|prismatic })`. Named the single highest-ROI
   task in `PHYSICS_SHAPES.md`. This is the direct production-ready successor to the
   Phase-0 hand-authored cup — Phase 1 content earns its keep here first.
2. **The hoop/annulus open question (this note, Recommended-approach era) is
   dissolved** — but *not* by decomposition. `PHYSICS_SHAPES.md` v2's second
   organizing fact is **mass-property override**: keep a convex *contact* shape and
   assign a *different* shape's inertia (Planck `setMassData`, Rapier
   `setAdditionalMassProperties`). The rolling hoop (S0.2) collides as a circle,
   renders as a ring, and sets `I = mr²` — **no concave annulus collider, ever.**
   (Adapter status, code-read 2026-07-02: the *mass* half exists — `setMass`/
   `setAdditionalMass`, `RapierAdapter.ts:159-167`/`:226` from the air-resistance
   refactor — but the *angular-inertia* half is **CONFIRMED ABSENT** (no Rapier
   `setAdditionalMassProperties`, no plumbed Planck `setMassData` I-term). New adapter
   work, scope item #4; tracked as an Adapter feature gap in
   [GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md).)
3. **Wagon "rolling" open question gains a third option.** `PHYSICS_SHAPES.md` S2.3
   and the joints file (J5 PrismaticJoint) frame the wagon as a `mode` flag —
   `free | grounded | prismatic` — rather than the old sliding-vs-real-wheels binary.

**Three-places status unchanged.** This is still content/roadmap; schema `.describe()`
and `gist_instructions.py` remain on "rectangle, circle, or convex hull" — Phase 4
(the landing) has NOT run. Nothing here is authorable by the LLM yet.

**Resume gate.** "The list is in" ≠ "go." Per the Dev-paused finding, do not restart
the generator change set / open-container-factory build until Bill signals go.

### 2026-07-02 — Planck's real cap is 12 with SILENT TRUNCATION (corrects the ≤8 assumption); the runner is safe

Code-read of gist's pinned Planck ([node_modules/planck/dist/planck.js](node_modules/planck/dist/planck.js)):
- `Settings.maxPolygonVertices = 12` (line 686) — **NOT** the Box2D-classic **8** that
  the earlier "Planck parity — TESTED 2026-06-22" finding (below) and the generator's
  `Dev_Tasks.md` Task 15 both assumed.
- `PolygonShape._set` (line 7070): `n = min(vertices.length, 12)`, dedup near-duplicates,
  then **convex-hull the kept points**. So a part with **>12 verts is silently truncated**
  (first 12 kept — order-dependent — the rest dropped) and hulled → a wrong collider with
  **no throw**. And Planck *always* hulls its polygon input, so it can never hold a concave
  part (fine — decomposition feeds convex parts — but a numerically-non-convex part is
  silently convexified too).

**Correction to the earlier parity finding + the generator's ≤8 framing:** the actual
silent-break threshold is **>12 per decomposed part in this build**, not >8. `≤8` is a
*portability* target (Box2D-classic, or a future stricter engine), not this build's limit.

**Observation — the runner (Bill updated its manifest to a 34-vertex concave outline).**
Ran gist's real `poly-decomp` on it: it decomposes to **12 convex parts, max 7 verts each
→ safe** even at the strict 8. Lesson: **outline vertex count does NOT predict
Planck-safety** — `quickDecomp` shatters a complex concave outline into small convex
parts. You have to *see* the decomposition — which is exactly why the observation mode
above earns its place. (Side data point: 34-vert runner → **12 fixtures on one body**; a
compound-complexity/perf signal the observation mode's part-count readout also surfaces.)

**Decision (Bill 2026-07-02):** the debug mode **flags against this Planck's real cap
(12)**; the 8-vs-12 portability question stays **OPEN** — *observe real objects first,
then decide here and upstream.* The observation mode is the instrument that produces that
data. No threshold is enforced as a dev rule until then.

**Status:** scope DOCUMENTED 2026-07-02 (Bill: "document scope only");
**BUILT 2026-07-03** minus the optional engine-actual layer — see the
"Collider debug / observation mode" section above and the follow-ups
Findings below.

### 2026-07-03 — "Import Object" debug feature SHIPPED (generator-export testing in a live sim)

The workflow companion to the observation mode above: a debug-panel **Import
Object** button that loads an SVG-generator export — the "Download approved"
`.zip` directly, or a loose `.svg` + manifest `.json` pair — and injects it
into the running sim as a new object. Purpose (Bill): test SVG + manifest data
*as it is generated* in the upstream SVG Gen system, without touching
`public/renderables/`. Basic functionality confirmed by Bill same day.

**What it does:** parses the zip natively ([src/lib/zipReader.ts](src/lib/zipReader.ts) —
~90-line central-directory reader over `DecompressionStream('deflate-raw')`;
**no jszip dependency taken on**; round-trip tested against real JSZip output
in STORE + DEFLATE modes); registers the SVG (as a blob URL) and manifest
entry at runtime (`registerImportedRenderable` in
[src/lib/renderableManifest.ts](src/lib/renderableManifest.ts) — imported
entries win over on-disk ones, viewBox parsed from the SVG text per the
true-viewBox contract); asks **dynamic vs static**; then drops the object at
scene center sized to **~20% of the smaller scene dimension** (aspect
preserved) so it's immediately grabbable/resizable via the existing
EditOverlay. Modal: [src/components/simulation_components/ImportObjectModal.tsx](src/components/simulation_components/ImportObjectModal.tsx);
injection + deferred initial-snapshot recapture in `JsonSimulation`
(`handleImportObject` — recapture must wait one commit for the new
ObjectRenderer's body to mount).

**Deliberate scoping:**
- **Session-only.** The SVG never lands in `public/renderables/`; saving a sim
  that references an imported object won't carry the artwork (name falls back
  to a rectangle collider on reload). This is an observation instrument, not
  an asset pipeline.
- **Three-places status: intentionally untouched.** No schema, no prompt, no
  design-philosophy change — nothing here is LLM-authorable, by design. Do not
  read this as a half-landed Phase 4.
- An SVG with **no manifest entry** still imports (amber warning, rectangle
  collider fallback) — itself useful signal when testing generator output.
- Decomposition still happens invisibly at body-build time — a >12-vert part
  (Planck cap, above) won't be *visible* until the observation overlay exists.
  This import button is the natural feeder for that overlay.

**Drive-by fix:** `ManifestItem.physical_properties.collider` is now typed
nullable (matches shipped data — "basketball" has `collider: null`), which
surfaced and fixed a latent crash in
[EditOverlay.tsx](src/components/simulation_components/EditOverlay.tsx)
(`collider.type` read without a null guard → edit mode would crash on any
null-collider object).

**RESOLVED same day — Bill's pending tweaks (2026-07-03):** both were
specified and built in a later session the same day, together with the
observation overlay; see the follow-ups Findings below. Original open items,
kept for the record:
- On import, ask the user to select **slider controls** to attach to the
  object (which properties, ranges TBD). → *Built as import-time presets;
  Bill chose velocity/acceleration controls, NOT position sliders.*
- In the sim itself, **select + Delete key removes an object** (would be the
  first object-removal UI; note `commitObjectEdit`'s slider/control re-sync
  concerns apply in reverse — removal must clean up controls/outputs/graphs
  that reference the object id). → *Built, for ANY object (Bill's call), with
  exactly that cleanup.*

### 2026-07-03 — Import Object follow-ups + collider observation overlay BUILT (later session, same day)

All three remaining debug-tool items landed in one push. **Build-verified**
(tsc: no new errors; `vite build` clean; dev server boots) and **CONFIRMED
hands-on by Bill same day** ("all works — and I see the collider geometry
with ?colliders=1"). Three-places status: **intentionally untouched again** —
pure debug tooling, nothing LLM-authorable.

**Same-day follow-up (Bill request): the overlay is also a debug-panel
checkbox** ("Show colliders", next to Show grid) — session-local state like
`showGrid`, toggles live without affecting the bake cache. `?colliders=1`
now sets the checkbox's INITIAL state (so a link can open straight into
observation mode) rather than being the only switch.

**1. Select + Delete removes an object** (`JsonSimulation.tsx` —
`removeObject` + a keydown effect). Scope decision (Bill): works on **any**
object in edit mode, not just imported ones — one consistent rule for the
first object-removal UI. Delete/Backspace while an object is selected and
`editModeActive`; skipped when focus is in an input/textarea/select/
contenteditable so typing never deletes bodies. Cleanup is the commitObjectEdit
re-sync concern in reverse, fully enumerable from the schema (controls are
slider|toggle, graphs are line-only): drops controls with `targetObj === id`
(and their live `controlValues` entries), output values (and now-empty
groups), graph lines (and now-empty graphs). Reuses the deferred-recapture
pattern from import — renamed `pendingRecaptureRef` — which works unchanged
for removal because a removed child's cleanup (body destroy + `objRefs`
delete) runs before the parent's `[siObjects]` effect on the same commit.
Draft-only like all click-edits: Save persists, reload discards.

**2. Import-time slider-control presets** (`ImportObjectModal.tsx` checkboxes
→ `handleImportObject` builds the sliders). Bill chose **Speed
(`velocity.magnitude`, 0–30), Launch angle (`velocity.angle`, range follows
`env.angleUnit`: 360 / 6.28 / 1), Accel X/Y (`acceleration.x/.y`, −20–20 —
the additive-thrust `userData.configuredAcceleration` path)**. Position
sliders deliberately NOT offered — dragging via EditOverlay already re-syncs
position sliders, and the polar pair is the projectile-testing win. Presets
are disabled for static bodies (velocity/acceleration writes are no-ops
there). Labels are `"<id> speed"` etc. (control labels key `controlValues`,
so they inherit the import's de-duped object id); defaults are 0 to match the
object's initial state, and `controlValues` is seeded at import so the new
sliders render controlled from frame one. A speed slider at 0 plus an angle
slider is safe: the polar held-state resolver (vector-representation Phase 1)
preserves the orthogonal component.

**3. Collider observation overlay BUILT** — the 2026-07-02 scope above,
minus one layer. `?colliders=1` (module flag in `JsonSimulation`, mirroring
`?simdebug=1`) synthesizes a `body-outline` renderable per object
(`synthesizeColliderDebugRenderable`, zIndex 30 — above sprites/arrows/
markers) with a new `debugParts` mode in `BodyOutline.ts`: each part of
`body.shape` (the decomposed compound, for concave colliders) gets a distinct
palette color (translucent fill + stroke), polygon parts get a vertex-count
label at their centroid — **red bold above 12** (`PLANCK_MAX_POLYGON_VERTS`,
this build's silent truncate+hull cap) — and compounds get an "N parts" label
pinned above the shape's top extent. Labels counter-rotate so they stay
horizontal on tumbling bodies. **NOT built: the optional "engine-actual"
fixture-readback layer** (Planck `m_vertices` / Rapier collider verts) — the
only scope item deferred; the overlay currently shows the intended
`ShapeDescriptor`, which for Planck parts ≤12 verts is also the engine truth.

**Why one push:** Import Object (the feeder), the presets (drive the object),
Delete (clear the bench), and the overlay (see the decomposition) complete
the observation loop the 2026-07-02 scoping asked for — generator export →
live sim → visible engine-truth colliders, no `public/renderables/` touch.

### 2026-07-10 — GO confirmed; open-container factory SCOPED (six decisions)

Bill confirmed the question the 2026-07-02 gate left open: the curriculum
list arriving **was** the go. Dev resumes with the **Rung 2 open-container
factory** (S2.1 U-cup / S2.2 open box / S2.3 wagon —
[PHYSICS_SHAPES.md](PHYSICS_SHAPES.md) Rung 2, the file's single
highest-ROI task). The scoping discussion settled six decisions:

1. **Staged placement — the factory lives in gist.** Factory code +
   hand-authored local sims first (the `asLocalSimConfig` static path, the
   Phase 0 idiom); the schema/prompt landing stays Phase 4. **Three-places
   deliberately untouched** — the missing schema motion is a decision, not
   an oversight. Code fact driving this: the schema has *no parametric shape
   authoring at all* — an object's collider comes exclusively from its `svg`
   manifest lookup ([simulation.ts:110-112](src/schemas/simulation.ts#L110)),
   so any schema route is a new concept, deferred to Phase 4.
2. **Outline-then-decompose.** The factory synthesizes the concave U outline
   (8 verts from `{innerWidth, wallHeight, wallThickness, floorThickness}`)
   and feeds [`decomposePolygonShape`](src/physics/shapeHelpers.ts#L13) —
   the proven Phase 0 path; decomposition stays single-sourced; the parts
   are ≤4-vert quads, **Planck-12-safe by construction**. Rejected: direct
   compound emission (a second construction idiom that skips the pipeline
   future LLM-authored concave shapes will ride). The factory spec's
   "computes combined mass/CoM/inertia" comes free — both engines derive it
   from compound fixtures (parity-tested 2026-06-22, ~13% inertia gap known).
3. **Flat-fill visual for v1; SVG skins later** (Bill: "crowd pleaser").
   The visuals registry already draws any ShapeDescriptor including
   compounds (the BodyOutline machinery), so a filled-polygon visual is
   near-free. Skins compose later: stretch an SVG over the parametric
   collider's bounding box via the existing per-axis viewBox mapping.
4. **`mode` = constraint regime for DYNAMIC containers — NOT
   dynamic|static.** `free` (unconstrained; the S2.1 cup must recoil or
   `m·u = (m+M)·v` has nothing to show) | `grounded` (**also dynamic**:
   spawn-seated on the floor + friction preset — the wagon regime; contact
   and gravity provide the ~1D constraint, so tipping/bounce stay honest per
   the S2.3 curriculum note) | `prismatic` (**deferred, joints-gated** —
   verified 2026-07-10: the adapter layer has zero joint support; belongs to
   the J-workstream, which also gates S2.2's swing phase). Static is
   orthogonal via the existing
   [`isStatic`](src/schemas/simulation.ts#L120) flag — no `fixed` mode;
   `grounded` + `isStatic:true` is a contradiction-shaped no-op (factory may
   warn).
   **Authoring payoff (Bill):** `grounded`-as-seating solves a real pain
   point — computing a start position so a body rests on the ground at t=0.
   Generalizes to angled ramps (slabs at an angle): a "seat this object on
   that surface" placement helper is a wishlist-grade seed, logged here.
5. **Generator change set SUPERSEDED for Tier 1; generator gets a NEW
   charter.** Parametric containers never touch `../physics_sim_icon_dev` —
   the 2026-06-22 change set (ordered-outline extraction, cap relaxation,
   editor-warning flip) remains the **Tier-2** route for arbitrary
   art-driven shapes (disposition note added in the checks section below).
   Expanded future charter (Bill, 2026-07-10): the generator becomes a tool
   for **custom compound shapes AND environment/background shapes** —
   interactive, purely decorative, or purely informative (tick marks,
   targets, pathways, guiding text). Opens its own doc when that work
   starts; intersects gist's environment/walls layer.
6. **Wall thickness is factory-clamped.** Diorama-scoped: default/clamp to a
   minimum fraction of the scene dimension (concrete floor to be set during
   implementation) instead of trusting each author. Refines Phase 1's
   original "meaningful fraction of the 64×64 viewBox" convention, which was
   SVG-framed and doesn't apply to a parametric build.

**v1 slice:** factory + U-outline synthesis; three local sims (S2.1 cup
drop, S2.2 box catch — collision phase only, the swing needs J1, S2.3 wagon
stop); modes `free|grounded`; flat fill; verified by driving through the
observation overlay. Schema/prompt untouched.

**Same day — v1 BUILT, headless-verified, pending Bill's drive.**
[`src/lib/openContainer.ts`](src/lib/openContainer.ts): `makeOpenContainer`
synthesizes BOTH manifest halves from one outline — a flat-fill SVG sprite
and a full-viewBox concave `type:"convex"` collider — registered via
`registerImportedRenderable` (session-only; same reload caveat as Import
Object). Because the collider spans the FULL viewBox (unlike the Phase 0
cup, inset 8/64), the object's width/height box IS the physical extent —
that's what makes `grounded` seating exact rather than hand-tuned. Returns
`{ object, dims }`; `dims.floorTopY` seats payloads (used by the wagon sim).
Three local sims + routes: `/simulation/cup-catch`, `/simulation/box-catch`,
`/simulation/wagon-stop` (`CupCatch/BoxCatch/WagonStopSimulation.tsx`).
Implementation note: all three v1 sims use `grounded` — the friction preset
is a *default*, and S2.1 overrides it near zero for clean momentum capture;
`free` is for off-ground placements. Headless harness (tsx, Planck-parity
style; re-creatable) drove the real factory → registration →
`scaleManifestColliderToShape` → `decomposePolygonShape` chain: all three
containers → 3-part compound, vertex counts [4,4,4], grounded collider
bottom exactly at y=0, `floorTopY` consistent. tsc/lint/build clean; Vite
transforms + routes 200. **Ship gate: drive with `?colliders=1`** (expect 3
distinctly-colored parts per container, no rectangle-fallback warnings).

### 2026-07-10 — first drive (Bill, cup-catch): two bugs fixed, one parity claim reopened

Bill's drive (friction 0 everywhere, cup mass 0.5, restitution 0.9) surfaced:

1. **Container invisible with the overlay off — FIXED (factory).** The
   synthesized SVG's viewBox was in raw config units (`0 0 0.744 0.772`) with
   no width/height attributes; the sprite path is `new Image()` +
   `drawImage`, and an SVG with a sub-pixel intrinsic size rasterizes at ~1px
   (or not at all in engines that require explicit intrinsic dimensions).
   Fix: `SPRITE_SCALE = 200` viewBox units per config unit + explicit
   `width`/`height` attributes; the collider is authored in the SAME scaled
   space, so per-axis mapping keeps physics identical (harness re-verified:
   3 parts, [4,4,4], seating exact).
2. **Cup wouldn't slide on a "frictionless" floor — FIXED (RapierAdapter,
   pre-existing).** The Max friction/restitution combine rule
   ([RapierAdapter.ts:89](src/physics/rapier/RapierAdapter.ts#L89)) was
   chosen so "a body's own restitution/friction dominates the contact" — but
   `createWalls` passed no material, so walls silently carried Rapier's
   default collider friction **0.5**, and max(anything, 0.5) out-frictioned
   every slipperier object: a frictionless floor was unauthorable. Fix:
   walls now get explicit `friction: 0, restitution: 0`.
   **Behavior change to know about:** any existing sim whose object friction
   is < 0.5 previously experienced 0.5 against walls/floor and now
   experiences its own value (the documented semantics). Objects at ≥ 0.5
   (e.g. the Phase 0 cup sims) are unchanged.
3. **Parity claim REOPENED — Planck's ground contacts were never frictional
   at all.** PlanckAdapter walls already default to `friction: 0`
   ([PlanckAdapter.ts:61](src/physics/planck/PlanckAdapter.ts#L61)), and
   Box2D mixes contact friction as `sqrt(fA·fB)` — so wall friction 0 zeroes
   EVERY Planck ground contact regardless of the object's friction. The
   2026-06-22 parity finding "Planck slides the cup 2–3× farther / is more
   energetic," attributed to solver/contact response, is likely (at least
   partly) this friction-mixing divergence: Rapier ground friction was 0.5,
   Planck's was 0, in the same test. Making Planck honor "body's own
   friction dominates" needs a per-contact `setFriction` hook or mixer
   override — deferred (non-default engine); re-run the parity harness after
   that before trusting the energy claim. Topics-tracker entry corrected.

Also noted from the drive JSON: `environment.friction` is not a schema field
and nothing runtime-parses configs, so it is silently ignored — after fix #2
the sanctioned way to author a frictionless floor is per-object
`friction: 0`. And cup `restitution: 0.9` makes the *catch* bouncy (the ball
can pop back out) — that's real physics, not a collider defect.

### 2026-07-10 (later) — Planck friction mixing FIXED; sprite + S2.3 confirmed by drive; ship-gate checklist

Bill confirmed post-fix: **container sprite renders** with the overlay off,
and **S2.3 wagon-stop passes qualitatively** (math unchecked). Decision
(Bill): ground-contact friction derives from the OBJECT; the environment
ground stays a zero-material collision boundary — the boundary-vs-real-ground
authoring question and object-object contact-material conventions (research
PhET et al.) are PARKED (`parking_lot.md` → "Environment-ground semantics",
2026-07-10).

**Planck fix (implements #3 above):** `PlanckAdapter` constructor now
registers a `begin-contact` hook setting the contact's friction to
`max(fixtureA, fixtureB)` — matching Rapier's Max combine rule; Box2D
restitution already mixes as max, so friction was the only divergence.
Cross-engine harness (tsx, real adapters, dt=1/480): µ=0 box glides in both
engines; µ=0.5 box's slide distance matches the analytic `v²/2µg` —
Rapier Δx 0.918, Planck 0.915, analytic 0.918. **Cross-engine ground
friction now agrees**; the 2026-06-22 parity energy claim still awaits a
re-run of the full cup harness.

**Ship-gate checklist for the v1 factory test** (Bill re-drives, fresh
session — the friction fixes change ground contacts in every sim):

*All three sims:* **PASS (Bill, 2026-07-15)**
- [x] Sprite renders with overlay OFF (all 3)
- [x] `?colliders=1`: distinctly-colored parts, correct vertex counts,
      none red (wagon is now 2 parts — see the walls-variant note below)
- [x] Console: no errors, no rectangle-fallback warnings for `container-*`
- [x] Debug tools work on factory objects (grab, live resize on canvas,
      select+Delete, Tweak JSON)

*S2.1 cup-catch / S2.2 box-catch:* **PASS (Bill, 2026-07-15)** — math
checks out at first-order glance; nothing raised physics-teacher eyebrows.
- [x] All per-sim items above, per the drive

*S2.3 wagon-stop:* **PASS (Bill, 2026-07-15)** — and the sim itself
evolved during the drive: Bill converted `WagonStopSimulation.tsx` to the
clean N1 variant (`walls: 'left'` open-front wagon, `cannonball` payload,
µ=0 wagon+payload, static `crate` stopper mid-window at x=6, exact seating
with no epsilon pad). Wagon stops at the obstacle, payload keeps vx and
rolls off the open front — the original "escapes over the low front wall"
expectation is superseded by the open-front geometry.
- [x] Payload keeps vx across the stop; twin traces diverge at the stop

*Regressions from the friction fixes:* **PASS (Bill, 2026-07-15)** — driven
at defaults AND with tweaked friction values AND across both engines;
eyebrow check good.
- [x] ballIntoCupDrop / Arc unchanged (both bodies at µ=0.5 → Max same)
- [x] Older sim with default (0) object friction: glide reads as
      correct-by-semantics
- [x] Parity spot-check on Planck: ground friction behaves the same

**⛴️ SHIPPED 2026-07-15 — Phase 1 v1 (open-container factory) is done.**
Full checklist passed on Bill's fresh-session re-drive (factory sims +
friction-fix regressions, both engines). Roadmap CC3 → green. Next-slice
decision open: S2.2 swing (joints workstream J1), SVG skins over parametric
colliders, or the Phase 4 schema/prompt landing.

Two items surfaced by the drive, captured in `parking_lot.md` (2026-07-15),
neither gating: **edit-mode undo** (cmd-Z, wanted after using Delete) and
the **duplicate-object-id page crash** (adapter's duplicate-body-id throw
is uncaught above the adapter; Tweak-JSON with two identical ids kills the
page).

When the checklist passes, mark Phase 1 v1 SHIPPED (roadmap CC3 → green) and
decide the next slice (S2.2 swing = joints workstream; SVG skins; Phase 4
schema landing).

### 2026-07-15 — ship-gate drive feedback (S2.3) + one-sided walls (`walls` param) added

Bill's S2.3 re-drive: Tweak-JSON'd the payload (mass 1, µ=0.05, e=0.05,
vx 3) against a mid-window obstacle — **wagon stops at the obstacle, ball
rolls on**: the Newton's-first-law read, qualitatively confirmed again.
(The checklist's S2.3 math item — payload keeps vx on the twin traces —
still wants a look.) Payload sprite note: `bowling_ball` needs an
SVG-generator fix (external tool, not gist; tracked by Bill).

**Feature from the drive — one-sided containers.** The cleaner N1 wagon has
a back wall but no front wall at all, so the payload rolls off unimpeded.
Landed same day as `walls?: 'both' | 'left' | 'right'` on
[`makeOpenContainer`](src/lib/openContainer.ts) (default `'both'`):
one-sided values synthesize a 6-vertex **L** profile (wall + floor run flat
to the open side) instead of the 8-vertex U. Decomposes to **2 quads**
(Planck-safe trivially); the outline still touches all four viewBox edges,
so the full-viewBox extent contract — width/height box == physical extent,
exact `grounded` seating — holds for every wall choice. A wall-less slab is
deliberately not a value (that's just a rectangle; author a plain box).
Headless harness re-run across all three values: part counts 3/2/2, all
parts ≤4 verts, collider spans the full box, seated bottom exactly at
ground, `floorTopY` consistent, `outerWidth` loses exactly one wall's
thickness per dropped side. tsc/lint clean.

**Ship-gate impact: none.** Default `'both'` leaves the three v1 sims
byte-identical; no sim or route uses the new values yet — the checklist
continues unchanged. Post-gate candidate: an N1 wagon variant
(`walls: 'left'` = back wall only for a wagon moving +x, or a fourth local
sim) — decide with the next slice.

### 2026-07-16 — manifest-readiness race CLOSED (BaseSimulation gates on loadManifest)

The parking-lot race (parked 2026-06-25, surfaced by the viewBox Option A fix
— see that Finding above) is fixed, drive-confirmed, and the parking-lot entry
is retired into this note. Cause recap: `ObjectRenderer`'s body-build effect
read `getManifestItem(svg)` **synchronously** with manifest readiness absent
from its deps — a body built pre-cache kept its rectangle-fallback collider
for the whole mount, and only the module-import eager fetch kept that from
biting day-to-day.

**Fix — path #1, folded into an existing gate.** `BaseSimulation` already
mounts ALL physics children behind `adapterReady`; its adapter-creation chain
now awaits
`Promise.all([createPhysicsAdapter(...), loadManifest().catch(() => null)])`
([BaseSimulation.tsx:192](src/components/BaseSimulation.tsx#L192)) before
flipping the flag, so children (ObjectRenderer's body-build effect,
EditOverlay) can never read the manifest pre-cache. Chosen over the surgical
alternative (manifest-readiness in the effect's deps) because a late manifest
resolve would tear down and rebuild live bodies mid-mount — hostile to
precompute/replay. Why this seam was right:

- **No added latency in the common case** — the manifest is eager-fetched on
  module import, and the await runs in parallel with adapter/WASM init.
- **The +100 ms initial-snapshot capture keeps its semantics** — bodies are
  still created immediately after the gate opens, so reset/precompute see
  them. (A JsonSimulation-level gate — the parking lot's original sketch —
  would have silently broken that whenever the manifest was slow.)
- **Failure path is load-bearing:** `loadManifest()` caches even a *rejected*
  promise, so the `.catch` is what lets a failed manifest fetch fall through
  to the old per-object rectangle-fallback behavior instead of blocking every
  sim forever.
- Imported/synthesized renderables (`registerImportedRenderable`, incl. the
  openContainer factory) were never racy — session-local map, no fetch.

**Verified.** tsc/build/lint at known baseline; **drive-confirmed by Bill
same day** (Slow 4G throttle): manifest + adapter load in parallel, gate
holds, no fallback warnings — the per-sprite SVG fetches on the timeline
(initiator `renderableManifest.ts:103`) are loadManifest's own viewBox pass
completing *before* the gate opens. A `null` from `getManifestItem` inside a
sim now genuinely means unknown-name or failed-manifest, never "too early"
(comment at [ObjectRenderer.tsx:60](src/components/simulation_components/objects/ObjectRenderer.tsx#L60)).

**Known trade, now measurable → Option B is the escape hatch.** Sim mount now
*waits* on the per-sprite viewBox pass — one round-trip per approved manifest
entry, the slow-network long pole; time-to-first-sim scales with library
size. Option B ("manifest declares its coordinate space", the 2026-06-25
Finding above) dissolves it: bake the authoring viewBox into `manifest.json`
and drop the N-fetch pass entirely. Tracked cross-repo in
`../physics_sim_icon_dev/Dev_Tasks.md` Task 14, status-updated 2026-07-16:
race-closing is no longer part of Option B's payoff — mount latency is.

### 2026-07-16 — manifest contract v2 SHIPPED: per-entry `view_box` bake (Option B) + `convex → polygon` tag rename

Same-day follow-through on the entry above: the cross-repo contract decision
was ratified with the icon-repo side and both halves landed. Sample round-trip
(Collider Lab single-item download, `bird`) confirmed the exporter's new shape
before gist's half was written.

**The joint contract (manifest_version 2):**

- **`view_box: [minX, minY, width, height]`** — snake_case, top-level on each
  entry (sibling of `name`, NOT inside `physical_properties`: it describes the
  SVG, not the physics). Full SVG 4-tuple even though our convention pins the
  origin at (0,0) — gist's old regex captured and *discarded* minX/minY, so
  the bake preserves information the inference threw away. `null` when the
  exporter can't parse the SVG.
- **Collider tag `polygon`** replaces the v1 misnomer `convex` (same shape:
  an outline, possibly concave, decomposed into a convex compound). Both
  spellings accepted engine-side indefinitely; the icon-repo emits `polygon`
  from v2 on.
- **gist ignores `manifest_version`** — reads are per-entry: a valid
  `view_box` skips that sprite's fetch; missing/null falls back to
  fetch-and-parse for that one entry. A v1 manifest therefore degrades to
  exactly the pre-v2 behavior with zero version plumbing.

**gist half (implemented today, code-complete):**

- `src/lib/renderableManifest.ts` — `view_box` on `ManifestItem`;
  `viewBoxFromEntry` validator (Number.isFinite + positive dims);
  `loadManifest` seeds `entry.viewBox` from the bake and the N-fetch viewBox
  pass now `.filter((entry) => !entry.viewBox)` — for a fully-baked manifest
  the pass is empty and sim mount stops paying one round-trip per sprite.
  `registerImportedRenderable` prefers the baked field over parsing the SVG
  text (Import Object zips and Collider Lab downloads now carry it).
- `src/physics/shapeHelpers.ts` — `case 'polygon': case 'convex':` share the
  decompose path; `ManifestCollider` type is `type: 'polygon' | 'convex'`.
- `src/lib/openContainer.ts` migrated to emit `type: 'polygon'`;
  `ImportObjectModal` summary + `BodyOutline` doc comment updated.

**Deliberately untouched:** schema `.describe()` strings and
`gist_instructions.py` say "rectangle, circle, or convex hull" as informal
shape *categories*, not the JSON tag — renaming there buys the LLM nothing
and would couple this to a schema regen + deploy. Revisit wording
opportunistically on the next real schema touch. The Phase-4 three-places
landing (LLM-authorable concave) remains gated and is unchanged by this.

**Verified (headless, mocked fetch over the real module):** baked entry gets
`viewBox` with NO sprite fetch; legacy entry falls back with exactly one
fetch; `view_box: null` + 404 leaves `viewBox` undefined (rect fallback
intact); import path prefers bake over SVG text and the SVG-text fallback
still works; the real 39-vertex `bird` polygon decomposes through the new
tag. tsc/lint at known baseline. **Drive-CONFIRMED by Bill same day** —
full-library v2 export dropped into `public/renderables/` (245 kB,
`manifest_version: 2`), then a throttled (Fast 4G) load of a fresh
LLM-generated 1D collision sim (`/simulation/1212`, cat + dynamics_cart):
the per-sprite fetch storm is GONE — `manifest.json` (initiator
`renderableManifest.ts:63`) is the only manifest request, and the only SVG
fetches are the sim's two rendered sprites via `imageCache.ts:7` (the
visual layer, post-mount, non-gating). Remaining throttled long poles are
Rapier WASM (~1.7 MB) and Vite dev-mode module loading, as expected.
Bonus: dynamics_cart is the canonical non-square acceptance asset
(64×27.43), so the baked-viewBox collider mapping rode along in the same
drive.

**⚠️ Asset finding (icon-repo, not this change):** `bird`'s outline
decomposes into 10 parts with one at **16 vertices** — over Planck's silent
12-vertex truncation cap, so bird-on-Planck would get a wrong collider with
no error (`?colliders=1` flags it red). First live specimen for the scoped
post-decompose guard (roadmap CC2) and a case for a decomposition-aware
vertex-count check in the icon-repo's Collider Lab approval flow — relayed
to Bill for the cross-repo conversation. *Same-day field observation:*
Bill's `/simulation/1212` collision sim ran bird ON Planck with
`inertia: 1e10` and behaved correctly to a physics-teacher eye — expected,
not exonerating: rotation-locked, head-on 1D contact only exercises the
silhouette's leading edge, and the observation overlay draws gist's
decomposed compound (engine-actual fixture readback is deferred), so
Planck's internal re-hull of the 16-vert part is invisible and mostly
inconsequential in this regime. The guard remains the fix.
*Truncation computed (real `planck.Polygon` built from the part, diffed
against authored):* the over-cap part is the torso oval; Planck drops the
four **underbelly** vertices (viewBox x 15–38, y 34–41) and closes a flat
chord — max deviation ≈ **6.5% of bird height** (0.16 m at a 2.49 m bird;
scales linearly with size). Repro that shows it: bird static +
`angle: π` (belly-up), drop a billiard ball on the belly with
`?colliders=1` — Rapier rests the ball on the drawn arc, Planck sinks it
~6% of the height inside the red-flagged part (≈0.47 m at width 8). Also
the concrete case for the deferred engine-actual fixture readback: the
overlay draws gist's decomposition, so only behavior can reveal the chord.
*Drive-CONFIRMED by Bill same day:* scaled-up bird on Planck with
`?colliders=1` — the dynamics cart wedged visibly INSIDE the drawn
underbelly outline, exactly the computed truncation region, red `16` on
the torso part. The screenshot is the CC2 guard's motivating exhibit —
stashed with the sim JSON in `user_exhibits_for_dev_and_debugging/`.
*Relayed upstream same day:* full write-up appended to the icon repo's
`Dev_Tasks.md` Task 15 (Planck-readiness warnings) — the bird answers its
2026-07-02 "decide once we have data" gate (runner=safe vs bird=harmful
prove outline-level heuristics can't separate them); recommended there:
authoring-time exact decomposition verdict in the Lab (verdict-only,
contract unchanged), bird re-trace, and the acceptance list updated with
the cap corrected to 12.

### 2026-07-16 — `inertia` override is Planck-only; Rapier silently ignores it (feeds CC4)

Surfaced by the `/simulation/1212` drive above (both carts author
`inertia: 1e10` on `physicsEngine: "planck"`). The schema promises the
capability engine-agnostically (`simulation.ts:119` — "Set to 1e10 to
prevent body rotation") and `PlanckAdapter` honors it (`setMassData` after
fixtures, `PlanckAdapter.ts:262`), but **`RapierAdapter` never reads
`def.inertia`** — on Rapier the field is a silent no-op and the same sim
would rotate freely. Under invariant-charter language: an adapter feature
gap, not a caller problem.

Rapier's affordances (verified in the installed
`@dimforge/rapier2d-compat` typings, `dynamics/rigid_body.d.ts`):

- **`RigidBodyDesc.lockRotations()` / `rigidBody.lockRotations(locked,
  wakeUp)`** — the clean equivalent of Box2D's `fixedRotation`; exact and
  well-conditioned, no 1e10 magic number.
- **`setAdditionalMassProperties(mass, centerOfMass,
  principalAngularInertia, wakeUp)`** — for FINITE overrides (the CC4 hoop,
  I = mr²). Same replace-not-accumulate gotcha as `setAdditionalMass`
  (already handled at `RapierAdapter.ts:159` for mass — the base-capture
  pattern extends).

Suggested mapping when CC4 lands: treat `inertia` ≥ some sentinel threshold
as "lock rotations" on both engines (Planck: `fixedRotation`), and finite
values as additional angular inertia over the collider-derived base. Until
then the field is effectively Planck-only — sims relying on it should pin
`physicsEngine: "planck"` (per the engine-suitability rule).

### 2026-07-18 — CC2 SHIPPED: post-decompose dev-warn on any part over the Planck 12-vert cap

The silent-truncation hazard from the 2026-07-02 finding above now has a loud
guard. **`decomposePolygonShape`** ([shapeHelpers.ts:60](src/physics/shapeHelpers.ts#L60))
emits a dev-build `console.warn` when any convex part it produces exceeds
`PLANCK_MAX_POLYGON_VERTS` (12). Placed after `quickDecomp` because that is the
**only** point where every part's true vertex count is known — a concave
outline's own count does NOT predict its parts' counts (2026-07-02 lesson).

Design choices:
- **Engine-agnostic on purpose.** The warn lives at the gist-owned decomposition
  seam, not in `PlanckAdapter`, and fires whatever engine is active. Rationale:
  an over-cap part is a collider-*content* portability hazard — the sim
  mis-collides the moment it runs on Planck, even if it looks fine on Rapier
  today. This flags bad content, not engine-specific behavior, so it does not
  violate invariant #4 (no engine *logic* leaks above the adapter — only a
  portability diagnostic does).
- **Single source of truth.** `PLANCK_MAX_POLYGON_VERTS` is now exported from
  `shapeHelpers` and imported by `BodyOutline` (the `?colliders=1` overlay),
  which previously defined its own local `12`. Warn (console) + overlay (red
  vertex label) share one threshold.
- **Attribution.** An optional `label` threads
  `decomposePolygonShape(verts, label)` ← `scaleManifestColliderToShape(…,
  label)` ← `ObjectRenderer` (passes the sprite `svg` key), so the warning
  names the offending renderable. Optional param → all other callers
  (openContainer's ≤4-vert quads) unchanged and Planck-safe by construction.
- **Dev-gate** via `(import.meta as any).env.DEV` (matches the codebase idiom
  for reading Vite env without wiring `vite/client` types) — silent in prod.

Verified headlessly against the documented specimen: the icon-repo **`bird`**
(39-vertex concave outline) runs the real `poly-decomp` path to 10 parts with
counts `[3,3,10,4,4,4,4,3,6,16]` — **part 9 = 16 verts**, over cap, warn fires
exactly on it. `tsc`/`eslint` clean on the three touched files (pre-existing
`da.ts` locale-typing errors unrelated). Roadmap CC2 flipped proposed → done.

**Live-drive CONFIRMED same day (Bill).** Two sims driven on `physicsEngine:
"planck"` with `?colliders=1`: `Bird_hidden_rehull_sim.json` (bird +
dynamics_cart) and a polar projectile sim (baseball). Overlay shows the
over-cap part's vertex count in red; console emits the warn as authored. The
warn double-fires per asset — expected React 19 StrictMode dev double-invoke,
dev-only noise, not suppressed. First live drive surfaced a NEW specimen the
memory didn't know: **`baseball`** (18-vert outline → parts `[3,17]`, part 1 =
17 verts).

**Over-cap census — 19 of 152 polygon/convex manifest colliders (~12.5%) are
Planck-unsafe** (ran the real `poly-decomp` path over the whole
`manifest.json`, 2026-07-18). This is the payoff: a widespread silent problem
made visible in one pass. Max over-cap part vert count in parens:

| asset | outline | decomposed parts | over |
|---|---|---|---|
| alarm_clock | 35 | [6,4,4,7,3,**21**] | 21 |
| weather_balloon | 35 | [4,3,4,9,3,4,**20**] | 20 |
| baseball | 18 | [3,**17**] | 17 |
| globe_bulb | 28 | [6,8,3,**17**] | 17 |
| hamburger | 38 | [3,**17**,4,4,8,12] | 17 |
| orange_fruit | 24 | [3,6,4,**17**] | 17 |
| red_heat_lamp | 27 | [4,7,4,3,**17**] | 17 |
| bird | 39 | [3,3,10,4,4,4,4,3,6,**16**] | 16 |
| bowling_ball | 17 | [3,**16**] | 16 |
| cat | 19 | [4,3,**16**] | 16 |
| donut | 17 | [3,**16**] | 16 |
| large_analog_clock_face | 17 | [3,**16**] | 16 |
| soccer_ball | 17 | [3,**16**] | 16 |
| basketball | 20 | [3,6,3,**14**] | 14 |
| duck | 42 | […,**14**] | 14 |
| frog | 38 | […,**14**] | 14 |
| planet | 23 | [6,6,3,**14**] | 14 |
| pumpkin | 35 | […,**14**] | 14 |
| porous_asteroid | 14 | [3,**13**] | 13 |

**Pattern — most are ROUND objects encoded as many-sided polygon outlines**
(baseball, bowling_ball, soccer_ball, donut, basketball, planet, orange_fruit,
large_analog_clock_face, globe_bulb): a near-circular outline decomposes to one
big fan-shaped part. For these the correct icon-repo fix is almost certainly a
**`type: "circle"` collider**, not re-authoring the outline to ≤12-vert parts
— cheaper, exact, and Planck-safe. The genuinely-irregular ones (bird, cat,
duck, frog, hamburger, pumpkin, alarm_clock, weather_balloon, red_heat_lamp)
do need outline re-authoring or a coarser tessellation. This census is the
cross-repo re-author worklist (aligns with Bill's existing `bowling_ball`
external TODO). NB: `basketball` here carries a real 20-vert polygon — the
2026-07-03 "basketball has `collider: null`" note is now STALE (superseded by
the v2 manifest re-bake 2026-07-16).

### 2026-07-18 — Phase 4 BUILT: `container` field lands the open container for LLM/JSON authoring (CC5)

The three-places landing deferred since Phase 0. Sim JSON (LLM-generated,
DB-saved, or hand-authored) can now declare a container by params; the runtime
synthesizes sprite + concave collider at load. All three places moved
together:

1. **Schema** — `ContainerConfigSchema` (`{innerWidth, wallHeight,
   wallThickness?, floorThickness?, walls?: both|left|right, mode?:
   free|grounded, fill?, stroke?}`) as optional `ObjectConfig.container`;
   `width`/`height`/`svg` became `.optional()` ("REQUIRED unless `container`
   present — then derived, omit"); `y` stays required (grounded derives it —
   author 0; describe() says so honestly). Regenerated
   `simulation_schema.json`: ObjectConfig `required` is now `[id, x, y]`.
   Same pass: stale "convex hull" describe()/preamble wording → "polygon"
   (v2 rename drift).
2. **Runtime** — new `src/lib/containerExpansion.ts`
   (`expandContainerObjects`), wired as a derived `useMemo` in JsonSimulation
   between the `editedConfig` destructure and the `siObjects` memo. Pure
   derived layer: NEVER written back to `editedConfig`, so every save path
   persists the compact `container` field and reload re-expands — **the
   Phase-1 session-only-registration reload caveat is dead** for
   JSON-authored containers. Key design points:
   - Type strategy: authoring-side `ObjectConfig` gained the optionality; a
     new `ExpandedObjectConfig` (width/height/svg required) keeps everything
     below the seam strict (`SIObjectConfig` now builds on it — zero
     behavioral change downstream).
   - Param-signature cache (per id): repeat renders/StrictMode reuse the
     factory result with no re-registration → stable blob URLs, warm
     imageCache. Warns fire on cache miss only (no per-render spam).
   - Derived-wins precedence: authored width/height/svg alongside
     `container` are ignored (warn). Grounded without a bottom wall expands
     anyway + warns. Factory throw (e.g. free without y) → warn + drop.
     Ordinary objects missing width/height/svg → warn + DROP (deliberate
     behavior change — replaces silent NaN poisoning through
     `scaleObjectToSI`; another exhibit for the parked ingestion-boundary
     item, where this check should eventually live).
   - `isStatic: obj.isStatic ?? false` — authored wins over the factory's
     dynamic default (fixed-bucket case).
   - Expansion env derives `sceneMin = min(800,600)/configPixelsPerUnit`
     (never LLM-exposed) and `hasBottomWall` from `environment.walls`.
3. **Prompt** — full pipeline: `shared_preamble` one-exception sentence;
   `skeleton_fragment` plans containers via `"container": true` INSTEAD of an
   svg name (protects the svg-verbatim invariant — no sentinel manifest
   name) + bottom-wall rule + example skeleton entry; `objects_fill_fragment`
   new item 2 (param guidance: innerWidth diorama-sized ≥1.5× payload,
   walls/mode semantics, y: 0 for grounded, low-friction sliding catcher vs
   isStatic bucket, never emit width/height/svg) + container variant in the
   output example + required-fields line reworded; `objects_remix_fragment`
   preserve-line covers `container` params (remix inherits the fill teaching
   by composition). `objects_fill.py`'s inline user message got the container
   sentence + a drive-by fix of its stale "real-world bounding-box" sizing
   wording (contradicted the fragment's diorama rule — pre-existing).

**CupCatchSimulation converted to the JSON-authored form** — the living
exhibit; WagonStop/BoxCatch deliberately stay on the direct factory path
(regression coverage + the factory API remains a supported consumer).

**Headless-verified** (real expansion → registration → manifest lookup →
scale → decompose): derived svg `container-cup`, width/height 0.744/0.772,
seated y = 0.386 exact; 3-part compound `[4,4,4]`; L-profile → 2 quads;
cache hit returns the identical ManifestItem (no re-registration); param
change re-synthesizes; all four defensive drop/warn cases fire. tsc/lint/
build clean (known baselines only). Bonus hardening: CC2's dev-gate is now
`(import.meta as any).env?.DEV` — outside Vite (headless tsx) `env` is
undefined and the old form THREW, killing any harness that reached
`decomposePolygonShape`.

**SHIP GATE — PASSED IN FULL 2026-07-19 (Bill), see ⛴️ below:** (1) drive `/simulation/cup-catch` w/ and w/o
`?colliders=1` — 3 colored parts, exact seating, vx traces converge on u/3,
no rectangle-fallback warnings; Planck spot-check. (2) Tweak-JSON round trip:
edit `container.innerWidth` live → clean re-synthesis; saved JSON carries
compact `container` only; save → reload → real collider. (3) WagonStop/
BoxCatch regression (factory path). (4) EditOverlay on the cup: x-drag
commits, y-drag/resize snap back (derived-wins; v1-accepted). (5) `modal
serve` + a container-inviting prompt ("a ball is launched and lands in a cup
that slides") → skeleton plans `"container": true` + bottom wall; objects
stage emits container params sans width/height/svg; sim loads and catches;
remix "make the cup deeper" preserves the container form. (6) On pass:
`modal deploy` (invariant #11), flip CC5 → done, PHYSICS_SHAPES S2.1 note →
shipped.

### ⛴️ 2026-07-19 — PHASE 4 SHIPPED: gate passed in full, deployed, prod-validated (CC5 → done)

Every gate leg passed across the two drive sessions:
- **Local drives:** cup-catch — snap-backs exactly as designed (Bill: "good
  UI experience while we maintain one-truth JSON through V1"); wagon-stop —
  factory-path objects keep normal drag/resize (correct: no `container`
  field → expansion pass-through; snap-back is container-field-only).
- **Tweak-JSON round trip:** parent config loaded live, payload swapped
  (baseball→cannonball), masses edited — cup re-expanded from compact params
  every time, and **tipped correctly under mass-ratio changes** (bonus
  dynamics validation: the expansion-built compound behaves right in the
  historically engine-sensitive tipping regime, on Rapier).
- **`modal serve` generate:** "ball launched into a sliding cup" → skeleton
  planned `"container": true` + `"bottom"` wall; objects stage emitted
  `container: {innerWidth: 4.0, wallHeight: 4.0}` with NO width/height/svg;
  sizing pedagogy followed (innerWidth 2.2× payload; wallHeight ≈
  innerWidth; low friction 0.12; bonus cup-velocity slider).
- **`modal serve` remix:** "make the cup deeper" → structural diff vs parent
  = exactly `objects[1].container.wallHeight: 4.0 → 6.0` — container form
  preserved, correct param, nothing else touched. Router routed correctly
  despite its container-blind parent summary (confirmed cosmetic-only).
- **Deployed** (`modal deploy` × generate + remix, Bill's apps) and
  **prod-validated in the web app**: fresh prompt → cannonball + sliders +
  cup, worked; remix "taller and wider cup" → worked.

The exhibit pair from the serve tests is preserved at
`modal_functions/testing_prompt_change/parent.json` (first LLM-authored
container) and `remix.json` (its one-field remix diff). Statuses flipped:
roadmap CC5 → done; PHYSICS_SHAPES S2.1 → shipped; CLAUDE.md invariant #1
gains the expansion pre-pass as part of the ingestion seam. Observations for
later, already recorded elsewhere: LLM naturally picks `baseball` (census
over-cap — raises upstream circle-collider priority); default trajectory
landed short of the cup (LLM placement quality, sliders carry the pedagogy).

### 2026-07-19 — SCOPED: seam diagnostics bus + visible badge (decision from the first Phase-4 drive)

**The specimen that forced the question.** Bill's cup-catch drive on Planck:
the payload was `baseball` — a census-listed over-cap collider (18-vert
outline → parts `[3,17]`, part 1 = 17 verts). Planck's silent truncate+rehull
built an effective collider whose boundary sits outside the *drawn* ball
(hulling fills the outline's concave region), so the cup started moving on a
contact nobody could see. The CC2 dev-warn fired **correctly** in the console
— but Bill wasn't watching the console, and diagnosed it only by
physics-reasoning (raise launch height → cup moves later → invisible
boundary). Verdict: **the guard worked; the channel failed.** The payload was
swapped to `cannonball` (census-clean) and the sim behaves.

**DECISION (Bill, 2026-07-19): build option A — a seam diagnostics bus with a
visible badge.** Scope (documented now, build later):
- A `reportDiagnostic(...)` helper at the gist-owned seams that still
  `console.warn`s AND pushes a keyed entry into a module-level session store
  (same singleton pattern as `registerImportedRenderable`). Keyed entries
  dedupe the React StrictMode double-fire for free.
- UI: an **amber badge on the debug panel** with a count, expandable to the
  message list. Dev-gated, like the warns it surfaces.
- Initial producers: the CC2 over-cap warn (`warnOnOverCapParts`,
  [shapeHelpers.ts](src/physics/shapeHelpers.ts)) and the container-expansion
  seam's four warn/drop cases
  ([containerExpansion.ts](src/lib/containerExpansion.ts)).
- **Why A over the alternatives:** console interception (B) inherits all dev
  noise — rejected; badging the overlay checkbox (C) points at an instrument
  that can't show engine-actual geometry — complement, not substitute. A is
  one mechanism with many future producers: the parked **dup-id visible
  warning** and the parked **ingestion-boundary checks** both independently
  called for exactly this surface — the bus is their future UI home (they
  stay parked; the bus is the surface, not the fix). It is, in effect, the UI
  face of the parse-don't-validate boundary.
- **Three-places: intentionally untouched** — pure dev/observation tooling,
  nothing LLM-authorable.

**Engine-actual fixture readback (option D / the deferred CC1 layer) stays
DEFERRED — explicit decision.** The baseball drive is its **first live
justification** (with readback, "cup moved early" would have been a
five-second visual diagnosis: Planck's true hull drawn over the sprite), and
that is now on record — but Bill is about to dramatically reduce failing SVGs
upstream (icon-repo census cleanup), so the specimen class should get rare.
Revisit if over-cap colliders keep reaching drives after the upstream
cleanup.

**Upstream remains the cure:** baseball's correct fix is a `type:"circle"`
collider in the icon repo (round-object pattern, census 2026-07-18) — neither
the bus nor gist geometry work.

### 2026-07-19 — FUTURE FEATURE (wishlist-stage): `container.angle` as a seating-aware pose, not a raw initial condition

Bill's framing from the first Phase-4 drive session: **`grounded` is a
quality-of-life seating solver, and a future container angle option must
compose WITH it** — which is exactly why it is NOT the same thing as plain
`ObjectConfig.angle` (a raw center-rotation that leaves the author to
hand-solve a non-intersecting, non-floating pose against the ground).

Two regimes, both "grounded means in contact":

1. **Slope-following (derived angle).** When ground can slope (gated on the
   future sloped-ground work — env-shapes charter / parked ground-semantics
   item), a `grounded` container on a θ-incline inherits θ automatically:
   seating = flush contact, both bottom corners on the surface line. The
   author writes nothing; angle becomes a consequence of `grounded` exactly
   as y is today.
2. **Authored tip angle (corner seating).** For start-at-tipping-angle demos,
   `grounded` degrades gracefully from edge-contact to **corner-contact**:
   the sign of the authored angle φ picks the bottom corner on the tip side,
   and the solver computes the pose so that corner touches the ground
   exactly — for the current rectangular envelope, center height above
   ground = `(w/2)·|sin φ| + (h/2)·cos φ`. Zero placement arithmetic for the
   author, same QoL contract.

Implementation notes recorded now so the future slice starts smart:
- **Regime 2 needs no sloped ground** — pure seating math on today's flat
  y=0 floor; it can land first, independently of the ground work.
- **Neither regime touches collider geometry** — the synthesized shape is
  unchanged; only the spawn-pose solver grows (angle joins y as a derived
  output of `grounded`; `free` mode would presumably pass angle through raw
  like any object).
- This is the **second concrete case of the "seat object on surface"
  placement-helper seed** (Findings 2026-07-10, grounded decision #4:
  "generalizes to angled ramps") — when this feature is picked up, that seed
  and this entry are the same workstream.
- Three-places: nothing landed — wishlist-stage note only; schema/prompt
  untouched until the slice is scoped.
- **Forward link (2026-08-06): the seed's RAMP half is REALIZED** — the
  `seatOn` field (Notes_on_Ramps_and_Tracks_Refactor.md, decisions SO1–SO7)
  seats any object flush on an incline, y + angle derived from authored x at
  the expansion seam, drag-snap included. THIS entry's container half
  (slope-following `grounded`, authored tip angle) remains future — when it
  is picked up, the ramps note's seatOn machinery (`seatAtX`,
  surface-frame math in `src/lib/objectExpansion.ts`) is the starting
  point, and the two regimes here should be reconciled with `seatOn`'s
  start-pose-only semantic.

### 🟢 2026-07-20 — seam diagnostics bus SHIPPED (scoped → shipped in one day) + a ratified semantic: the bus reports LIVE truth, never past events

**Shipped as scoped 2026-07-19, drive-confirmed by Bill same day.** The build:

- **[src/lib/diagnosticsBus.ts](src/lib/diagnosticsBus.ts)** —
  `reportDiagnostic(key, message, ...consoleArgs)`: unconditional
  `console.warn` passthrough (pre-bus console behavior preserved; extra args
  keep error objects inspectable) + a keyed module-level session store (same
  singleton pattern as `registerImportedRenderable`; keys dedupe StrictMode
  double-fires). `subscribe`/`getSnapshot` are `useSyncExternalStore`-shaped
  with a reference-stable cached snapshot; **subscriber notification is
  microtask-coalesced** because producers (and the clear, below) run during
  render on purpose — a synchronous notify would setState the panel
  mid-render of `JsonSimulation`. No React import, no `import.meta` reads —
  headless-harness safe.
- **Producers wired:** the CC2 over-cap warn
  ([shapeHelpers.ts](src/physics/shapeHelpers.ts) `warnOnOverCapParts`, DEV
  gate unchanged at the callsite) and ALL of the container-expansion seam's
  warn/drop cases ([containerExpansion.ts](src/lib/containerExpansion.ts)).
- **UI:** amber count pill on the **collapsed** Debug Mode button (visible
  without opening anything — the direct fix for the baseball specimen's "the
  guard worked; the channel failed") + an expandable ⚠ Diagnostics list at
  the top of the panel ([AdvancedDebugPanel.tsx](src/components/simulation_components/AdvancedDebugPanel.tsx)).
  Dev-gated; zero prop plumbing (the panel subscribes to the store directly).
- Three-places: intentionally untouched, per scoping — nothing LLM-authorable.

**The drive immediately found the missing lifecycle rule.** First drive
(cup-catch, baseball payload): pill fired as designed. But swapping the
payload to `cannonball` and saving left the **stale baseball pill** in place
until a hard reload — the session store had no notion of "this config
changed." Bill's second drive (dup-id, below) then surfaced the inverse: a
commit-time rename reported to the bus was wiped by navigation before the
badge could show it.

**RATIFIED (Bill, 2026-07-20): the bus is grounded in LIVE config-state
truth — it reports what is true of the currently-loaded config and what will
happen when the sim runs, never past events.** A "sticky" notice about a
past action (e.g. "your save renamed an id") was explicitly rejected —
past-event notices bleed across contexts and confuse. Mechanics that
implement the rule:

- **Clear-on-re-expansion:** `JsonSimulation`'s expansion memo calls
  `clearDiagnostics()` before every re-expansion (Tweak-JSON apply/save,
  sim navigation, Import Object). Each config generation re-derives its
  diagnostic set from scratch.
- **Producers re-derive:** the container authoring checks moved OUTSIDE the
  factory's signature cache (per-call, bus-deduped) — a cache hit after a
  clear must not lose a still-true warning. Side payoff: fixed two latent
  staleness bugs (`hasBottomWall` was never in the cache signature;
  same-signature duplicate ids never warned at all). The CC2 warn re-reports
  naturally: `ObjectRenderer`'s body-build effect deps include `svg`, so a
  config change rebuilds bodies and re-runs decomposition after the clear.
- **Consequence for future producers** (FBD analytical-vs-engine delta,
  ingestion checks): they must be re-derivable from current state, and
  per-frame producers need their own throttling (the bus dedupes by key; it
  does not rate-limit console passthrough).

**Dup-id crash RESOLVED same day (retired from parking_lot.md, entry
2026-07-15).** Symptom: two objects sharing an `id` white-paged the whole
sim. Cause (recorded at parking): both adapters **correctly throw** on a
duplicate body id ([RapierAdapter.ts:308](src/physics/rapier/RapierAdapter.ts#L308),
[PlanckAdapter.ts:236](src/physics/planck/PlanckAdapter.ts#L236)), but the
second `ObjectRenderer`'s body-build effect throw escaped with no error
boundary anywhere — the blast radius was the bug, not the refusal. The fix
**supersedes the parked fix-path-1 preference (auto-rename at the commit
boundary, Bill 2026-07-15)** — an intermediate auto-rename build worked but
its rename notice was a *past-event* diagnostic, which the live-truth rule
forbids; Bill's refinement (2026-07-20): *"I literally can't save invalid
JSON — catch duplicate ids there too."* Final two-layer architecture
([src/lib/objectIdGuard.ts](src/lib/objectIdGuard.ts)):

1. **Commit boundaries REJECT** (`findDuplicateObjectIds`): the Tweak-JSON
   editor ([JsonEditor.tsx](src/components/JsonEditor.tsx)) and the
   paste-to-create path ([CreateSimulation.tsx](src/components/CreateSimulation.tsx))
   block the save exactly like a parse error — duplicate ids can no longer
   be persisted from either human path. Drive-confirmed by Bill.
2. **Runtime seam RENAMES as backstop** (`dedupeObjectIds`, in the expansion
   memo ahead of container expansion): configs that arrive broken from
   elsewhere (legacy DB rows, LLM output — the schema `.describe()` on `id`
   already demands uniqueness, but nothing enforces it in generation) render
   best-effort with later duplicates renamed `<id>-N` (first-wins keeps
   control/output/graph bindings on the first object) plus a bus diagnostic —
   which IS live truth: *this loaded config carries duplicates*. Derived-only,
   never written back to `editedConfig`.

Parked fix 2 (error boundary around the sim canvas — catches the whole class
of renderer throws) stays parked as its own residual entry; fix 3 folds into
the runtime-ingestion-boundary item as before.

**Incidental gotcha worth remembering** (found by Bill tinkering with badge
colors): [src/index.css](src/index.css) has a base-layer `button` rule
(`bg-primary text-white`, `hover:bg-primary-dark`) that bleeds through any
button that doesn't set its own background — and `button:hover` (specificity
0-1-1) beats a plain `bg-*` utility (0-1-0) on hover. The codebase idiom is
therefore to ALWAYS pair an explicit `bg-*` with a `hover:bg-*` on every
button; the diagnostics toggle was the one button in the debug panel that
broke the idiom.

## Pipeline & engine-parity checks (Phase 1/4 prerequisites)

Two things to verify before concave colliders are real beyond a hand-authored
proof. (Status lives per-entry: the generator route is deferred 🔵 as of
2026-07-10, Planck parity tested 🟢 2026-06-22.)

### 🔵 SVG-generation → render pipeline must emit concave collider vertices
The SVG generator is **external to this repo** (`manifest.json` is
`exported_by`/`export_mode: all_approved` — a separate tool with an approval
workflow; the repo only has the *consuming* side:
[renderableManifest.ts](src/lib/renderableManifest.ts) +
[shapeHelpers.ts](src/physics/shapeHelpers.ts)). Today that generator emits only
three collider shapes: `circle`, `box`, and `convex` (a **convex hull** of the
sprite's vertices). It has no way to output a *concave* outline — so the cup's
concave collider in Phase 0 was **hand-authored directly in `manifest.json`**.

#### Audited 2026-06-22 — the generator lives at `../physics_sim_icon_dev`

A React/Vite + Supabase tool (own `CLAUDE.md`, `Dev_Tasks.md`). Audit findings —
the gap is **narrower than feared**: the storage/schema layer already supports
compound; only *generation* throws concavity away.

- **Storage/schema already supports concave.**
  `src/lib/colliderSchema.js` already lists `compound` in `COLLIDER_TYPES` and
  has `validateCompound` + a `compound` case in `transformCollider`. A `compound`
  (or a concave-vertex `convex`) collider would persist and export fine today.
- **Concavity is destroyed in exactly one file:** `src/lib/colliderGenerator.js`.
  Both entry points hull the points immediately, filling the cup's mouth:
  - `generateCollider()` (auto-detect) → `convexHull` → circle/box/convex.
    Callers: `src/App.jsx:269`, `src/components/DetailModal.jsx:303` & `:380`.
  - `computeColliderForType(svg, type)` (type-directed) → `convexHull` →
    circle/box/convex; **no** compound/concave branch. Caller:
    `src/lib/svgGeometry.js:496` (the rescale-to-fit flow).
- **Second structural blocker — point ORDER.** `extractFilledVertices` returns an
  *unordered point cloud* (`points.push(...verts)` across all elements). A convex
  hull ignores order, but decomposition needs an **ordered simple polygon**
  (outline traversal). So concave support needs a new ordered-extraction route
  (preserve a single outline `<path>`/`<polygon>`'s traversal), not the hull.
- **The editor actively forbids concave.** `DetailModal.jsx:686-697` shows an
  amber *"Polygon is concave — physics engines require convex shapes"* warning;
  `ColliderEditor.jsx:57` flags it; `colliderToEditableVertices` returns `null`
  for `compound`. For the container goal this UX is now backwards — gist *wants*
  concave outlines — so the warning must become "concave → decomposed downstream
  (allowed)", and compounds eventually need to be editable.
- `poly-decomp` is **not** a dependency there (0 lockfile hits); gist has it.

#### Decision 2026-06-22 — decompose DOWNSTREAM (generator emits the outline)
The generator emits the **true concave silhouette** as a `type:"convex"` collider
(the existing misnomer); gist's `decomposePolygonShape` decomposes it at load —
identical to what the Phase 0 hand-authored cup does. Chosen over decomposing
upstream so decomposition stays single-sourced in gist (no `poly-decomp` in two
repos, and stored geometry == authored outline). **Concrete change set in
`../physics_sim_icon_dev`:**
1. `colliderGenerator.js` — add an ordered-outline extraction path (no hull) and
   a concave branch in `computeColliderForType` that emits the raw outline.
2. `colliderSchema.js` — `validateConvex`'s `≤ MAX_CONVEX_VERTICES` (8) is a
   *per-Planck-part* limit that only applies **after** decomposition; a raw
   concave outline stored as `convex` will trip it once a silhouette exceeds 8
   pts (the cup's 8-pt U squeaks by). Reconcile: relax/bypass the cap for
   outlines flagged concave, or validate winding/self-intersection instead.
3. Editor UX (`DetailModal.jsx` / `ColliderEditor.jsx`) — flip the concave
   warning from "forbidden" to "will be decomposed".

Until that lands, concave colliders stay hand-authored per asset in
`manifest.json` (fine for prototyping, not for scale).

#### Disposition 2026-07-10 — SUPERSEDED for Tier 1; deferred as the Tier-2 route (🟡→🔵)
The Rung 2 containers are now built **parametrically in gist**
(`makeOpenContainer`, see Findings 2026-07-10) — no generator motion needed
for the highest-priority shapes. The change set above stays valid for
arbitrary art-driven concave shapes (Tier 2). Separately, the generator's
future scope **expanded** (Bill, 2026-07-10): custom compound shapes plus
environment/background shapes — interactive, purely decorative, or purely
informative (tick marks, targets, pathways, guiding text). That charter
opens its own doc when the work starts.

### 🟢 Planck parity — TESTED 2026-06-22 (headless harness)
The compound path is implemented in **both** adapters via different routes
(Rapier: one `convexHull` collider per part, [RapierAdapter.ts:128](src/physics/rapier/RapierAdapter.ts#L128);
Planck: one `planck.Polygon` **fixture** per part, total mass = Σ(density·area),
[PlanckAdapter.ts:84](src/physics/planck/PlanckAdapter.ts#L84)). Drove the **real**
`scaleManifestColliderToShape` decomposition + **both real adapters** headlessly
(tsx), stepping at the precompute `dt = 1/480`, across catch / arc / rim-strike /
topple scenarios. Verdict: **the compound works in Planck; dynamic response
differs quantitatively; the marginal "tip" outcome is engine-sensitive.**

**Passes (safe to author cup sims on either engine for the core pedagogy):**
- **Structural build.** The cup's 8-pt U decomposes to **3 convex quad parts, all
  CCW, ≤8 verts** — so Planck's winding requirement and ≤8-vertex cap are both
  satisfied; no degenerate-fixture errors. (The CCW-per-part result matters because
  Planck uses the vertices directly as a polygon, whereas Rapier re-hulls each
  part and is order-independent — this was the headline risk and it's clear.)
- **Mass / inertia / COM match.** cup mass 1.000 both; inertia 0.093 (Rapier) vs
  0.105 (Planck), ~13%; COM ≈ (0, −0.11) both. So Planck is fully *capable* of
  rotating the compound.
- **Catch (straight drop).** Tight parity — ball settles inside the cup, low &
  slow, cup upright, in both engines.
- **Genuine topple** (a high horizontal shove carrying the COM past the support
  edge): **both tip** (Rapier ω≈2.7, Planck ω≈1.5, angle grows). Planck rotates
  the compound correctly when the load truly leaves the base of support.

**Divergences (do NOT assume identical tumble across engines):**
- **Within-base impact "rock" is engine-sensitive.** A heavy ball dropped on the
  rim at offset 0.30 m — *inside* the cup's full-width base of support — tips in
  Rapier (ω 3.1→12 across a vy −2…−18 sweep) but **never** in Planck (ω exactly 0;
  it stays planted). This isn't a structural bug (inertia is fine) — it's a
  dynamic-impact/solver difference. Note: the authored *arc* sim's "tumble" likely
  lives in this marginal regime, since this cup's base of support spans its whole
  width (a rim hit rarely pushes the load past the edge).
- **Planck is consistently more energetic.** In every dynamic case Planck slides
  the cup ~2–3× farther and the ball retains far more speed (arc: ball 9.1 vs 2.3
  m/s; topple: cup slid 19.3 vs 6.6 m). Same sim → visibly different on Planck vs
  Rapier. Likely restitution/solver-default differences; not root-caused here.

**Bottom line:** Rapier stays the validated default. The cup is engine-*portable*
for build + catch + genuine topple, but **not pixel-identical**; a tumble tuned on
Rapier may not reproduce on Planck. The same cross-engine response gap is the kind
tracked in [GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md).
(Harness was `scripts/_cupParityCheck.ts`, deleted after recording — re-creatable
from this entry.)

---

## Coordination with other tracks

- **Vector arrows**: `showVectors: ["velocity"]` on both ball and wagon is the
  ideal visual for the ball-in-wagon demo (the wagon's velocity arrow collapses
  on impact while the ball's persists).
- **Sensors / contact events** ([GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md)):
  Phase 3 catch-detection is a cheap stand-in until those land.
- **Joints** (wishlist): a wagon with real wheels needs revolute joints; deferred.

### 🟢 2026-08-07 — CC2's over-cap remediation backlog CLEARED: full-manifest census 19 → 0 (upstream fix, verified downstream)

**What happened.** Bill shipped a renderables update from the generator repo
(`physics_sim_icon_dev`). A downstream census using GIST's own
`decomposePolygonShape` — the only authoritative measure, since the guard fires
on decomposed PARTS — reports the over-cap count has gone to zero.

| manifest | entries | polygon colliders | raw outlines >12 verts | **parts >12 verts after decomp** |
|---|---|---|---|---|
| HEAD (committed) | 212 | 152 | 70 | **19** |
| Bill's update | 243 | 171 | 128 | **0** |

The HEAD figure of **19 reproduces the 2026-07-18 CC2 census exactly**, which is
what makes the 0 trustworthy — the harness was validated against a known answer
before being believed.

**Disposition of the 19:** 18 genuinely re-authored, 1 (`hamburger`) removed from
the library. `bowling_ball` went from a 17-vertex outline decomposing to a
16-vertex part → a **circle** (center [32,32], r 30.52) — exactly the round-shape
fix the July census recommended ("most are ROUND shapes → icon-repo fix = circle
collider, not re-tessellation"). Also fixed: alarm_clock, weather_balloon,
baseball, globe_bulb, orange_fruit, red_heat_lamp, **bird** (the guard's original
motivating specimen), cat, donut, large_analog_clock_face, soccer_ball,
basketball, duck, frog, planet, pumpkin, porous_asteroid. Zero newly over-cap.
Four entries removed in total (autumn_leaf, drum, hamburger,
slide_of_pepperoni_pizza); none is referenced anywhere in `src/`.

**Why it stayed clear is structural, not luck** (generator-side, `Dev_Tasks.md`
Task 16): `coarsenUntilPlanckSafe` is now the DEFAULT inside both trace tools, so
colliders are born safe; any `✖P` item is bulk-moved to the `fix` status; and
"Download approved" filters `status === "approved"`, so a failing collider
**cannot reach an exported manifest**. The downstream census therefore confirms
an upstream invariant rather than discovering anything — a weaker claim than it
first appears, and worth stating honestly.

**Two measurement gotchas, both of which bit during this census.**
1. **Manifest colliders live at `item.physical_properties.collider`**, NOT a
   top-level `item.collider`. Reading the top-level key returns undefined for
   every entry and makes the whole library look collider-less. (It did, and the
   first report was wrong.)
2. **Raw outline vertex count is NOT the metric.** The updated manifest has 128
   outlines over 12 verts and 0 parts over 12 verts. `shapeHelpers.ts:23` says it
   outright: "a concave outline's own count does NOT predict its parts' counts."
   Any future census must run the decomposition, and should validate itself by
   reproducing the known-19 against the HEAD manifest first.

**CC7 (decomposition sanity, PARKED) is unaffected** — still no live specimen,
and this census produced zero decomposition failures across all 171 polygon
colliders.
