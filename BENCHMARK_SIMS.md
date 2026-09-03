# BENCHMARK_SIMS.md (v2)

**Purpose.** External reference simulations that serve as GIST's internal acceptance test cases. The core question for each: *starting from a natural-language teacher prompt plus minor tweaking, can GIST reproduce the pedagogical core of this sim — and where can it exceed it?* Sibling of `PHYSICS_SHAPES.md` (S-IDs), `PHYSICS_JOINTS_CONSTRAINTS.md` (J-IDs), `PHYSICS_GRAPHS.md` (G-IDs). Feeds `CLAUDE.md`.

**v2 changes (2026-08-07):** added the **Stance** below (how we talk about the platforms we benchmark against); added the **Coverage matrix** for foundational mechanics with a fill-the-cell dev checklist per empty cell; added **B18** (1D kinematics) and **B19** (1D free fall), whose prompts were PROPOSED at the time and were ratified + frozen on 2026-08-09 (see the amendment below).

**Amendment 2026-08-09 (Bill) — B18 and B19 reworded, then RATIFIED and FROZEN the same day.** Recorded here so the edit is visible rather than silent, and so the freeze has a date. The rewordings were sanctioned only because the prompts were still PROPOSED at the time: **B19** drop height 20 m → 3 m; **B18** gained the framing clause *"from the top down with no gravity, so the carts just glide"* — a deliberate piece of user-facing prompt education for the low-cost/localized-model tier (see the note under B18). **Bill ratified both on 2026-08-09 ("prompts are good to go"), so both are now FROZEN test fixtures under Protocol #2** — from here they are edited by adding a new B-ID and marking the old one superseded, never by rewording. ~~No PROPOSED prompts remain outstanding.~~ **B20 and B21 added as PROPOSED 2026-08-31** (the idealization-by-omission bench — see their entries); they stay editable until ratified.

