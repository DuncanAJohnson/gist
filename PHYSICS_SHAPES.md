# PHYSICS_SHAPES.md (v2)

**Purpose.** Drive collider-geometry development from *physics topics*, not from technical capability checklists. Each archetype names the physics it teaches, why shape is load-bearing for that physics, the collider technique required in Planck.js / Rapier, and the analytical solution that anchors the analytical↔numerical↔experimental triangle.

**Siblings.** This file covers *contact/collider* archetypes. `PHYSICS_JOINTS_CONSTRAINTS.md` covers joint/constraint archetypes (pendulums, pulleys, springs, levers). `PHYSICS_GRAPHS.md` defines the canonical graph observable (G-IDs) for every archetype in both files. Topics that can be built either way carry a **⇄ shared-topic panel** naming what each approach preserves and what it sacrifices. Feeds `CLAUDE.md`.

**v2 changes (informed by survey of PhET / Physics Classroom / Interactive Physics / Algodoo curriculum catalogs):** two-hill coaster promoted to Rung 1 flagship (track-energy sims are the curricular center of gravity for ages 10–18); hoop-collider question resolved via mass override; monkey-and-zookeeper and stopping-distance added to Rung 0; lever moved to joints file (revolute joint is the honest primary implementation; the notch-fulcrum stays here as a fidelity upgrade); graph observable added to definition-of-done.

---

## The one technical fact that organizes everything

Neither **Planck (Box2D)** nor **Rapier** supports concave *dynamic* colliders natively. SAT/GJK narrow-phase only operate on convex shapes. Every concave item therefore resolves to one of three techniques:

| Technique | Use for | Planck.js | Rapier |
|---|---|---|---|
| **Convex primitive** | Boxes, disks, balls, polygons | `pl.Box`, `pl.Circle`, `pl.Polygon` | `ColliderDesc.cuboid/ball/convexHull` |
| **Static concave = one-sided chain/edge** | Bowls, tracks, loops, funnels, terrain (no inertia needed) | `pl.Chain` (one-sided), `pl.Edge` | `ColliderDesc.polyline`, `heightfield`, `trimesh` (static) |
| **Dynamic concave = compound of convex fixtures on ONE body** | Cups, boxes, wagons, nesting sockets, hooks | multiple `createFixture` on one body; arbitrary shapes via `poly-decomp.js` | multiple `ColliderDesc` on one `RigidBody`; auto via bundled **VHACD** `convexDecomposition` |

**A second organizing fact (new in v2): mass properties are overridable.** Both engines let you keep a *convex contact shape* while assigning the *inertia of a different shape*: Planck `body.setMassData({mass, center, I})`; Rapier `RigidBodyDesc.setAdditionalMassProperties(...)` or explicit collider mass properties. Whenever the concavity affects only I (not the contact geometry), skip the concave collider entirely — the annulus/hoop is the flagship case. Render the ring in SVG; collide as a circle; set I = mr².

**Difficulty climbs with concavity, and so does the physics.** The implementation ladder at the bottom follows that gradient deliberately.

---

## Rung 0 — Convex primitives (no decomposition)

Lock the per-shape analytical-vs-numerical harness here before touching concave geometry.

### S0.1 Flat-bottom box on incline — *sliding, friction*
- **Shape matters:** flat face → distributed contact manifold, clean normal/friction. Single µ regime.
- **Collider:** convex box. Trivial.
- **Analytical:** breakaway at `tan θ = µ_s`; once sliding `a = g(sin θ − µ_k cos θ)`; slide time over length L: `t = √(2L / a)`.
- **Variant — stopping distance (flat ground):** box launched at v₀ on horizontal surface, friction only: `d = v₀² / (2 µ_k g)`. Plot d vs v₀² → straight line, slope `1/(2µ_k g)` (→ G7). Canon item (Physics Classroom "Stopping Distance").
- **Graph:** G1 (v–t slope = a), G7 (d vs v² linearization).
- [x] implemented — 2026-08-06, ramp generator + `seatOn` (`/simulation/ramp-slide`, drive-passed SO-B; a = g(sinθ − µcosθ) exact on both engines; LLM authoring landed via the `ramp`/`seatOn` schema fields, SO-C). Stopping-distance variant not yet built. Canonical doc: Notes_on_Ramps_and_Tracks_Refactor.md.

