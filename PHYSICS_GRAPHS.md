# PHYSICS_GRAPHS.md (v1)

**Purpose.** Every archetype in `PHYSICS_SHAPES.md` and `PHYSICS_JOINTS_CONSTRAINTS.md` names one or more **G-IDs** from this file. The graph is not decoration — it is where the analytical curve and the numerical trace visibly overlay, i.e., where GIST's three-way comparison actually happens on screen. This file defines the canonical graphs, the physical constant hiding in each one's geometry, and the harness conventions for producing them.

**The organizing idea: every classic physics graph hides a constant in its geometry.** There are only five reading moves, and the whole mechanics curriculum cycles through them:

| Move | What it extracts | Archetypal example |
|---|---|---|
| **Slope** | a rate or a constant of proportionality | g from v–t in free fall; m from F–a; k from F–x |
| **Area** | an accumulated quantity | Δx under v–t; work under F–x; impulse under F–t |
| **Intercept** | an initial condition or offset | v₀ on v–t; equilibrium stretch mg/k on F–x |
| **Flatness (invariant)** | a conservation law | Σp(t) across a collision; E_total(t) on a track |
| **Linearization** | a law hiding inside a curve | plot T² vs L (not T vs L) → straight line, slope 4π²/g |

Teach the moves explicitly; every G-ID below names its move(s). The linearization move is the classic lab skill (PhET Pendulum Lab, every intro course) and GIST can make it interactive: let the student choose the axes and *discover* which choice straightens the data.

---

## Graph catalog

### G1 — v vs t (velocity–time) · moves: slope, area, intercept
- Slope = a; area = Δx; intercept = v₀.
- **Free fall / drop:** slope = −g. The single most important calibration graph in the harness: if the engine's slope isn't g to within timestep error, nothing downstream is trustworthy.
- **Incline (S0.1):** slope = g(sinθ − µcosθ); breakaway visible as slope onset.
- **Rolling race (S0.2):** three-line fan, slopes ½/⅔/5⁄7 · g sinθ — the shape-integral made visible.
- **Wagon stop (S2.3):** twin traces (cart, payload) diverging at the stop — Newton's first law as a graph.
- Constant-velocity vs constant-acceleration side-by-side (flat line vs ramp) is the ages-10–13 entry point.