**Stance — these platforms are collaborators, not targets (Bill, 2026-08-07).** GIST is engine-agnostic; it is ed-tech agnostic in exactly the same way. A good sim is a good sim, and every student should have access to it. PhET, The Physics Classroom, oPhysics, myPhysicsLab and the rest built the pedagogical canon this document is measured against — their work informs ours, and the position we want to grow into is one where ours can inform theirs. Three practical consequences: (1) benchmark language stays respectful and specific — we name what a sim teaches well, never "beat" it; (2) every parity claim carries its honesty note where our model differs (B1's drag note is the template) — an unqualified side-by-side is a claim we haven't earned; (3) **if any of this becomes outward-facing**, it ships with attribution, per-source license compliance, links that send traffic *to* the original sim, and no implication of endorsement. Screenshots of third-party sims are not to be hosted in `public/` or rendered from a `/docs` page until that licensing pass is done and recorded here — `/docs` is served ungated in production.

**ID discipline.** B-IDs are append-only. Never renumber and never reword a frozen prompt — both are eval drift (Protocol #2). New IDs are added at the end of their tier, so numbering is not contiguous within a tier; that is intentional.

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

### B18 · 1D kinematics — constant velocity vs constant acceleration ⭐
- **Status:** prompt **FROZEN 2026-08-09** (added 2026-08-07 as PROPOSED; reworded and ratified by Bill on 2026-08-09). Protocol #2 applies in full — do not reword; supersede with a new B-ID instead.
- **URL:** candidate references, exact paths unverified — The Physics Classroom Kinematics interactives ("Graph That Motion", "Name That Motion") from the verified index https://www.physicsclassroom.com/interactive ✔ ; PhET "The Moving Man" (verify HTML5 availability — it may be legacy-only).
- **Concepts:** the ages-10–13 front door to motion. Constant v vs constant a, read off position and velocity graphs; slope as a rate.
- **Pedagogical core:** two bodies released together, one at constant velocity and one accelerating; twin x(t) traces (straight line vs curve) and twin v(t) traces (flat vs ramp) side by side; learner varies v₀ and a and predicts who wins.
- **GIST mapping:** no S-ID (no shape work) · Graphs **G1** — this is the case G1 calls "the ages-10–13 entry point."
- **Example prompt (FROZEN 2026-08-09):** *"Show this from the top down with no gravity, so the carts just glide. Two carts start together. One rolls at a steady 5 m/s; the other starts from rest and speeds up at 2 m/s². Let me change both numbers with sliders. Graph position against time and velocity against time for both so I can see where they cross."*
- **Note on the framing clause (Bill, 2026-08-09).** *"From the top down with no gravity"* is a **deliberate piece of user-facing prompt education**, not a concession we are hiding. A top-down frame with `gravity: 0` removes the floor, the normal force and any contact friction, leaving motion that is purely 1D — which is what the benchmark is actually about. Ultimately we want the LLM to infer that framing from "1D kinematics" on its own, and that remains the goal. But GIST is being designed to run against **low-cost and localized models (e.g. skoleGPT)**, where spending prompt words to state the frame is cheaper and far more reliable than expecting inference. Teaching a teacher to say "top down, no gravity" is a legitimate product move at this tier. **Consequence for scoring:** this prompt tests authorability *given a well-framed request* — so it does not measure whether the model can infer the frame unaided. If we later want that measured, it is a separate B-ID with the clause removed, never a reword of this one.
- **Pass:** x(t) straight vs parabolic; v(t) flat vs constant-slope = a; crossing time matches 2v₀/a analytically; no drift on the constant-velocity cart over the run.
- **Exceed:** the constant-velocity cart is a real rigid body on a genuinely frictionless surface, not a scripted animation — so the same scene extends into collision (B2) or onto a ramp (B6) by editing one line, and "steady speed" is an *emergent* result of ΣF = 0 rather than an assertion.

### B19 · 1D free fall — the g calibration ⭐
- **Status:** prompt **FROZEN 2026-08-09** (added 2026-08-07 as PROPOSED; reworded and ratified by Bill on 2026-08-09). Protocol #2 applies in full — do not reword; supersede with a new B-ID instead.
- **URL:** candidate references, exact paths unverified — The Physics Classroom free-fall interactives from the verified index https://www.physicsclassroom.com/interactive ✔ ; the vacuum-chamber hammer-and-feather demo (Apollo 15 / BBC) as the cultural touchstone rather than a sim.
- **Concepts:** free fall as constant acceleration; slope of v(t) = −g; mass-independence in vacuum, and what air resistance changes.
- **Pedagogical core:** drop from rest, watch v(t) come out a straight line of slope −g regardless of mass; then turn air resistance on and watch the heavy compact object stay straight while the light draggy one bends to terminal velocity.
- **GIST mapping:** no S-ID · Graphs **G1** — PHYSICS_GRAPHS calls the drop "the single most important calibration graph in the harness."
- **Example prompt (FROZEN 2026-08-09):** *"Drop a bowling ball and a feather from 3 meters at the same moment, first with no air and then with air resistance on. Graph the speed of each one against time and show me which hits first."*
- **Pass:** vacuum case — both v(t) slopes = −9.8 within harness tolerance and impact times identical; air case — bowling ball essentially unchanged, feather flattens to terminal v = √(2mg/ρC_dA) and lands late.
- **Exceed:** the air-off/air-on toggle is the *same scene*, not two sims, and the force arrows (F_gravity, F_drag, F_net) show *why* the feather flattens — F_net shrinking to zero — which the classic demo can only assert. This is the honest twin of B1's drag honesty note: GIST models quadratic drag via per-frame damping (see `Notes_on_Air_Resistance_Refactor.md`), so state the model rather than claiming aerodynamic fidelity.

### B20 · Textbook dynamics — angled pull, frictionless by omission *(PROPOSED)*
- **Status:** prompt **PROPOSED 2026-08-31** (editable until Bill ratifies; frozen the moment the tag comes off — Protocol #2). Filed as the eval bench for the **idealization-by-omission** prompt fix (`GIST_LLM_Context_and_Prompting.md` §4.10); observed failing on that date (wagon generated with µ > 0 — likely the grounded-container 0.7 default — so the 200 N pull is below breakaway and the wagon shouldn't even move).
- **Concepts:** Newton's 2nd law with an angled force; component decomposition; the textbook convention that an unmentioned friction is zero.
- **Pedagogical core:** a stated numeric problem pasted verbatim — the sim must *reproduce the textbook answer*, not a "realistic" wagon. Gravity must stay ON (the 200·sin15° ≈ 52 N vertical component is eaten by the normal force); friction must be explicitly 0 on every body.
- **GIST mapping:** matrix cell 8 adjacent (N2 with an angled force on level ground rather than an incline) · exercises `appliedForce` polar authoring (Goal 2).
- **Example prompt (PROPOSED):** *"Tom pulls a 45 kilogram wagon with a force of 200 Newtons at a 15° angle to the horizontal from rest. How much faster will the wagon be moving after 2 seconds?"*
- **Pass:** wagon moves from rest with a = 200·cos15°/45 ≈ 4.29 m/s²; v after 2 s ≈ **8.59 m/s** within harness tolerance; no friction/drag authored anywhere (explicit `friction: 0`, containers included); wagon stays grounded.
- **Exceed:** FBD closes — `force-applied` (at 15°), `force-gravity`, `force-normal` and `force-net` drawn, with the normal visibly smaller than mg (the pull's upward component); a readout answers the stated question directly (speed at t = 2 s).

### B21 · Textbook 1D kinematics — stipulated acceleration, unaided framing *(PROPOSED)*
- **Status:** prompt **PROPOSED 2026-08-31** (editable until ratified; then frozen — Protocol #2). Filed alongside B20 as the §4.10 eval bench — and this one is the **unaided-inference twin B18's framing-clause note reserved**: B18 teaches the user to say "top down, no gravity"; B21 hands the model a bare textbook problem and asks it to infer that frame itself. Observed failing 2026-08-31 (cart sim with gravity on; wrongness likely container-default friction and/or an unbounded fall).
- **Concepts:** 1D kinematics with constant acceleration; v² = v₀² + 2aΔx; the kinematics chapter's forceless `acceleration` stipulation (CLAUDE.md invariant #9).
- **Pedagogical core:** the model must recognize the textbook-problem register and idealize: gravity 0 (level path, stipulated a — no weight/normal at work), no friction, no air; `acceleration.x: 3.2` as the kinematic stipulation, NOT an `appliedForce` (the cause is unmodelled by design).
- **GIST mapping:** matrix cell 1 (B18's cell) · Graphs **G1**.
- **Example prompt (PROPOSED):** *"You are driving at 12 m/s when you hit the gas to pass another car. What is your final velocity if you accelerated at 3.2 m/s² for 60 meters?"*
- **Pass:** car starts at 12 m/s and accelerates at 3.2 m/s²; velocity when 60 m have elapsed ≈ **23.0 m/s** (√(144 + 2·3.2·60) = √528) within harness tolerance; no friction, no drag, no gravity-driven motion; car stays on its line for the whole run.
- **Exceed:** a position or velocity readout (or graph crossing) lets the student read off v at Δx = 60 m directly; the scene reads as B18's glide frame *without* the prompt having asked for it.

---

## Tier B — General-engine environments (breadth benchmarks, not clones)

These occupy GIST's own architectural niche: one engine, arbitrary scenes. They benchmark differently — not "recreate sim X" but "match authoring breadth, and let language do the revising." Where Tier A sets the pedagogical bar, Tier B sets the authoring bar.

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

## Coverage matrix — foundational mechanics (opened 2026-08-07)

Scope: the eight foundational cells behind 1D/2D kinematics, free fall, 1D momentum, and Newton's 1st/2nd laws. This is **not** a coverage matrix for all 19 B-IDs — it is the entry-level band, the part of the curriculum a teacher reaches for first, and the part where our canon turned out to be thinnest.

**A cell is FILLED when** a GIST sim exists for it *and* has been scored A–E against its benchmark with time-to-sim logged (Protocol #5). Merely having a sim that runs is 🟡 THIN, not ✅.

| # | Topic | Benchmark | GIST sim today | Cell | Why it's not filled |
|---|---|---|---|---|---|
| 1 | 1D kinematics (const v vs const a) | **B18** *(frozen 08-09)* | none | ⬜ EMPTY | authoring only — no capability gap; prompt now frozen, so the scene is the whole task |
| 2 | Free fall 1D (slope = −g) | **B19** *(frozen 08-09)* | `freefallWithDrag` (drag framing); `bowlingBallAndFeather` **routed 08-07** | 🟡 THIN | authoring only — owes the air-off case, the plain-drop calibration variant, and scoring |
| 3 | 2D kinematics / projectile | **B1** | `projectileVelocityComponents`, `projectileLaunchPolar` | 🟡 THIN | **capability:** no trajectory persistence, no range/landing readout |
| 4 | Free fall 2D (simultaneous release) | **B10** · S0.5 | **`monkey-and-apple`** (local fixture) **+ sim 1411** (published exploration) — a deliberate pair | 🟡 THIN | fixture built 2026-08-07, drive + A–E scoring owed |
| 5 | 1D momentum / collisions | **B2** | `cup-catch`, `box-catch`, `twoBoxes` | 🟡 THIN | **capability:** no system-total (Σp, ΣKE) outputs |
| 6 | Newton's 1st law | **B5** (shared) · S2.3 | `wagon-stop` | ✅ FILLED* | *scored-against-rubric pass still owed |
| 7 | Newton's 2nd law, 1D | **B5** | `applied-force-1d` · `applied-force-2d` | 🟡 AUTHORABLE 2026-08-13 | *was* 🔴 (no impulse API) → 🟡 unblocked 2026-08-09. Phase 2 landed the `appliedForce` field + force property paths, so B5 is authorable; owes the B5 scene, the drive, and scoring |
| 8 | Newton's 2nd law, 2D (incline) | **B6** | `ramp-slide` | ✅ FILLED* | *µs ≠ µk absent; friction representation held |

**The headline:** the two cells with no ID in any curriculum doc (1, 2) are the *simplest* physics in the set, and the one that was hard-blocked (7) sits under the most famous reference sim in the field, PhET's *Forces and Motion: Basics*. We built the flagship archetypes before the front door. **Update 2026-08-09:** cell 7's blocker is gone — GIST can push things now — but the headline stands as a lesson about ordering, not as a live status.

**Note on cell 4 (2026-08-07):** it was filled *by the generator*, not by hand — a teacher prompt plus two remixes produced a working B10 scene in 21 minutes. That is the product working as intended, and it is the first evidence bearing on the open "hand-authored vs generated" question for any future comparison artifact. The useful lesson turned out not to be "the generator shipped the wrong slider": it shipped an affordance the benchmark didn't ask for, which Bill then made the basis of a **second pedagogical rung** (see cell 4). Generated sims will keep arriving with extra degrees of freedom; the judgment call is whether an off-benchmark control is noise or a teaching move, and that call belongs to a human reading the scene, not to the rubric.

### Fill-the-cell checklists

Each list is ordered so the first unchecked box is the next action. Tags: **[gist-staged]** = local JSON only, three-places deliberately untouched (per invariant #2); **[three places]** = schema + prompt + docs must move together; **[capability]** = new runtime behavior, needs a design decision before code.

#### Cell 1 — 1D kinematics (B18) ⬜ **[gist-staged]** · est. small
Nothing is missing from the engine or the schema; this is a scene we simply never authored. `ObjectConfig.acceleration` is an additive constant acceleration (invariant #9) and is slider-bindable via `acceleration.x`, and object friction defaults to 0, so a frictionless glide needs no special handling.

**Framing (2026-08-09): author this TOP-DOWN with `environment.gravity: 0`**, matching the prompt's clause. No floor, no normal force, no contact friction — motion is purely 1D by construction rather than by cancellation, which removes the whole class of "is it actually frictionless?" doubt. It also means the y-axis carries no physics, so the two carts can be offset vertically purely for legibility without implying a second dimension of motion.

- [x] Ratify the B18 prompt above — **done 2026-08-09** (reworded to add the top-down/no-gravity clause, then ratified by Bill). **FROZEN**; from here it changes only by superseding B-ID.
- [ ] Author `src/simulations/kinematics1D.json`: `environment.gravity: 0`, no bottom wall, two carts released together at x = 0 (offset in y for readability only) — cart A `velocity {x: 5, y: 0}`, cart B from rest with `acceleration {x: 2, y: 0}`; both `friction: 0`, `restitution: 0`.
- [ ] Controls: sliders on A's `velocity.x` and B's `acceleration.x`.
- [ ] Graphs (G1): overlay `position.x` for both (straight vs curve) and `velocity.x` for both (flat vs ramp). **Set `yAxisRange` to fit the data or leave it unset** — see the `twoBoxes` bug in cell 5.
- [ ] `showVectors: ["velocity"]` on A; `["velocity", "acceleration"]` on B.
- [ ] Wrapper + route per `Local_Sim_Workflow.md` (`/simulation/kinematics-1d`).
- [ ] Harness-verify: crossing time = 2v₀/a; A's velocity constant to tolerance over the full run. **Note the top-down framing changes what this check proves:** with no gravity and no floor there is no contact at all, so a constant v₀ now tests solver drift on a free body rather than whether "frictionless" is genuinely frictionless. That contact-friction question is real but belongs to a grounded scene (cell 6/8), not here.
- [ ] Confirm air resistance is OFF (omit `environment.airResistance`) — with no gravity, drag would be the only force in the scene and would visibly bend cart A's supposedly-constant velocity.
- [ ] Bill's drive, then score A–E and log time-to-sim.

#### Cell 2 — Free fall 1D (B19) 🟡 **[gist-staged]** · est. small
`bowlingBallAndFeather.json` already exists and is exactly this benchmark — bowling ball with `Cd = 0` against a feather with `Cd = 1.5` — but it has **no wrapper and no route** (zero references anywhere in `src/`), so it is unreachable in the app. It also predates the vector work and still uses the legacy `showForceArrows: true` flag.

- [x] Ratify the B19 prompt above — **done 2026-08-09** (reworded to drop height 20 m → **3 m**, a classroom-realistic height rather than a stairwell one, then ratified by Bill). **FROZEN**; from here it changes only by superseding B-ID.
- [ ] **Divergence to settle: the prompt now says 3 m; the exhibit is authored at 2 m.** Deliberately left alone rather than silently re-tuned — bumping the drop re-dates every verified number below (terminal-velocity onset, both land times, the authored graph ranges). Either raise `bowlingBallAndFeather` to 3 m and re-verify, or accept that the hand-authored fixture and the benchmark prompt need not match exactly (they are different artifacts: the fixture is a dev-team exhibit, the prompt is an LLM eval input). Bill's call. Physics note either way: at 2 m the feather is already at terminal velocity for roughly the last three quarters of the fall, so 3 m strengthens the demo rather than changing its character.
- [x] Give `bowlingBallAndFeather.json` a wrapper + route (`/simulation/bowling-ball-and-feather`) — **done 2026-08-07, drive pending.** `BowlingBallAndFeatherSimulation.tsx` + import + route; tsc/lint at baseline. Notes from routing: `referenceArea` is unauthored and defaults to widest horizontal extent, giving the feather A = 1 m² and terminal v ≈ 3.3 m/s against the ball's ≈ 33 m/s — both inside the authored −35…5 graph range. Colliders (re-checked against Bill's 2026-08-07 renderables update): `bowling_ball` is now a **circle** (center [32,32], r 30.52 in its 64×64 viewBox) — upgraded from a 12-vertex polygon, exactly the round-shape fix the CC2 census called for; `feather` is an 8-vertex polygon, under the Planck cap. Neither is a cap risk, and this sim is authored `physicsEngine: "rapier"` anyway.
- [x] Migrate its `showForceArrows: true` → `showVectors: ["force-gravity", "force-drag", "force-net"]` — **done 2026-08-08, drive-confirmed.** Also gained explicit `referenceArea: 0.1` (the feather's 90° rotation presents its long axis, but the drag default is NOT rotation-aware): terminal v 2.58 → 1.63 m/s, so it now lands 1.31 s vs the ball's 0.63 s — better separation. NOTE the feather's forces are ~0.098 N → all arrows sub-floor at the shared 2 px/N; legibility comes from the **force loupe** (`?loupe=1`, paused-only, shipped 2026-08-08), not from a per-arrow scale override.
- [ ] Add the air-off case: either a second scene or — better — verify the debug air-resistance toggle switches this sim cleanly, since "same scene, air off vs on" is B19's pedagogical core. Confirm the toggle is in the replay frame-cache key (invariant #13; this was the 2026-08-06 stale-replay bug).
- [ ] Author the plain-drop calibration variant `freefall1D.json` (single ball, no drag, v(t) slope = −g). PHYSICS_GRAPHS calls this the single most important calibration graph in the harness and we don't have it.
- [ ] Harness-verify: vacuum slopes = −9.8 both bodies, identical impact times; feather's terminal v matches √(2mg/ρC_dA).
- [ ] Drive, score, log.

#### Cell 3 — 2D kinematics / projectile (B1) 🟡 **[capability]** · est. medium
`projectileVelocityComponents` covers the vector story well. What's missing is B1's stated core: *"trajectory trace persists across shots for comparison"* and the target-hitting beat. **There is no trail, path, or trace rendering anywhere in the codebase** — confirmed by search; the only "ghost" in `src/` is `EditOverlay`'s resize preview.

- [ ] **Decide the trajectory-persistence design.** Related parked idea: `GIST_Physics_Wishlist.md` §8 "Ghost replay (A/B compare)" — translucent trail of a saved run beside the live body, explicitly modeled on PhET's projectile comparison. Decide whether one mechanism serves both this and ghost replay, or whether within-session shot traces are a simpler separate thing. **This is a design decision, not a coding task — do it first.**
- [ ] Decide where a trace lives: a render-only overlay reading recorded Frames (replay already stores every frame — invariant #12), or persisted state. Frames-as-source is the cheaper and more honest route.
- [ ] Add a landing/range readout. Outputs are per-object property paths today, so "range" is not directly expressible — either add a derived output or accept `position.x` sampled at impact.
- [ ] Author the target crate (trivially authorable — a static or dynamic box at 40 m).
- [ ] **[three places]** if trajectory display becomes LLM-authorable: schema field + regenerate, prompt, docs. Consider landing it debug-first (like `?forces=1`) and holding the prompt, matching the FBD posture.
- [ ] Verify the B1 pass criteria: complementary angles 30°/60° land together; analytical range overlay matches impact.
- [ ] Drive, score, log.

#### Cell 4 — Free fall 2D / simultaneous release (B10, S0.5) 🟡 **[gist-staged]** · est. small
**Filled from the generator, not by hand — the first matrix cell to arrive this way** (2026-08-07). Sim **1411 "Monkey and the Apple"**, published by Bill; it is the DB sim at `/simulation/1411`, not a local JSON.

**Lineage — the first logged time-to-sim in the repo (Protocol #5).** Six versions, 1406 → 1411, **21 min 40 s** from cold prompt to published:

| id | time | leg | prompt |
|---|---|---|---|
| 1406 | 19:06:06 | LLM (cold) | *"create a monkey and the hunter simulation."* |
| 1407 | 19:08:10 | LLM (tweak 1) | *"add a floor and the ability to change initial angle of bullet"* |
| 1408 | 19:15:21 | human edit | — |
| 1409 | 19:16:18 | LLM (tweak 2) | *"add a slider for vertical position of the hunter and apple and have the default be at the same height as the monkey."* |
| 1410 | 19:25:48 | human edit | — |
| 1411 | 19:26:06 | human edit | published 19:27:46 |

Three LLM rounds (one cold + **two** remixes) — inside the two-run rule's ≤2-tweak budget — plus three hand edits.

**Physics verified against the config (headless):** apple and monkey sit at *identical* y (31.191), and the apple is fired at 25 m/s at angle 0 — so "horizontal" *is* the line of sight, and the aim is correct. Both fall at g with air resistance off. They meet at **t = 2.20 s, 7.53 m up, with the monkey's feet 2.53 m above the floor** and **0.114 s of margin** before the monkey would have landed. The beat lands, but the margin is thin — this is a photo finish with the ground, and any reduction in launch speed loses it.

- [x] Scene exists and the pedagogical beat works (verified above).
- [x] Graph: "Height vs Time" overlays `position.y` for monkey and apple — **exactly B10's pass criterion** ("twin y(t) sag traces overlay identically"). Strongest part of the sim; the traces are analytically identical.
**DECIDED 2026-08-07 (Bill): keep BOTH sims — they are a two-rung ladder, not a fixture and a mistake.** My first read called 1411's launch-angle slider "the wrong control for B10." That was wrong: it is the right control for the *second* rung. The pair now reads:

- **Rung 1 — `monkey-and-apple`** (local, git-tracked, `/simulation/monkey-and-apple`). Launcher and branch at the SAME height, so the aim is horizontal and the two height traces overlay exactly — B10's pass criterion made literal. **One control**, launch speed. Deliberately simple: vary v₀, watch the hit persist, then slide below the threshold and watch the floor win.
- **Rung 2 — sim 1411** (published, DB, with its angle + vertical-position sliders). Start at the same-height default so the horizontal case is familiar, then **lower the zookeeper to the ground**. The line of sight is now *angled*, so a purely horizontal throw misses, and the student has to give the apple both a vertical and a horizontal component to re-aim. That is the full canonical monkey-and-zookeeper — and the student **discovers** that "aim at the monkey" generalizes beyond horizontal rather than being told it.

The angle slider is therefore load-bearing on rung 2 and correctly absent from rung 1. Keep them distinct; do not converge them.

- [x] Local fixture authored + routed (2026-08-07) — `src/simulations/monkeyAndApple.json`. Verified headless: no dynamic-vs-static overlap at t=0 (the monkey hangs clear of the cypress collider); hit/miss threshold **15.92 m/s** sits mid-slider (5–40, default 25); v=15 misses, v=16 hits with 0.36 m of floor clearance; both graph ranges sized against the slider extremes, not the default.
- [x] Failure case built in — B10's Exceed (t_hit = Δx/v vs t_land = √(2h/g)) is reachable by dragging one slider, not a separate scene.
- [ ] **Drive rung 1** (`/simulation/monkey-and-apple`) — confirm the twin height traces genuinely overlay, and that the monkey reads as hanging from the branch (it clears by 0.5 m by design; close the gap with a taller monkey or lower branch, never by overlapping).
- [ ] Score **rung 1** A–E against B10 and log time-to-sim (hand-authored, so the number is not comparable to 1411's 21 min — log both, labelled).
- [ ] Sim 1411 housekeeping: its second graph "Apple Speed and Launch Angle" **clips** (range min −10, angle trace runs to −40.7°, ~80% off-scale) and mixes m/s with degrees on one axis. Worth a remix pass since 1411 is now a keeper, not a throwaway.
- [ ] Sim 1411's default meeting is 0.114 s from the floor — fine for rung 2's exploration, but note it in any teacher-facing framing so a slightly slow apple doesn't read as a broken sim.
- [ ] Mark **S0.5 implemented** in `PHYSICS_SHAPES.md` once rung 1 is drive-confirmed (lifecycle discipline).

**Cross-cutting finding — the LLM authors `yAxisRange` too tight.** Third confirmed instance (`twoBoxes.json` ±1 for ±5 m/s data; `bowlingBallAndFeather.json` −5 for a −6.15 m/s impact; sim 1411's angle trace). Three independent sims, same failure. This is a **prompt-level** issue, not three authoring slips: the graph guidance should either teach range selection from expected data magnitude or prefer omitting `yAxisRange` so the axis auto-fits. Worth its own three-places pass.

#### Cell 5 — 1D momentum (B2) 🟡 **[capability]** · est. medium
`cup-catch` is a clean perfectly-inelastic capture and `box-catch` adds the momentum-then-energy story, so the physics is real. Two things block B2 parity. The elasticity slider is **cheaper than expected** — `restitution` has live getters and setters in both adapters, sits in the schema's slider property allowlist, and `applyControlToBody` dispatches it generically, so it should be authorable today. The system readouts are the genuine gap: outputs and graphs both take a **per-object property path**, so Σp and ΣKE across bodies are not expressible at all.

- [ ] Author an elasticity slider bound to `restitution` on a two-cart scene. **Verify it isn't a silent no-op** — the friction slider looked authorable and did nothing until an accessor was added (ramps gate round 1, 2026-08-06), and Box2D stamps contact properties at begin-contact, so Planck may need the same live-contact refresh friction needed. Assume nothing; drive it.
- [ ] Fix `twoBoxes.json`: its two graphs carry `yAxisRange {min: -1, max: 1}` while the data runs ±5 m/s, so both are clipped. Also settle whether it's meant to be 1D — the boxes sit at different heights (y = 50 vs 40).
- [ ] **[capability, three places]** Decide how system-level quantities are expressed. Σp and ΣKE are B2's core, and they generalize immediately to B3's energy bars (KE/PE/thermal/total) and B8's — so this is a *shared* capability, not a one-benchmark patch. Options to weigh: an aggregate output kind over a named object set; a derived-quantity expression language (powerful, large); or per-object outputs plus a "total" graph series. **Decide before building.**
- [ ] Consider J5 (prismatic rail) for a true 1D constraint — joints-gated, and B2's pass criteria don't strictly need it since a frictionless flat floor is 1D enough.
- [ ] Verify B2 pass: Σp conserved across e ∈ {1, 0.5, 0}; KE conserved only at e = 1.
- [ ] Drive, score, log.

#### Cell 6 — Newton's 1st law (B5 shared, S2.3) ✅ **[scoring owed]** · est. tiny
`wagon-stop` was purpose-built for this and ships: `walls: 'left'` open-front wagon, payload rides then keeps its velocity when the wagon is stopped, twin vx traces diverge. Nothing to build.

- [ ] Score it A–E against B5's Newton's-1st half and log time-to-sim. That is the whole remaining task.
- [ ] Note in the sim's docs that B5's *other* half (2nd law, applied force) is cell 7 and blocked — the two halves of one PhET sim land in different quarters for us.

#### Cell 7 — Newton's 2nd law, 1D (B5) 🟡 **AUTHORABLE 2026-08-13** · est. small — capability complete; the B5 scene, the drive and the scoring remain
~~There is no `applyForce`, `applyImpulse`, `applyLinearImpulse`, or `addForce` anywhere in `src/physics/` or `src/components/` — confirmed by search. You cannot push anything in GIST.~~ **You can now push things in GIST.** Applied-forces **Phase 1 shipped 2026-08-09**: `applyImpulse` on `PhysicsBody` + both adapters, per-engine-step delivery via `BaseSimulation.onPreStep`, a debug-panel force dropdown, and `force-applied` wired. It is **debug-panel only by design** — no schema field, no prompt — so B5 is not yet authorable; that is Phase 2. `Notes_on_Applied_Forces_Refactor.md` **owns the plan — this checklist only tracks the benchmark dependency.** Do not restate its phases here.

- [x] Adapter seam: `applyImpulse` on `PhysicsBody`, implemented in both engines, engine-specific logic confined to the adapters (invariant #4) — **done 2026-08-09**. Deliberately no `applyForce` (cleared per substep). **Delivery is per ENGINE STEP via the new `onPreStep` hook, not per logical frame**: `J = F · dt_of_the_next_step`. Frame-boundary delivery measured breakaway at 6 N against a true 19.6 N and crept 36 mm in 5 s below threshold; per-step restores it to ~3%.
- [x] `userData.appliedForce` populated per frame **and riding the Frame** (`appFx`/`appFy`) — **done 2026-08-09**, standing replay rule applied. Written in Newtons at ONE site; the engine path, the Frame, and the arrow all consume that number (invariant #14).
- [x] `force-applied` lights up with no renderer work — **done 2026-08-09**, three lines. Every kind in `vectorTheme.ts` now has a source; added to `?forces=1`.
- [x] **Test fixture landed**: `/simulation/applied-force-1d` (`appliedForce1D.json`), Bill-authored and drive-validated. m = 5 kg, µ = 0.51, g = 9.8 → breakaway 24.99 N, so the debug dropdown's ±25 N step straddles it. Headless: sliding regime `a = (F − µmg)/m` exact to 0.01% on both engines; breakaway Planck +0.04%, Rapier −3.96% (Rapier's static friction is *compliant* — a creep tail, not a threshold error). **Reuse this sim to test the Phase 2 authoring surface.**
- [x] **[three places]** `appliedForce` schema field + regenerate, prompt teaching, docs — **done 2026-08-13 (Phase 2)**. Optional `Vector2DInputSchema` on `ObjectConfig`: newtons, polar-or-components, world-frame, at the centre of mass, constant, singular. Force-family property paths landed with it (`appliedForce.x/.y/.magnitude/.angle` for controls, outputs and graphs), so a force is authorable, controllable, readable and plottable in one pass. Prompt gained the dynamics-chapter rule and — the live drift this caught — **stopped telling the LLM not to author the force-arrow kinds**, which had been wired since 2026-08-09.
- [x] **Second fixture landed**: `/simulation/applied-force-2d` (`appliedForce2D.json`) — the *authoring* fixture, where 1D is the *delivery* fixture. Polar-authored 23 N pull with strength / angle / mass sliders on the same m = 5, µ = 0.51 crate, so the optimal-pull-angle lesson (`F* = µmg/(cosθ + µ sinθ)`, minimum at `arctan µ` = 27.02°) is reachable by dragging one slider: 23 N is stuck at 0° and moves 2.1 m in 5 s at 27°.
- [x] **Mass slider actually works on the default engine** — `body.mass = X` was a NO-OP on Rapier (and could only ever INCREASE mass even once repaired); fixed 2026-08-13, found by driving the 2D fixture. B5's "same force, different mass" half was silently dead before this. Both engines verified up and down.
- [ ] Parked B5-parity UI decisions already recorded in the applied-forces note: ±100 N slider range, self-centering slider, drag-the-cart-by-hand. Pick these up there, not here.
- [ ] Then author the B5 scene (50 kg crate, applied-force slider, friction switch, speedometer) and the S3.1 stacked-crate Exceed follow-on.
- [ ] Drive, score, log.

#### Cell 8 — Newton's 2nd law, 2D / incline (B6) ✅ **[gaps noted]** · est. small
`ramp-slide` ships and is drive-validated: breakaway measured µ = 0.404 against an authored 0.4, about a 1% instrument, with the full five-arrow FBD live. Strongest cell in the matrix and the natural first row of any future comparison artifact.

- [ ] Score A–E against B6 and log time-to-sim.
- [ ] B6 names "µ regimes" in its concepts, and we model a single µ — static vs kinetic (µs ≠ µk) is the parked `frictionDemo` Phase 2.5 item in the applied-forces note. Decide whether B6 passes without it or whether it's a pass blocker. **Recommend: passes, with an honesty note**, since breakaway lands within 1%.
- [ ] Related open design question, deliberately held: how friction is represented to users and the LLM (per-body µ presenting as a pair property, Max combine rule, the remix masking finding) — see `Notes_on_Ramps_and_Tracks_Refactor.md` Open questions. Not a cell-8 blocker; it governs how we'd *explain* the cell.
- [ ] B6's Exceed line (swap the block for hoop/disk/sphere → rolling race, S0.2) is a follow-on prompt, per Protocol #4.

### What this matrix is not

It is not a comparison artifact. The side-by-side screenshot page discussed on 2026-08-07 — GIST beside PhET and others for each canonical setup — remains **wanted but deferred**, gated on: the Stance's licensing pass; a written capture protocol (controlled initial conditions, viewport, and toggles, or the comparison proves nothing); a decision on whether our cell shows a hand-authored sim, a sim generated from the frozen prompt, or a live embed; and a staleness contract, since our renderers change weekly and there is no screenshot tooling in the repo. The natural first row is cell 8, and the natural first *use* is informing the FBD representation decision (analytical-primary vs engine-primary) in `Notes_on_Applied_Forces_Refactor.md`.

---

## Protocol

1. **Order:** run Tier A benchmarks as their underlying archetypes land (B5/B6 with Rung 0; B3/B4 with Rung 1; B2 with J5; B7–B9 with J1/J3/J4). **B18/B19 run first of all** — they need no archetype and no capability we lack, and they are the entry-level band everything else assumes. B12 last — it is the thesis demo.
2. **Prompts are frozen test fixtures.** The example prompts above go in the repo verbatim; runs are scored A–E against them. Prompt drift = eval drift. A prompt marked *PROPOSED* is the one exception — it is editable until ratified, and frozen the moment the marker comes off.
3. **Two-run rule:** score authorability on the *first* LLM output and after ≤ 2 tweak rounds; both numbers matter (cold accuracy vs converged accuracy).
4. **Exceed claims must be demonstrated, not asserted** — each "Exceed" line becomes a follow-on prompt in the same session ("now put a cup where the ball lands").
5. **Log time-to-sim on every benchmark run.** Plot it over development time. That curve is the FCL progress report.
6. **The coverage matrix is a live tracker, not a snapshot.** Move a cell's state when reality moves, and check the box in the same commit as the work (lifecycle discipline). A cell reaching ✅ FILLED means scored, not merely built.