### S0.2 Rolling race: hoop vs disk vs sphere — *moment of inertia* ⭐
- **Shape matters:** the purest "shape *is* the physics" demo on the list. I is a shape integral; the ramp race is iconic and the result is mass- and radius-independent.
- **Collider (RESOLVED in v2):** all three are **convex circles**. The contact geometry of a rolling hoop is identical to a rolling disk — only I differs. Use the mass-override technique (see top): circle collider + `setMassData` with the analytical I. No concave annulus collider needed, ever. The ring is a rendering concern.
  - Hoop: I = mr² · Disk: I = ½mr² · "Sphere" (2D stand-in): I = ⅖mr²
- **Engine check this archetype buys you:** whether friction-coupled rolling in each engine actually reproduces `a = g sin θ / (1 + I/mr²)` — i.e., does rolling-without-slipping emerge from the contact friction model at your timestep? This is a harness question you want answered early; require µ_s > tanθ/(1 + mr²/I) for no-slip.
- **Analytical:** `a = g sin θ / (1 + I/mr²)` → hoop ½g sinθ (slowest), disk ⅔g sinθ, sphere 5⁄7 g sinθ (fastest). Finish order independent of m and r — great prediction-vs-observation beat.
- **Graph:** G1 fan — three v(t) lines with distinct slopes from a shared origin.
- [ ] implemented

### S0.3 Off-center collision → spin — *angular impulse*
- **Shape matters:** when the impulse line misses the CoM, you get rotation. Ball = clean single-point restitution; box = face/corner manifold that can impart spin.
- **Collider:** convex (ball, box). No decomposition; the lesson is in *where* contact lands.
- **Analytical:** linear `m₁u₁ = m₁v₁ + m₂v₂` with restitution e; angular `Δω = J·d / I` where d = perpendicular offset of impulse J from CoM.
- **Graph:** G8 (system p(t) flat across collision; KE(t) step down for e < 1).
- [ ] implemented

### S0.4 Tipping vs sliding — *center of mass, stability*
- **Shape matters:** tall-narrow vs wide-flat changes whether a block slides or topples on the same ramp. L-shapes make "where is the CoM" non-obvious.
- **Collider:** convex box / L-shape (L is a 2-box compound — first taste of compounding).
- **Analytical:** tips when `tan θ > b/h`; slides first if `µ < b/h`. Toppling onset = gravity line exits base of support.
- **Canon tie-in:** Physics Classroom "Center of Mass" interactive (drag out arbitrary shape, hang from pin) is the experimental analog; hanging-from-pin CoM-finding is a joint archetype (→ J2 physical pendulum).
- **Graph:** phase diagram — (θ, µ) plane split into stick / slide / tip regions; overlay engine outcomes as points.
- [ ] implemented

### S0.5 Monkey and zookeeper — *projectile + simultaneous free fall* (new in v2)
- **Shape matters:** barely — and that's the point. Two convex bodies (dart = ball, monkey = box/ball), simultaneous release. Zero collider risk, canonical demo, carried by name at Physics Classroom.
- **Collider:** convex primitives; monkey released (dynamic, zero initial velocity) at the instant the dart launches; collision-as-goal.
- **Analytical:** both fall `½gt²` below their zero-g paths, so aiming *at* the monkey always hits, at any launch speed. Hit occurs where the line-of-sight distance is covered: `t = d/v₀`. Beautiful invariance to demo: vary v₀, always hit (until the floor intervenes).
- **Graph:** G2 (two y(t) curves, identical `−½gt²` sag).
- [ ] implemented

---

## Rung 1 — Static concave (one-sided chains): TRACKS

