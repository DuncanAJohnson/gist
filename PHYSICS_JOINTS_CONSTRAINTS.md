# PHYSICS_JOINTS_CONSTRAINTS.md (v1)

**Purpose.** Drive joint/constraint development from *physics topics*. This is the sibling of `PHYSICS_SHAPES.md` (colliders) and `PHYSICS_GRAPHS.md` (canonical observables). The curriculum survey (Interactive Physics workbook, PhET Pendulum Lab / Masses and Springs / Balancing Act, Physics Classroom rotation-and-balance suite) shows that a large fraction of ages-10–18 mechanics sims are **not collider problems at all** — they are pendulums, pulleys, springs, and pivots. Both engines ship these joints natively, so this workstream buys huge curriculum coverage at near-zero contact risk.

**The design tension with colliders, stated once.** A joint is a *bilateral, exact-ish* constraint solved to tolerance: cheap, smooth, low energy drift — but it can hide physics (a bead-on-wire cannot leave the wire; an ideal PulleyJoint rope has no mass, no slip, no sag). A contact is a *unilateral, emergent* constraint: separation, slack, and normal-force-to-zero events come for free — but the solver pays in jitter and energy drift. Shared topics are marked **⇄** in both files with a ruling on which physics each approach preserves.

Feeds `CLAUDE.md`.

---

## Joint inventory (the toolbox)

| Physics idealization | Planck.js (Box2D) | Rapier | Notes / asymmetries |
|---|---|---|---|
| Frictionless pin / pivot | `RevoluteJoint` (+ optional motor, limits) | revolute `ImpulseJoint` (+ motor, limits) | The workhorse. Pendulum, seesaw, wheels. |
| Rigid rod (fixed length, push+pull) | `DistanceJoint` (stiff: frequencyHz = 0) | rope joint at fixed length ≈, or fixed-length spring with high stiffness | Rod pendulum can go over the top. |
| Ideal string (max length only, slack allowed) | `RopeJoint` | rope joint (added in Rapier ~0.12; **verify availability in pinned version**) | String pendulum goes slack over the top — rod-vs-string is a first-class physics distinction, teach it. |
| Linear spring + damper (Hooke) | `DistanceJoint` with `frequencyHz`, `dampingRatio` | spring joint (added ~0.12; **verify**) | Planck parametrizes by frequency, not k: `k = m(2πf)²`. Expose k in the GIST schema and convert per-engine. |
| Slider / rail (1D translation) | `PrismaticJoint` (+ motor, limits) | prismatic `ImpulseJoint` | Collision-lab track, wagon rail, elevator problems. |
| Ideal pulley (massless, frictionless rope over a point) | `PulleyJoint` (native) | **none native** — compose from two rope constraints + custom equal-and-opposite length coupling, or scripted force pair | Real cross-engine asymmetry. Atwood on Rapier needs the shim; budget it. |
| Rigid glue | `WeldJoint` | fixed `ImpulseJoint` | Alternative to compound fixtures for quick composites (softer than a true compound — prefer compound fixtures for rigid bodies, weld for breakable connections). |
| Gear / ratio coupling | `GearJoint` (couples two joints) | none native — scripted | Mechanical advantage, gear trains. Later. |
| Wheel with suspension | `WheelJoint` (prismatic + spring) | prismatic + spring composition | Vehicle demos, later. |

**Solver honesty note.** Joint constraints in both engines are solved iteratively with stabilization; they are not symplectic. A frictionless revolute pendulum will still show small E(t) drift at coarse timesteps. Precision mode (1/480 s) applies here too, and the drift measurement belongs in the harness exactly as for chains (→ G6).

---

## Archetypes

