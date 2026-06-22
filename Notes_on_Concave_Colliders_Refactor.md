# Notes on Concave Colliders Refactor

Status: Phase 0 SHIPPED (capability proven). Phases 1–4 proposed.
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
([[diorama-scoped-physics]] / `/docs/design-philosophy`): walls must be a
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
  `?simdebug=1` per-body logging in `BaseSimulation`.

---

## Pipeline & engine-parity checks (Phase 1/4 prerequisites)

Two things to verify before concave colliders are real beyond a hand-authored
proof. Both are **open** as of Phase 0.

### 🔴 SVG-generation → render pipeline must emit concave collider vertices
The SVG generator is **external to this repo** (`manifest.json` is
`exported_by`/`export_mode: all_approved` — a separate tool with an approval
workflow; the repo only has the *consuming* side:
[renderableManifest.ts](src/lib/renderableManifest.ts) +
[shapeHelpers.ts](src/physics/shapeHelpers.ts)). Today that generator emits only
three collider shapes: `circle`, `box`, and `convex` (a **convex hull** of the
sprite's vertices). It has no way to output a *concave* outline — so the cup's
concave collider in Phase 0 was **hand-authored directly in `manifest.json`**.

For Phase 1 (content) and especially Phase 4 (landing), the generator needs to:
1. Produce concave collider vertices that trace the sprite's true silhouette
   (the open mouth of a cup, the tray of a wagon) instead of convex-hulling them
   away — i.e. the `vertices` it exports must be allowed to be concave. The
   consuming `decomposePolygonShape` already handles concave input; the gap is
   purely upstream, in what the generator chooses to emit.
2. Keep the SVG sprite and the exported collider **in sync** (same silhouette),
   so the visual hollow matches the physical hollow.
3. Ideally validate before export: CCW winding, no self-intersection, a sane
   decomposition part-count.

Until the generator supports this, concave colliders stay hand-authored per
asset (fine for prototyping, not for scale). **Action: audit the external
generator and confirm/extend its concave-collider output before Phase 1 content
work expands beyond the cup.**

### 🔴 Confirm Planck parity (Phase 0 was Rapier-only)
The compound path is implemented in **both** adapters, but they take different
routes and only Rapier has been exercised:
- Rapier — [RapierAdapter.ts:128](src/physics/rapier/RapierAdapter.ts#L128):
  one collider per part; the `polygon` case builds each part via
  `ColliderDesc.convexHull` ([RapierAdapter.ts:119](src/physics/rapier/RapierAdapter.ts#L119)).
- Planck — [PlanckAdapter.ts:84](src/physics/planck/PlanckAdapter.ts#L84): one
  polygon **fixture** per part; total mass = Σ(density·area) per fixture
  ([PlanckAdapter.ts:45](src/physics/planck/PlanckAdapter.ts#L45)).

Phase 0's test sims run `physicsEngine: "rapier"`. **Action: re-run the cup
catch + tip-over with `physicsEngine: "planck"` and check parity** — does the
ball catch, does the cup tip, is the mass/tumble behavior qualitatively the same?
Watch Planck's convex-polygon constraints: each fixture must be convex (the
decomposition guarantees this) and Box2D/Planck caps polygon vertices (~8), so a
single complex convex part could need further splitting. This is exactly the
kind of cross-engine mapping hazard tracked in
[GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md).

---

## Coordination with other tracks

- **Vector arrows**: `showVectors: ["velocity"]` on both ball and wagon is the
  ideal visual for the ball-in-wagon demo (the wagon's velocity arrow collapses
  on impact while the ball's persists).
- **Sensors / contact events** ([GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md)):
  Phase 3 catch-detection is a cheap stand-in until those land.
- **Joints** (wishlist): a wagon with real wheels needs revolute joints; deferred.