Low collider risk, high pedagogical payoff. The dynamic body stays convex; only the *track* is concave. **v2: promoted.** Track-energy sims (PhET Energy Skate Park, Physics Classroom Roller Coaster Model, Hewitt-adjacent "Graphs and Tracks") are the single most-assigned mechanics-sim genre for ages 10–18. This rung is core curriculum, not honors garnish.

> **⇄ SHARED TOPIC — track-following: contact (this file) vs path constraint (→ PHYSICS_JOINTS_CONSTRAINTS.md §J7).**
> The same coaster can be built two ways, and each *loses different physics*:
> - **Contact (one-sided chain):** departure from the track is *emergent* — the body leaves when the contact normal impulse hits zero. This is the whole lesson of loop-the-loop and ramp-to-launch. **Cost:** the polyline discretization makes the surface normal jump at every vertex; each jump, plus restitution-0 contact resolution and Baumgarte position correction, bleeds (occasionally injects) energy. Expect measurable E(t) drift; density of segments and timestep (precision mode 1/480s) control it. Ghost-vertex handling (Planck chain) mitigates internal-edge snags; verify equivalent behavior on Rapier polylines.
> - **Path constraint (bead-on-wire, Interactive Physics "curved slot joint" style):** tangential motion is solved to constraint tolerance → near-perfect energy behavior along the path, silky-smooth on a true Bézier/spline (no facets). **Cost:** the constraint is *bilateral* — the cart physically cannot leave the track, so N = 0 departure physics is unobservable; normal force must be reconstructed from the constraint impulse rather than read from a contact. Making the constraint one-sided (release when constraint force goes tensile) = rebuilding a contact solver by hand.
> - **Rule of thumb:** if departure/normal-force is the lesson (loop, launch) → contact. If energy bookkeeping is the lesson (two-hill, skate park) → either, but measure contact-version drift first; the drift itself is a teachable numerical-leg artifact (→ G6 total-energy trace).

### S1.0 Two-hill coaster — *KE ⇄ PE exchange* ⭐ (new flagship)
- **Shape matters:** the track profile IS the potential-energy landscape. h(x) is the physics.
- **Collider:** one-sided chain sampled from a spline/Bézier profile; body = disk (rolling) or low-friction box (sliding).
- **Analytical:** frictionless: clears hill 2 iff `h₂ < h₁` (sliding) or `h₂ < h₁` with rolling unchanged (I cancels for pure rolling start-to-same-mode); speed anywhere `v = √(2g(h₁ − y))`. Prediction beat: "will it make the second hill?"
- **Graph:** G6 (KE/PE/E_total vs t — the Energy Skate Park bar-chart made continuous). E_total flatness doubles as the solver-drift diagnostic.
- [ ] implemented

### S1.1 Half-pipe / bowl — *SHM, pendulum analogy*
- **Shape matters:** small-oscillation motion in a circular bowl ≈ pendulum of length R.
- **Collider:** one-sided chain arc (Planck `pl.Chain`) / `polyline` (Rapier).
- **Analytical:** sliding point mass, small angle: `T = 2π√(R/g)`. Rolling: multiply effective length by `(1 + I/mr²)`. Large-amplitude departure from isochronism is itself a lesson.
- **⇄ shared topic:** the pendulum proper lives in the joints file (→ J1); bowl-vs-pendulum is a deliberate compare-the-implementations demo.
- **Graph:** G9 (x(t) sinusoid; measure T, compare).
- [ ] implemented

### S1.2 Loop-the-loop — *minimum speed, N = 0 condition* — CONTACT ONLY
- **Shape matters:** the closed curved track sets the centripetal constraint at the top.
- **Collider:** closed chain loop, winding so the bead rides the inside. **Do not build this with a path joint** — bilateral constraint makes the N = 0 lesson unobservable (see shared-topic panel above).
- **Analytical:** `v_top = √(gR)` at N = 0; sliding release height `h_min = 2.5R` above bottom. Add `(1 + I/mr²)` factor for rolling.
- **⇄ shared topic:** circular motion's other face — ball-on-string tension — is a joint archetype (→ J6). Same `mv²/r`, opposite constraint sign (wall pushes, string pulls). Teach them as a pair.
- **Graph:** G10 (reconstructed N(θ) around the loop; N → 0 at top at threshold speed).
- [ ] implemented

