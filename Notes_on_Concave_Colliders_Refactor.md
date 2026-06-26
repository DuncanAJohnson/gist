# Notes on Concave Colliders Refactor

Status: Phase 0 SHIPPED (capability proven). Phases 1–4 proposed —
**agent-side dev PAUSED 2026-06-22** (Bill driving the manual hand-authoring loop;
see Findings → "Dev paused"). Phase 1/4 prereq checks both done.
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

---

## Pipeline & engine-parity checks (Phase 1/4 prerequisites)

Two things to verify before concave colliders are real beyond a hand-authored
proof. Both are **open** as of Phase 0.

### 🟡 SVG-generation → render pipeline must emit concave collider vertices
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
