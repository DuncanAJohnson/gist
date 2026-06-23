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