### S1.3 Ramp-to-launch / funnel — *energy conservation → projectile handoff*
- **Shape matters:** curved ramp converts height to speed, then releases into free flight — couples track physics to projectile physics. Departure is emergent (contact-only for the same reason as S1.2).
- **Collider:** open chain; release where normal force → 0.
- **Analytical:** `v = √(2gΔh)` at launch, then standard projectile range/apex.
- **Graph:** G2 + G6 stitched at the launch instant.
- [ ] implemented

---

## Rung 2 — Open-container factory (compound-convex) ⭐ highest leverage

Cup, open box, and wagon are the **same construction problem**: 3–4 convex boxes seated into one rigid body, differing only in wall height and whether the body is free or constrained. Build the factory once; get four+ demos.

### S2.1 U-cup — *inelastic capture*
- **Physics:** catch a projectile; horizontal momentum conserved, KE lost.
- **Analytical:** `m_proj u = (m_proj + m_cup) v`.
- **Graph:** G8 (p(t) flat, KE(t) step).
- [x] implemented — SHIPPED 2026-07-15 (`/simulation/cup-catch`, local sim via
      `makeOpenContainer`; ship-gate drive passed — twin vx traces converge to
      u/3). LLM-authorability (Phase 4) SHIPPED 2026-07-19: JSON `container`
      field on ObjectConfig + expansion seam + prompt-pipeline teaching;
      cup-catch converted to the JSON-authored form as the living exhibit.
      Gate passed in full (drives, tweak round trip, `modal serve` generate +
      remix, deployed, prod web-app validated) — an LLM prompt now yields a
      working catch-the-ball container sim end-to-end.

### S2.2 Open box / ballistic pendulum — *momentum then energy* ⭐
- **Physics:** thrown mass embeds in box; box+mass swing together. The canonical "two conservation laws, in sequence, only one valid per phase."
- **Analytical:** collision `mu = (m+M)V`; swing `½(m+M)V² = (m+M)gh` → `u = (m+M)/m · √(2gh)`. KE is **not** conserved across the collision.
- **⇄ HYBRID:** this archetype is collider + joint by nature — the box is a compound-convex container (this file), the swing arm is a rod/rope (→ J1: rod = rigid DistanceJoint/RevoluteJoint arm; rope = RopeJoint if you want slack physics). Flag in schema as the first deliberately mixed build.
- **Graph:** G8 across the collision, then G6 during the swing — the two-graphs-two-laws structure is the pedagogy.
- [x] implemented (COLLISION PHASE ONLY) — SHIPPED 2026-07-15
      (`/simulation/box-catch`; capture V ≈ u/7 and post-capture slide verified).
      The swing phase remains gated on J1 (joints workstream — no adapter joint
      support yet).

### S2.3 Wagon / cart — *Newton's first law, inertia*
- **Physics:** cart stops abruptly, unsecured payload keeps moving.
- **Collider:** open container, low walls.
- **⇄ shared topic:** "railed" can be a real rail (chain/edge ground + friction, this file) or a PrismaticJoint (→ J5). Prismatic gives a perfectly 1D lab (PhET Collision-Lab-style); real ground + friction keeps the messiness (tipping, bounce) that makes the demo honest. Support both via factory flag `free | grounded | prismatic`.
- **Analytical:** payload continues at v; relative displacement = v·Δt during the stop.
- **Graph:** G1 twin traces — cart v(t) vs payload v(t) diverging at the stop.
- [x] implemented — SHIPPED 2026-07-15 (`/simulation/wagon-stop`; evolved during
      the ship-gate drive into the clean N1 variant: `walls: 'left'` open-front
      wagon + static mid-window stopper; payload keeps vx, twin traces diverge at
      the stop). `grounded` mode (real ground + friction) is the shipped rail;
      prismatic still J5-gated.