### G2 — x vs t and y vs t (position–time) · moves: slope (tangent), curvature
- Tangent slope = instantaneous v (the pre-calculus on-ramp; Algodoo's projectile paper does exactly this to extract v₀ₓ and g).
- **Projectile (S0.5, S1.3):** x(t) straight (no horizontal force), y(t) parabolic — decomposition of 2D motion into two 1D graphs IS the projectile lesson.
- **Monkey-and-zookeeper (S0.5):** two y(t) curves with identical −½gt² sag below their ballistic lines.

### G3 — F vs a (or a vs F, a vs 1/m) · move: slope
- **Newton's second law (J5, S3.1, J8):** fixed m, vary F → slope = m. Fixed F, plot a vs 1/Σm → straight line through origin, slope = F (stacking blocks S3.1).
- **Atwood (J8):** a vs (m₂−m₁)/(m₁+m₂) → slope = g. A sneaky way to measure g with a pulley.
- PhET Forces & Motion is the canon reference (its live force/velocity/acceleration strip charts).

### G4 — F vs x (force–displacement) · moves: slope AND area ⭐
- **Hooke's law (J3):** slope = k; area = ½kx² = stored elastic PE. The one graph that teaches both moves at once — make it the poster child.
- **Work generally:** area under F(x) = W for any force profile; constant-F case (pushing a box) degenerates to the rectangle W = Fd (Physics Classroom "It's All Uphill": F·d invariant across ramp angles at fixed height).

### G5 — τ vs configuration (torque/equilibrium maps) · move: flatness/balance
- **Balance beam (J4):** net τ vs rider position; zero-crossing = equilibrium; the m₁d₁ = m₂d₂ hyperbola of balancing pairs.

### G6 — Energy vs t: KE, PE, E_total stacked · move: flatness (conservation) ⭐
- **Tracks (S1.0, S1.1, S1.3), pendulums (J1–J3):** KE and PE trade while E_total stays flat. This is Energy Skate Park's bar chart made continuous, and the single most curriculum-central graph for ages 10–18.
- **Dual duty — solver diagnostic:** on a frictionless scene, E_total(t) drift is *numerical artifact by definition*. Plot it, quantify it (% per cycle / per traversal), and show it to students: "the simulation is also an approximation" is a first-class GIST lesson, and it's the honest comparison between the contact coaster and the path-constraint coaster (⇄ panel in both sibling files).
- With friction ON: E_total decays and the *deficit* equals work done by friction — area bookkeeping meets conservation.

### G7 — Linearized single-relations · move: linearization
- **Stopping distance (S0.1 variant):** d vs v₀² → slope 1/(2µg).
- General pattern: any power-law relation gets a "choose axes until it's straight" interactive.

### G8 — Momentum & KE across collisions: p(t), KE(t) · move: flatness + step ⭐
- **All collision archetypes (S0.3, S2.1, S2.2, J5):** system Σp(t) flat through the collision (the invariant); KE(t) flat for elastic, step-down for inelastic. Two stacked strips tell the whole conservation story.
- **Ballistic pendulum (S2.2):** the signature two-phase graph — p conserved across the embed (KE steps down), then E conserved during the swing (p changes). Two laws, two graphs, two phases: this display IS the pedagogy.
- **Impulse variant:** F(t) during contact, area = Δp = J. Needs contact-impulse readout from the engine; same plumbing as N(θ).

### G9 — Oscillation traces: x(t) sinusoid · moves: period readout, amplitude invariance
- **Pendulum (J1), spring-mass (J3), bowl (S1.1):** measure T off the trace; overlay analytical sinusoid. Amplitude-independence (small angle) and its large-amplitude breakdown are both visible.
- **Damped variant:** exponential envelope; ties dampingRatio to what students see.
- **Double pendulum (J9):** twin traces with Δθ₀ = 0.001 diverging — chaos as a graph.

### G10 — Constraint-force traces: N(θ), T(v²) · move: threshold / zero-crossing
- **Loop-the-loop (S1.2):** reconstructed N around the loop; N → 0 at top exactly at v_top = √(gR). The graph *is* the minimum-speed condition.
- **Ball on string (J6):** T vs v² → slope m/r; slack onset at T = 0 mirrors the loop.
- Requires reaction-force readout plumbing (Planck `getReactionForce` / contact impulses; Rapier impulse queries) — shared infrastructure, build once, feeds G8's impulse variant too.

### G11 — Lab linearizations for oscillators · move: linearization ⭐
- **Pendulum (J1):** T² vs L → slope 4π²/g. The canonical high-school lab, straight out of PhET Pendulum Lab.
- **Spring (J3):** T² vs m → slope 4π²/k.
- **Physical pendulum (J2):** T² vs I/(mgd).
- These require *batch runs* (sweep a parameter, one point per run) — a different harness mode than time-series graphs. GIST's LLM-authoring angle shines here: "run this sim at L = 0.5…2.0 m and plot T² vs L" is a natural-language experiment design.

---

## Harness conventions

1. **Two graph modes, both first-class:**
   - **Time-series** (G1, G2, G6, G8, G9, G10): sampled every render frame from engine state; analytical `evaluate(t)` overlaid as a distinct curve, never a fit.
   - **Parameter-sweep** (G3, G4 slope-fits, G7, G11): N headless runs → one point each → scatter + analytical line. This mode is the lab-report generator.
2. **Overlay discipline:** numerical = points/solid, analytical = dashed; residual panel optional but valuable (residual growth exposes solver drift more honestly than eyeballing).
3. **Units on axes always; slopes/areas reported with units** — the unit of a slope is itself a teaching beat (m/s² falls out of m/s ÷ s).
4. **Derived quantities computed outside the engine** (KE = ½mv² + ½Iω², PE = mgy, p = Σmv) from sampled state — never trust engine-internal energy reporting, and compute identically for both engines so cross-engine comparison is apples-to-apples.
5. **Event markers:** collisions, breakaway, track departure, string-slack onset get vertical rules on time-series graphs; the marker positions are themselves analytical-vs-numerical comparanda (predicted vs observed departure time).
6. **Every archetype's DoD names its G-ID(s)** — enforced in both sibling files.

## Coverage map (quick index)

| G-ID | Move | Fed by |
|---|---|---|
| G1 | slope/area | S0.1, S0.2, S2.3, free-fall calibration |
| G2 | tangent | S0.5, S1.3, projectiles |
| G3 | slope | J5, J8, S3.1 |
| G4 | slope+area | J3, work/ramp demos |
| G5 | balance | J4 |
| G6 | flatness | S1.0, S1.1, S1.3, J1–J3, solver diagnostics |
| G7 | linearization | S0.1 variant |
| G8 | flatness+step | S0.3, S2.1, S2.2, J5 |
| G9 | period | J1, J3, J9, S1.1 |
| G10 | zero-crossing | S1.2, J6 |
| G11 | linearization | J1, J2, J3 (parameter-sweep mode) |