### J1 Simple pendulum — *SHM, isochronism, g* ⭐
- **Constraint:** `RevoluteJoint` at pivot + small dense bob (a rod build), or `RopeJoint` (a string build).
- **Rod vs string is the hidden lesson:** drive the pendulum over the top — the rod carries it through (can push); the string goes slack and the bob goes ballistic until the rope snaps taut. Same "pendulum," different constraint sign convention, visibly different physics. Cheap and profound.
- **Analytical:** small angle `T = 2π√(L/g)`, amplitude-independent; large-amplitude period growth is the follow-on lesson. String-slack condition at angle θ above horizontal: v² < gL cosθ' (mirror of loop-the-loop N = 0 → see S1.2).
- **⇄ shared:** bowl/half-pipe (S1.1) is the contact implementation of the same SHM; build both, overlay both T measurements against `2π√(L/g)` — a three-way *implementation* comparison inside the numerical leg.
- **Graph:** G9 (x(t) sinusoid), G11 (T² vs L → slope 4π²/g: the classic lab linearization).
- [ ] implemented

### J2 Physical / compound pendulum — *rotational inertia of extended shapes*
- **Constraint:** `RevoluteJoint` pinning an extended body (shape built with PHYSICS_SHAPES compounding tools — deliberate cross-file archetype).
- **Analytical:** `T = 2π√(I_pivot / (m g d))`, d = pivot-to-CoM. Same shape pinned at different points → different T. Ties directly to Physics Classroom's hang-a-shape-from-a-pin CoM interactive (equilibrium hang direction finds the CoM; oscillation period finds I).
- **Graph:** G11 variant (T² vs I/(mgd)).
- [ ] implemented

### J3 Spring–mass — *Hooke's law, SHM* ⭐
- **Constraint:** `DistanceJoint` with stiffness (Planck: frequencyHz/dampingRatio; convert `k = m(2πf)²`). Vertical (hanging, equilibrium offset mg/k) and horizontal (prismatic-guided) variants.
- **Analytical:** `F = −kx`; `T = 2π√(m/k)`; hanging equilibrium `x_eq = mg/k`.
- **Graph:** G4 (F vs x → slope k, area ½kx² = stored PE — the canonical slope-AND-area graph), G11 (T² vs m → slope 4π²/k). PhET Masses-and-Springs canon.
- **Schema note:** GIST should expose k, not frequencyHz. Do the conversion inside the engine adapter so the same JSON runs on both engines.
- [ ] implemented

### J4 Lever / seesaw / balance beam — *torque balance* ⭐ (promoted from SHAPES bonus)
- **Constraint:** `RevoluteJoint` at fulcrum; boxes as riders. Canon by name in both PhET (Balancing Act) and Physics Classroom (Balance Beam) — this is core curriculum, and the joint build is exact and trivial.
- **Analytical:** balance iff `Σ mᵢ dᵢ` (left) = `Σ mⱼ dⱼ` (right); angular acceleration of unbalanced beam `α = Στ / I_beam+riders`.
- **⇄ shared:** the contact-faithful notched-fulcrum version lives at S3.2 — beam can walk and fall off, real but jittery. Build J4 first as reference truth.
- **Graph:** G5 (τ_net vs configuration; equilibrium map m₁d₁ = m₂d₂).
- [ ] implemented

### J5 Prismatic rail — *1D collision lab / constrained carts*
- **Constraint:** `PrismaticJoint` locking bodies to a horizontal axis; gravity irrelevant to the DoF.
- **Physics served:** clean 1D momentum lab (PhET Collision Lab): elastic/inelastic collisions without tipping, bouncing, or 2D leakage. Also the wagon rail (⇄ S2.3) and Newton's-second-law "apply F, measure a" runs (PhET Forces & Motion with its force/velocity/acceleration graphs).
- **Analytical:** 1D momentum + restitution closed forms; `a = F/m` under applied force.
- **Graph:** G8 (p conservation), G3 (F vs a slope = m).
- [ ] implemented