> **Factory spec:** `makeOpenContainer({ innerWidth, wallHeight, wallThickness, floorThickness, mode: free|grounded|prismatic })`. Cup = tall walls; box = medium; wagon = low. Welds N convex fixtures to one body, computes combined mass/CoM/inertia. Single highest-ROI task in the file.
> **SHIPPED 2026-07-15** as `src/lib/openContainer.ts` with `mode: free | grounded` (prismatic deferred to J5) plus a drive-requested addition to the spec: `walls: 'both' | 'left' | 'right'` — one-sided containers (L profile) for open-ended demos. Combined mass/CoM/inertia come free from the engines' compound fixtures. See Notes_on_Concave_Colliders_Refactor.md, Findings 2026-07-10 → 2026-07-15.

---

## Rung 3 — Nesting sockets (decomposition + resting stability)

### S3.1 Concave-bottom stacking blocks — *F = ma, adding mass*
- **Shape matters:** concave underside indexes onto the block below so a stack stays put while you add weight.
- **Collider:** **decompose** the concave underside (poly-decomp.js / VHACD). The hard part is **resting-contact stability** — jitter, socket seating, sleeping thresholds.
- **Analytical:** same drive force, growing mass → `a = F / Σm`.
- **Risk:** contact-manifold jitter on nested seats. Budget tuning time (substeps, slop, restitution = 0).
- **Graph:** G3 (a vs 1/Σm → straight line through origin, slope F).
- [ ] implemented

### S3.2 Notched fulcrum seesaw — *fidelity upgrade of the lever* (moved from bonus)
- The lever/seesaw proper is a joints archetype (→ J4, revolute pivot — cheap, exact). This entry is the *contact-faithful* version: beam resting in a V-notch on a triangular fulcrum. Near-point concave seat; the beam can walk, slip, and fall off — which is real and demo-honest, and also a mini Rung-4 contact regime.
- [ ] implemented (only after J4 exists as the reference implementation)

---

## Rung 4 — Hooks / latches (the corner-contact boss fight) — do last

### S4.1 Hook catching on an edge — *torque about a lip, friction hold*
- **Shape matters:** a hook that snags and holds a ledge is near-singular corner contact; hold depends on friction and torque balance about the lip.
- **Collider:** decomposed concave hook; expect near-point contact and friction-sensitive equilibrium. Hardest contact regime in the file.
- **Analytical:** holds while restoring torque about the lip ≥ slip threshold; goal-state = "captured on edge." Good experimental-leg candidate.
- **Risk:** highest. Implement only after Rungs 0–3 are solid.
- [ ] implemented

---

## Bonus archetypes

- [ ] **Physical / compound pendulum** — moved to joints file (→ J2); listed here because the *shape* sets I and CoM. Cross-file by design: shape from this file's compounding tools, pivot from the joints file.

---

## Implementation ladder (climb convexity = climb physics)

0. **Convex primitives** — box-slide + stopping distance, rolling race (mass-override), off-center collisions, tipping, monkey-and-zookeeper. Lock the analytical harness per shape.
1. **Tracks (static chains)** — two-hill coaster ⭐, bowl, loop, launch. Energy conservation is the curricular center of gravity; measure solver energy drift here and publish it in the harness.
2. **Open-container factory (compound-convex)** — cup / box / wagon in one build. ⭐ start here or at Rung 1 for fastest payoff.
3. **Nesting sockets + notched fulcrum** — decomposition + resting stability.
4. **Hooks / latches** — corner-contact boss fight.

## Per-archetype definition-of-done

- [ ] Collider built with the correct technique (convex / chain / compound / decomposed / mass-override)
- [ ] Analytical solution implemented as closed-form `evaluate(t)` or threshold condition
- [ ] Numerical (engine) output overlaid against analytical in the harness
- [ ] **Canonical graph produced per `PHYSICS_GRAPHS.md` G-ID(s) named in the archetype** (new in v2)
- [ ] Experimental leg noted (what the teacher observes / measures in the classroom)
- [ ] Stability checked: no jitter at rest; energy/momentum conserved where the physics demands it; for Rung 1, E(t) drift quantified and documented
