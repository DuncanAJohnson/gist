# BENCHMARK_SIMS.md (v1)

**Purpose.** External reference simulations that serve as GIST's internal acceptance test cases. The core question for each: *starting from a natural-language teacher prompt plus minor tweaking, can GIST reproduce the pedagogical core of this sim — and where can it exceed it?* Sibling of `PHYSICS_SHAPES.md` (S-IDs), `PHYSICS_JOINTS_CONSTRAINTS.md` (J-IDs), `PHYSICS_GRAPHS.md` (G-IDs). Feeds `CLAUDE.md`.

**What "pedagogical core" means (and doesn't).** We are not cloning UI. Each benchmark names the 2–4 things a learner must be able to *do and see* for the sim to teach its concept (vary these parameters, observe this graph/vector/bar chart, hit this prediction beat). Matching that is a pass. Polish, skins, and game wrappers are out of scope.

**Scoring rubric (0–3 each, per benchmark):**

| Dimension | Question |
|---|---|
| **A. Authorability** | Did the LLM leg produce a working scene from the example prompt with ≤ 2 rounds of tweaking? |
| **B. Physics fidelity** | Does the numerical output match the analytical overlay within harness tolerance? |
| **C. Observable parity** | Are the benchmark's key observables present (named G-IDs, vectors, event markers)? |
| **D. Interaction parity** | Can the learner vary what the benchmark lets them vary? |
| **E. Exceed potential** | Does GIST add something the benchmark structurally can't (three-way comparison, arbitrary scene edits, parameter sweeps, cross-engine check)? |

**Meta-metric:** time-to-working-sim from the teacher prompt. Log it every run; it is the product.

**URL hygiene:** URLs marked ✔ were verified 2026-07. PhET landing pages follow the stable pattern `phet.colorado.edu/en/simulations/<slug>`; the direct-run pattern is `phet.colorado.edu/sims/html/<slug>/latest/<slug>_en.html`. Physics Classroom sims live under `physicsclassroom.com/interactive/<unit>/<name>`; where an exact path is unverified, start at the verified index `https://www.physicsclassroom.com/interactive` ✔ and search by name.

---

## Tier A — Named recreation benchmarks (the eval suite)

### B1 · PhET Projectile Motion ("the cannon") ⭐
- **URL:** https://phet.colorado.edu/en/simulations/projectile-motion ✔
- **Concepts:** projectile kinematics, independence of x/y motion, angle/speed/height effects, (optional) drag.
- **Pedagogical core:** fire from adjustable cannon (angle, v₀, height); target-hitting challenge; trajectory trace persists across shots for comparison; velocity/acceleration vector display.
- **GIST mapping:** S0.5 bodies, S1.3 handoff · Graphs G2 (x(t) straight / y(t) parabola), G1.
- **Example prompt:** *"Make a cannon on a small hill that fires a ball. Let me change the launch angle and speed with sliders. Show the path of each shot so I can compare them, and put a target crate on the ground 40 meters away."*
- **Pass:** three trajectories at different angles persist on screen; analytical range overlay matches impact point; complementary angles (30°/60°) land together.
- **Exceed:** GIST's ball is a *real rigid body* — it can bounce, knock the crate over, or land in a cup (S2.1). PhET's projectile is a kinematic particle; ours joins the momentum unit for free. Note: PhET's drag model is genuine quadratic aerodynamic drag; Planck/Rapier linear damping is not (per prior engine analysis) — an honesty-note case, not a parity case.

### B2 · PhET Collision Lab ⭐
- **URL:** https://phet.colorado.edu/en/simulations/collision-lab ✔
- **Concepts:** momentum conservation in 1D/2D, elasticity spectrum, KE fate.
- **Pedagogical core:** vary masses, initial velocities, elasticity slider (1.0 → 0); live readouts of p and KE totals; 1D track and 2D field modes.
- **GIST mapping:** J5 (prismatic 1D lab), S0.3 (2D off-center) · Graph G8 (Σp flat, KE step).
- **Example prompt:** *"Two carts on a frictionless track. The left one is 2 kg moving right at 3 m/s, the right one is 1 kg at rest. Let me set the collision from perfectly bouncy to perfectly sticky, and show me total momentum and kinetic energy before and after."*
- **Pass:** Σp conserved to tolerance across e ∈ {1, 0.5, 0}; KE conserved only at e = 1; closed-form post-collision velocities overlay.
- **Exceed:** off-center 2D collisions with *rotation* (S0.3) — Collision Lab's balls never spin; angular impulse is invisible there.

### B3 · PhET Energy Skate Park ⭐
- **URL:** https://phet.colorado.edu/en/simulations/energy-skate-park ✔ (simpler variant: https://phet.colorado.edu/en/simulations/energy-skate-park-basics)
- **Concepts:** KE ⇄ PE exchange, friction as thermal leak, track shape as energy landscape.
- **Pedagogical core:** draggable/editable track; live KE/PE/thermal/total bar chart; friction toggle; "will it make it?" prediction.
- **GIST mapping:** S1.0 two-hill coaster (⇄ J7 path constraint) · Graph G6.
- **Example prompt:** *"Build a skate ramp with two hills, the first 3 meters tall and the second 2.5 meters. Start a skater from rest at the top of the first hill. Show kinetic, potential, and total energy as bars while it moves. Add a friction switch."*
- **Pass:** frictionless E_total flat within documented drift budget; clears hill 2 iff h₂ < h₁; with friction, E deficit = friction work.
- **Exceed:** the E_total drift trace itself (G6 dual duty) — PhET hides numerical error; GIST teaches it. Plus contact-vs-path-constraint comparison as a "how simulations work" lesson.

### B4 · Physics Classroom Roller Coaster Model
- **URL:** https://www.physicsclassroom.com/interactive/work-and-energy/roller-coaster-model ✔
- **Concepts:** energy conservation on designable tracks with loops; velocity/force vectors; circular-motion coupling.
- **Pedagogical core:** three pre-built tracks + design-your-own; real-time energy bar charts; force and velocity vector display on the car.
- **GIST mapping:** S1.0 + S1.2 loop · Graphs G6, G10 (N(θ)).
- **Example prompt:** *"Make a roller coaster: a big starting hill into a vertical loop 2 meters in radius. Let me change the starting height and show me the normal force on the cart as it goes around the loop."*
- **Pass:** cart falls off the loop below h = 2.5R (sliding case); N(θ) trace hits zero at top exactly at threshold; contact-only build (per S1.2 ruling).
- **Exceed:** emergent departure — the cart genuinely leaves the track and becomes a projectile; most coaster sims rail the car.

### B5 · PhET Forces and Motion: Basics
- **URL:** https://phet.colorado.edu/en/simulations/forces-and-motion-basics ✔
- **Concepts:** net force, Newton's 1st/2nd laws, friction onset; the ages-10–13 front door.
- **Pedagogical core:** push crates/fridge with applied force; force arrows + sum-of-forces display; friction on/off; speedometer.
- **GIST mapping:** J5 / S0.1 · Graphs G1, G3.
- **Example prompt:** *"A 50 kg crate on the ground. Let me push it with a force I choose, show the applied force, friction force, and net force as arrows, and a speedometer. Include a switch to turn friction off."*
- **Pass:** with friction off, constant F → constant a = F/m (G3 slope = m); with friction, static plateau then kinetic sliding; force arrows sum correctly.
- **Exceed:** the crate is a real body — stack a second crate on top (S3.1 territory) and the same scene becomes an F = ma-with-added-mass lab. PhET would need a whole new sim.

### B6 · Physics Classroom Inclined Plane
- **URL:** https://www.physicsclassroom.com/interactive/forces-in-2d/inclined-plane ✔
- **Concepts:** force resolution on a slope, µ regimes, breakaway angle.
- **GIST mapping:** S0.1 · Graphs G1, G7.
- **Example prompt:** *"A block on a ramp whose angle I can tilt slowly from 0 to 45 degrees. Friction coefficient 0.4. Tell me the angle where it starts to slide and show velocity vs time after it does."*
- **Pass:** breakaway at tanθ = µ_s within tolerance; post-breakaway v(t) slope = g(sinθ − µ_k cosθ).
- **Exceed:** swap the block for hoop/disk/sphere and the same ramp becomes the rolling race (S0.2) — one scene, two curriculum units.

### B7 · PhET Pendulum Lab
- **URL:** https://phet.colorado.edu/en/simulations/pendulum-lab ✔
- **Concepts:** period vs L (yes), vs m (no), vs amplitude (small-angle no); measuring g. Signature activity: "find g on Planet X."
- **GIST mapping:** J1 · Graphs G9, G11 (T² vs L sweep).
- **Example prompt:** *"A pendulum whose length and bob mass I can change. Give me a stopwatch and a period timer. Then run it at five lengths between 0.5 and 2 meters and plot T-squared against length."*
- **Pass:** T matches 2π√(L/g) small-angle; m-independence; G11 sweep slope recovers g within tolerance; large-amplitude period growth visible.
- **Exceed:** rod-vs-string over-the-top comparison (J1) and physical-pendulum extension (J2) — PhET's pendulum is point-bob-on-rigid-rod only.

### B8 · PhET Masses and Springs (+ Hooke's Law)
- **URLs:** https://phet.colorado.edu/en/simulations/masses-and-springs ✔ · https://phet.colorado.edu/en/simulations/hookes-law ✔
- **Concepts:** Hooke's law, spring SHM, elastic PE, damping; energy bar charts.
- **GIST mapping:** J3 · Graphs G4 (slope k, area ½kx²), G9, G11 (T² vs m).
- **Example prompt:** *"Hang a mass from a spring with stiffness 20 N/m. Let me change the mass and the damping. Show force vs stretch as a graph and the energy bars while it bounces."*
- **Pass:** equilibrium stretch mg/k; T = 2π√(m/k); G4 slope = k regardless of engine parametrization (the adapter conversion test).
- **Exceed:** spring + cart + collision in one scene (spring-buffered collision, impulse softening) — cross-unit composition PhET can't do.

### B9 · PhET Balancing Act
- **URL:** https://phet.colorado.edu/en/simulations/balancing-act ✔
- **Concepts:** torque balance, m·d rule; Balance Challenge game mode.
- **GIST mapping:** J4 (⇄ S3.2 notched fidelity version) · Graph G5.
- **Example prompt:** *"A seesaw on a pivot. Let me place bricks of different masses at different distances on each side and predict whether it tips left, right, or balances before releasing it."*
- **Pass:** balances iff Σm·d equal; unbalanced α = Στ/I overlay.
- **Exceed:** S3.2 notched fulcrum — riders can slide, beam can walk off the fulcrum; the idealization gap becomes the lesson.

### B10 · Physics Classroom Monkey and Zookeeper
- **URL:** start at https://www.physicsclassroom.com/interactive ✔ → Vectors and Projectiles → "Monkey and Zookeeper" (exact path unverified)
- **Concepts:** simultaneous free fall; aim-at-the-target invariance.
- **GIST mapping:** S0.5 · Graph G2.
- **Example prompt:** *"A dart gun aimed directly at a monkey hanging from a branch. The monkey lets go exactly when the dart fires. Let me change the dart speed and see whether it hits."*
- **Pass:** hit at any v₀ (until floor); twin y(t) sag traces overlay identically.
- **Exceed:** make the dart slow enough that the floor intervenes — the *failure* case is analytically predictable too (t_floor vs t_hit race).

### B11 · Physics Classroom Stopping Distance
- **URL:** start at https://www.physicsclassroom.com/interactive ✔ → Newton's Laws unit → "Stopping Distance" (exact path unverified)
- **Concepts:** friction work, d ∝ v².
- **GIST mapping:** S0.1 variant · Graph G7.
- **Example prompt:** *"A car sliding to a stop on pavement with µ = 0.7. Run it at 20, 40, 60, and 80 km/h and plot stopping distance against speed squared."*
- **Pass:** G7 line through origin, slope 1/(2µg); doubling v quadruples d beat lands.

### B12 · Physics Classroom Rotation & Balance suite (Center of Mass, Balance Beam, Torque and Rotation)
- **URL:** https://www.physicsclassroom.com/interactive/rotation-and-balance ✔ (suite index)
- **Concepts:** CoM of arbitrary shapes (drag-out-a-shape, hang from pin), torque, angular acceleration.
- **GIST mapping:** S0.4, J2, J4 · Graphs G5, G11 variant.
- **Example prompt:** *"Let me draw an L-shaped plate, then hang it from a pin at a corner. Show where its center of mass is and let it swing."*
- **Pass:** hang direction puts CoM below pivot; T matches physical-pendulum formula for the compound shape (the S↔J cross-file archetype exercised end-to-end).
- **Exceed:** this benchmark *is* GIST's thesis — arbitrary learner-described shape → correct emergent physics. It should become the demo-day piece.

### B13 · Physics Classroom Barrel Ride / Roller Coaster Design (circular motion)
- **URLs:** https://www.physicsclassroom.com/interactive/circular-and-satellite-motion/roller-coaster-design ✔ · Barrel Ride: start at interactive index (unverified path)
- **Concepts:** centripetal requirement, N vs T faces of mv²/r, thrill/safety framing.
- **GIST mapping:** S1.2 + J6 taught as a pair · Graph G10.
- **Example prompt:** *"Swing a ball on a string in a vertical circle. Show the string tension as the ball goes around, and find the slowest speed where the string stays tight at the top."*
- **Pass:** slack onset at v_top = √(gr); T(v²) slope = m/r; mirror-symmetry with B4's N = 0 documented in the sim notes.

---

## Tier B — General-engine environments (breadth benchmarks, not clones)

These are GIST's true competitors: one engine, arbitrary scenes. Benchmark differently — not "recreate sim X" but "match authoring breadth and beat authoring *speed*."

### B14 · Algodoo (Algoryx)
- **URLs:** https://www.algodoo.com ✔ · lesson library how-to: https://www.algodoo.com/learn-it/ ✔
- **Why it matters:** free 2D sandbox, 60+ teacher lessons, 150k+ shared scenes, 700+ papers; Nordic origin (culturally adjacent to the DK pilot). The best-documented "sandbox engine meets curriculum" case in the PER literature (Gregorcic & Bodin 2017, *The Physics Teacher*).
- **Benchmark use:** pull 5 mechanics lessons from its library and attempt each as a GIST prompt. Algodoo's authoring is direct manipulation (draw + click); GIST's is language. The comparison metric is time-to-scene and *revisability by language* ("now make the ramp steeper and the ball heavier").

### B15 · Interactive Physics / Working Model 2D (Design Simulation Technologies)
- **URLs:** https://www.design-simulation.com/ip/ ✔ · https://www.physicscurriculum.com/interactivephysics ✔
- **Why it matters:** 40-year precedent; ropes/rods/pulleys/gears/springs/joints + curriculum workbook of 150+ standards-correlated experiments — effectively a stress-test list for PHYSICS_JOINTS_CONSTRAINTS.md. **Watch item:** DST now advertises describing a mechanism in plain English and watching the simulation build itself — direct LLM-in-the-loop prior art. Track their press releases; evaluate their feature when accessible (Windows-only, licensed — a structural opening GIST's browser-native stack walks through).
- **Benchmark use:** their tutorial topic list (collision/elasticity/friction/impulse; curved slot coaster; force/Newton's-first-law) as a coverage checklist; Atwood + gears as stretch items.

### B16 · myPhysicsLab
- **URL:** https://www.myphysicslab.com (long-stable; unverified this session)
- **Why it matters:** open-source, equations-shown-with-the-sim philosophy (pendulums, springs, colliding blocks, roller coaster) — the closest existing thing to GIST's analytical-leg-on-screen ethos, but with fixed scenes and no authoring.
- **Benchmark use:** fidelity reference — its documented ODE solutions are independent ground truth for J1/J3/J9 harness checks.

### B17 · oPhysics + CK-12 Physics Sims (secondary catalogs)
- **URLs:** https://www.ophysics.com (long-stable; unverified this session) · https://interactives.ck12.org/simulations/physics.html ✔
- **Benchmark use:** breadth backstops — when a teacher asks "can GIST do X," these catalogs are the quickest census of what X's the field already expects.

---

## Protocol

1. **Order:** run Tier A benchmarks as their underlying archetypes land (B5/B6 with Rung 0; B3/B4 with Rung 1; B2 with J5; B7–B9 with J1/J3/J4). B12 last — it is the thesis demo.
2. **Prompts are frozen test fixtures.** The example prompts above go in the repo verbatim; runs are scored A–E against them. Prompt drift = eval drift.
3. **Two-run rule:** score authorability on the *first* LLM output and after ≤ 2 tweak rounds; both numbers matter (cold accuracy vs converged accuracy).
4. **Exceed claims must be demonstrated, not asserted** — each "Exceed" line becomes a follow-on prompt in the same session ("now put a cup where the ball lands").
5. **Log time-to-sim on every benchmark run.** Plot it over development time. That curve is the FCL progress report.