### J6 Ball on a string — *circular motion, tension readout*
- **Constraint:** `RopeJoint`/`DistanceJoint` to a fixed anchor; give tangential v₀; read the constraint impulse as tension.
- **Analytical:** uniform horizontal circle `T = mv²/r`; vertical circle: `T_top = m(v²/r − g)`, slack (T = 0) at `v_top < √(gr)` — the exact mirror of loop-the-loop's N = 0 (⇄ S1.2). Teach the pair: *wall pushes, string pulls, same centripetal budget.*
- **Graph:** G10 variant (T vs v² → slope m/r).
- **Note:** requires reading joint reaction force from the engine (both expose it: Planck `getReactionForce`, Rapier impulse queries). This readout plumbing is shared infrastructure with the coaster N(θ) reconstruction — build once.
- [ ] implemented

### J7 Path constraint / bead-on-wire — *the coaster's other implementation* (⇄ S1.0/S1.2 panel)
- **Constraint:** neither engine ships a curved slot joint (Interactive Physics does — its "curved slot joint" is the historical reference). Options: (a) dense chain of short `PrismaticJoint` segments (ugly), (b) custom positional constraint: project position onto parametric curve p(s), project velocity onto tangent, each step (clean, and GIST already owns a stepping loop), (c) kinematic parametrization: integrate `½v² + g·y(s) = const` along the curve analytically and drive a kinematic body (this is the *analytical leg wearing a numerical costume* — useful as ground truth, but label it honestly).
- **What it preserves:** smooth true-spline geometry, near-zero tangential energy drift. **What it loses:** departure physics (bilateral), contact normal force (must reconstruct from constraint force). Ruling from the shared panel: use for energy-bookkeeping sims; never for loop/launch.
- [ ] implemented (option b preferred)

### J8 Atwood machine — *Newton's second law with tension* (stretch)
- **Constraint:** Planck `PulleyJoint` (native, ideal massless/frictionless). Rapier: custom coupling shim (see inventory) — real cross-engine work, schedule accordingly.
- **Analytical:** `a = (m₂ − m₁)g / (m₁ + m₂)`; `T = 2m₁m₂g/(m₁+m₂)`.
- **Idealization warning (teachable):** PulleyJoint has no pulley mass — the classic "now include pulley inertia I" extension has *no joint-level implementation*; it needs a real disk + rope contact (out of scope) or an analytical-only overlay. State this in the sim's honesty notes: the engine models the ideal Atwood, the analytical leg can model both, and the gap is a lesson about idealization.
- **Graph:** G3 (a vs (m₂−m₁)/(m₁+m₂) → slope g).
- [ ] implemented

### J9 Double pendulum — *chaos, sensitivity* (bonus)
- **Constraint:** two `RevoluteJoint`s in series. Trivial build, spectacular payoff for older students: deterministic ≠ predictable. Twin runs with Δθ₀ = 0.001 rad diverging is the demo.
- **Analytical leg:** none closed-form — this archetype *deliberately breaks* the three-way triangle and that's the lesson (numerical-only regimes exist; energy conservation G6 remains the only analytical check).
- [ ] implemented

---

## Implementation ladder

1. **J1 + J3 + J4** — pendulum, spring-mass, balance beam. Three canon topics, three native joints, one afternoon each. Fastest curriculum coverage anywhere in the project.
2. **J5** — prismatic rail; unlocks clean 1D collision lab and F=ma runs.
3. **J6** — string circular motion + the joint-reaction-force readout plumbing (shared with coaster N(θ)).
4. **J2, J7** — physical pendulum (cross-file), path constraint (custom code).
5. **J8, J9** — Atwood (engine asymmetry work), double pendulum (dessert).

## Per-archetype definition-of-done

- [ ] Joint built with correct idealization (rod vs string vs spring made explicit in schema)
- [ ] k / L / m exposed in GIST schema in physics units; engine-specific parametrization hidden in adapter
- [ ] Analytical `evaluate(t)` or threshold overlaid in harness
- [ ] Canonical graph per `PHYSICS_GRAPHS.md` G-ID(s)
- [ ] Joint reaction forces read out where the physics needs them (tension, normal reconstruction)
- [ ] Idealization gaps documented (massless rope, frictionless pivot) — these are honesty notes for teachers, not bugs
- [ ] E(t) drift measured for oscillators at production timestep
