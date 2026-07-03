# GIST Physics — Feature Wishlist

Forward-looking feature ideas for the simulation system. Complement to [GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md): that doc tracks *known issues and system-level concerns*; this one tracks *things we'd like to build*. Each item names what it unlocks pedagogically and what it depends on. No commitment implied — this is a brainstorm list to prune, prioritize, and convert into refactor docs as items get picked up.

Priority hint legend (rough — for triage, not commitments):
- ⭐⭐⭐ High leverage / unlocks curriculum
- ⭐⭐ Strong nice-to-have
- ⭐ Cool but narrow

Dependency hint:
- 🧱 Needs adapter-level work
- 🔧 Schema + UI only
- 🧪 Self-contained / mostly UI

---

## 1. Authoring ergonomics — DRY for the LLM

### ⭐⭐⭐ 🔧 N-object spawn / array shorthand
Today, spawning ten balls in a row means ten near-identical object entries in JSON — eats prompt budget and invites copy-paste typos. Schema sugar:

```jsonc
"objects": [{
  "id": "ball_${i}",
  "count": 10,
  "spacing": { "x": 30, "y": 0 },         // optional, applied per index
  "position": { "x": 100, "y": 200 },     // base position
  "velocity": { "x": 0, "y": 0 },
  "shape": { "type": "circle", "radius": 10 }
}]
```

Parser expands to ten object entries with `id` interpolated. Variants for grid (`count: { rows: 4, cols: 5 }`) and randomized initial conditions (`positionJitter: 5`) come out naturally.

**Unlocks:** Newton's cradle, multi-puller tug-of-war (PhET Net Force), particle-cloud sims, "drop 50 balls" demos. **Depends on:** schema parser only.

### ⭐⭐ 🔧 Object templates / presets
Common bodies (baseball, brick, feather, marble) defined once with mass + shape + drag coefficients + sprite, referenced by name:

```jsonc
"objects": [{ "preset": "baseball", "id": "ball", "position": { "x": 100, "y": 200 } }]
```

LLM picks a preset and overrides only what's interesting. Cuts prompt noise dramatically; also a place to encode physically-correct numbers so the LLM doesn't invent its own (`baseball.mass = 0.145`, `dragCoefficient = 0.3`, `referenceArea = 0.0042`).

**Unlocks:** consistent physics across LLM-generated sims. **Depends on:** schema parser + a curated preset library.

### ⭐⭐ 🔧 Inherit / extend pattern
For one-off variants of a preset (`extends: "baseball"` with overrides). Less critical if presets cover the common cases; useful for "two identical baseballs but with different initial velocities."

---

## 2. Timing & scripted events

### ⭐⭐⭐ 🔧 Time-keyed events on objects
The user's "wait 2 seconds before initial velocity" / "stop object Y after 2 seconds while others keep going" is the canonical case. A unified mechanism:

```jsonc
"objects": [{
  "id": "rocket",
  "events": [
    { "at": 2.0,  "set": { "velocity": { "x": 50, "y": 0 } } },
    { "at": 5.0,  "set": { "velocity": { "x": 0,  "y": 0 } } },
    { "at": 6.0,  "set": { "isStatic": true } }
  ]
}]
```

`events` is a sorted timeline; `JsonSimulation.onUpdate` pops and applies events whose `at` is in the past. Works in live, precompute, and replay (events are baked into the precomputed snapshots).

**Unlocks:** delayed starts, scheduled stops, multi-stage rockets, one-off impulses ("at t=3 give it a kick"), pre-staged collisions. **Depends on:** schema + event-loop work in `JsonSimulation`. No engine changes.

### ⭐⭐⭐ 🔧 Event types beyond `set`
Same timeline machinery, richer actions:

- `applyImpulse: { x, y }` — one-shot kick
- `setAppliedForce: { x, y }` — change a sustained force (depends on applied-forces refactor)
- `spawn: { ...objectConfig }` / `destroy: "id"` — bodies enter/leave the world
- `setProperty: { path: "frictionDemo.muStatic", value: 0.7 }` — generalized state change
- `pause: 0.5` / `resume` — pause sim time for emphasis (debatable; might confuse students)

### ⭐⭐⭐ 🔧 Trigger-based events (sensor-driven, not time-driven)
Pairs with the sensor primitive (see §4). Same event vocabulary, different cause:

```jsonc
"sensors": [{
  "id": "finish_line",
  "region": { "type": "rectangle", "x": 800, "y": 0, "width": 10, "height": 600 },
  "onEnter": { "object": "ball", "do": [{ "type": "destroy" }, { "type": "log", "message": "finish at {time}s" }] }
}]
```

**Unlocks:** lap timers, goal regions, "catch the ball when it falls below the floor", chain reactions ("when ball A reaches sensor 1, give ball B a kick"). **Depends on:** sensor primitive + event vocabulary.

### ⭐⭐ 🔧 Sequences / chapters (Vernier-style activities)
A simulation that progresses through scripted phases:

```jsonc
"sequence": [
  { "duration": 3, "narration": "Watch the cart accelerate uniformly" },
  { "duration": 2, "narration": "Now match the dashed line on the velocity graph",
    "show": { "targetGraph": "vernier_match_1.csv" } },
  { "duration": 5, "narration": "Apply force opposite to motion until cart stops" }
]
```

Each chapter has a duration + narration + optional overlay (target graph, hint arrows). Naturally pairs with the **graph-matching** mode below.

**Unlocks:** Vernier-style guided activities, multi-step demonstrations, classroom-friendly pacing. **Depends on:** events system + graph-overlay UI.

### ⭐⭐ 🧪 Time-scale slider / slow motion
A global speed multiplier that affects the rendering rate but not the physics integration accuracy. PhET sims have this; it's pedagogically powerful for impact moments.

```jsonc
"environment": { "timeScale": 0.25 }   // optional, also exposable as slider
```

**Depends on:** trivial — just multiply the rAF dt before stepping. Already largely there in the playback controls; just needs a clean knob.

### ⭐ 🧪 Stroboscopic / motion-diagram mode
Show ghosted snapshots at fixed time intervals (every 0.5 s, etc.) — the canonical physics-textbook motion diagram. Toggle in the debug panel + a per-sim opt-in.

**Unlocks:** "see the spacing of dots — equal spacing means constant velocity" pedagogy.

---

## 3. Graph matching (the Vernier classic)

### ⭐⭐⭐ 🧪 Target-graph overlay + match scoring
The activity that made Vernier famous: a target velocity-vs-time (or position-vs-time) curve is shown on the graph; students drive a body's motion to match it (via slider, applied force, or click-and-drag). The system scores how closely the live trace tracks the target.

Schema:

```jsonc
"graphs": [{
  "type": "line",
  "property": "velocity.x",
  "target": {
    "source": "inline",                           // or "csv"
    "points": [[0, 0], [2, 5], [5, 5], [7, 0]],   // piecewise-linear target
    "tolerance": 0.5,
    "scoringWindow": [0, 7]
  }
}]
```

**Unlocks:** the headline pedagogical activity from the Vernier era — students who can describe motion in graphs are doing real physics. Also: motion-discrimination ("which graph matches this animation?") becomes authorable.
**Depends on:** Recharts overlay + a scoring/diff routine. Self-contained.

### ⭐⭐ 🧪 Live trace recording / "save this run"
Run the sim, save the resulting trace as the new target. Lets a teacher record a target by demonstration, then ask students to reproduce it.

### ⭐ 🧪 Motion-diff replay
Side-by-side: target trace + student trace, rendered together. Optional ghost-body that traces the *target* motion next to the student's live body.

---

## 4. Engine primitives currently missing

These overlap with the feature-gaps section in the [topics doc](GIST_Physics_System_Topics.md). Listed here with the *features* they'd unlock once exposed.

### ⭐⭐⭐ 🧱 Sensors (non-colliding trigger fixtures)
Already in the topics doc as a feature gap. Pairs with trigger-based events above.
- **Unlocks:** goal regions, lap timers, "ball reaches X" detection, sensor → event chains.

### ⭐⭐⭐ 🧱 Joints (spring, revolute, prismatic, rope, pulley) — SCOPED 2026-07-02 → PHYSICS_JOINTS_CONSTRAINTS.md
The single biggest content gap. **This brainstorm item has graduated into a
topics-driven roadmap: [PHYSICS_JOINTS_CONSTRAINTS.md](PHYSICS_JOINTS_CONSTRAINTS.md)**
(archetypes J1–J9, definition-of-done, engine-asymmetry budget). The wishlist entry
stays here as the origin note; the roadmap is now the doc of record. It remains 🔴 in
[GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md) (no adapter support /
no phased refactor yet).
- **Unlocks:** Hooke's law, pendulums, Atwood machines, springs, harmonic oscillators, rotating platforms, hinged doors, soft constraints. Half of intro mechanics is gated behind this.
- **Note:** Rapier's `JointData.spring(restLength, k, c)` is the cleanest mapping for textbook Hooke. Planck-only joints (pulley, mouse, gear, friction) are a tier-2 nice-to-have. Roadmap flags Rapier's **missing native PulleyJoint** (Atwood shim) and rope/spring-joint **version availability** as the things to verify first.

### ⭐⭐ 🧱 Contact-impulse readout
Adapter exposes per-contact impulse magnitudes from `postSolve` (Planck) / `ContactForceEvent` (Rapier).
- **Unlocks:** "Δp per collision" momentum-conservation graphs, Newton's-3rd-law force-pair arrows, impulse-vs-time graphs for impacts.

### ⭐⭐ 🧱 CCD opt-in per body
- **Unlocks:** fast projectiles without tunneling, thin-wall demos.

### ⭐⭐ 🧱 Per-surface friction patches
A floor with low-μ ice patch + high-μ rubber patch, encoded as separate static bodies with different `friction` values. Already possible by authoring multiple floor segments; the request would be cleaner authoring (one floor entity with regions).

---

## 5. Visualization (passive — no extra physics)

### ⭐⭐⭐ 🧪 Vector arrow renderable (shared)
Single `VectorArrow` component that takes a vector path and renders the live arrow on the canvas. Used by the [applied-forces refactor](Notes_on_Applied_Forces_Refactor.md) (force arrows) and the [vector-representation refactor](Notes_on_Vector_Representation_Refactor.md) (any vector field). Build once.

### ⭐⭐ 🧪 Trajectory trails
Per-body, fade-over-time trail of the last N seconds of position. Toggleable in debug panel; per-body opt-in via schema. Trivial overlay; high pedagogical value for projectile/orbital motion.

### ⭐⭐ 🧪 Energy bar chart (PhET "Energy Skate Park" style)
Stacked bars or pie showing KE / PE / Spring PE / Thermal (lost to friction) over time. Reads the same getters used for the energy graphs but in a different visual idiom. Bundles naturally with the conservation-of-energy unit.

### ⭐⭐ 🧪 Coordinate axes / labeled origin overlay
Explicit X/Y axes drawn on the canvas with tick marks and units. Origin marker. Toggleable. Lays the foundation for proper vector teaching alongside the polar-form refactor.

### ⭐ 🧪 Force-pair (Newton's 3rd law) visualization
When two bodies are in contact, draw the action/reaction arrow pair. Reads from contact-impulse hook. Surprisingly hard to find a good UX for — arrow length scaling matters. Worth a UI iteration.

### ⭐ 🧪 Vector-field overlay
Background grid showing local gravitational/applied force at each cell. Mostly for orbital and field-line teaching, lower priority for intro mechanics.

---

## 6. Data capture — Vernier parity

### ⭐⭐⭐ 🧪 Click-to-capture data points
Vernier LabQuest's signature interaction: click a moment in the playback to record `(t, x, v, a, ...)` to a table. The table is exportable as CSV. Already partial parity in `ball_bounce_data.csv` — generalize.

**Unlocks:** "do a real lab" workflow on top of any sim. Real students collect data, fit a curve, write a lab report.

### ⭐⭐ 🧪 Annotations on the graph
Click a point on the graph, attach a label ("apex", "impact"). Annotations save with the sim. Pedagogical hand-off from teacher demonstration to student worksheet.

### ⭐ 🧪 Real-data overlay
Overlay an external CSV (e.g., from a real Vernier sensor in a classroom) on the same axes as the simulated trace. "Did our model match reality?"

---

## 7. Pedagogical specials (specific, opinionated)

### ⭐⭐ 🔧 Inclined-ramp primitive
Single schema entity: `{ type: "ramp", angle: 30, length: 200, position: { x, y } }`. Parser expands to a rotated rectangle wall. Saves the LLM from having to compute `cos/sin` for the corner positions, which it gets wrong often.

### ⭐⭐ 🔧 Pendulum primitive
`{ type: "pendulum", length: 1.5, mass: 0.5, anchor: { x, y }, initialAngle: 30 }`. Expands to a static anchor + dynamic bob + revolute joint. Saves the LLM from manually wiring three pieces together.

### ⭐⭐ 🔧 Spring-mass primitive
`{ type: "springMass", mass: 1, k: 100, restLength: 1, anchor: { x, y } }`. Same idea — expands to anchor + bob + spring joint.

### ⭐⭐ 🧪 Initial-condition randomization
`"velocity": { "x": 30, "xJitter": 5 }`. Gives students a slightly different trajectory each run, reinforcing the experimental nature of the activity.

### ⭐ 🔧 Gravity-direction slider
For orbital and "what if down were sideways" demos. Polar input form already covered by the vector-representation refactor.

### ⭐ 🔧 Point-source gravity / orbital mode
A body whose gravity is `r⁻²` from another body, not the world's uniform field. Two-body orbits. Niche but visually powerful — and pairs naturally with conservation-of-energy graphs that show closed-orbit ↔ circular ↔ elliptical mappings.

---

## 8. Replay & comparison

### ⭐⭐ 🧪 Ghost replay (A/B compare)
Run a sim, save the trace as a "ghost." Run again with one parameter changed; render the ghost as a translucent trail next to the live body. PhET does this for projectile motion under different drag/mass. Pairs with the air-resistance refactor's pedagogical goals.

### ⭐ 🧪 Reverse-time playback
The replay path is already snapshot-driven; running snapshots backwards is a small extension. Pedagogically interesting for collisions ("does this look natural in reverse?" — i.e., entropy/dissipation visualization).

---

## 9. Engine + system stretch goals

### ⭐ 🧱 Programmable-controller variants on any slider
Instead of a static slider, allow the slider value to be a **profile** over time:
- `linear: { from: 0, to: 100, duration: 5 }`
- `sinusoidal: { amplitude: 50, period: 2, offset: 0 }`
- `square: { low: 0, high: 100, period: 4, duty: 0.5 }`

Drives applied force, gravity, mass, anything. Unlocks driven oscillators (resonance demos) and standard force-vs-time profiles for kinematics labs.

### ⭐ 🧱 Soft-body / rope / chain primitives
Both engines support multi-body chains via joint chains. Authored as one schema entity that expands to N bodies + N−1 joints. Niche but high-engagement (jump rope, hanging chains, rolling ropes).

### ⭐ 🧱 Particle emitters
A point source that emits a body at a configured rate, with a jitter pattern. For Brownian-motion, fountain, gas-pressure-style sims. Pairs with N-object spawn but evolves over time.

---

## 10. Expression-based controls & bindings

The current binding layer maps a slider/output/graph to a single property *path* on a body (`velocity.x`, `position.y`). This section extends that to:

- **Computed outputs** — display a value derived from body state via an expression: `KE = 0.5 * mass * (velocity.x^2 + velocity.y^2)`.
- **Computed inputs** — sliders that drive a *derived* quantity (KE, GPE, momentum, launch angle), with the binding layer doing the inverse computation back to a property write.
- **Multi-body controls** — one slider/toggle that targets a group of bodies (`ball_*`), broadcasting writes or summing reads.

This is the layer that lets pedagogically-meaningful quantities (energy, momentum, system totals) become first-class controls and displays — not just `velocity.x` and `position.y`.

### ⭐⭐⭐ 🧪 Computed-output expressions (read-side)
Outputs and graphs accept an `expression` field instead of (or alongside) `property`:

```jsonc
"outputs": [{
  "object": "ball",
  "label": "Kinetic energy",
  "expression": "0.5 * mass * (velocity.x^2 + velocity.y^2)",
  "unit": "J"
}],
"graphs": [{
  "type": "line",
  "label": "Total mechanical energy",
  "expression": "0.5 * ball.mass * (ball.velocity.x^2 + ball.velocity.y^2) + ball.mass * abs(env.gravity.y) * (ball.position.y - ground.position.y)",
  "unit": "J"
}]
```

The expression evaluates at every sample/render. Variables resolve to body properties (with the body name prefixed for cross-body refs), `env.*` for environment, plus a handful of math functions (`sqrt`, `abs`, `sin`, `cos`, `atan2`, `min`, `max`, `hypot`, `pow`).

**Pedagogically the unlock**: KE, PE, total mechanical energy, momentum magnitude, system totals, separation distance, relative velocity — all become one-liner outputs without code changes.

**Depends on:** small, sandboxed expression evaluator (see "Expression language" below). No engine work.

### ⭐⭐⭐ 🧪 Computed-input expressions (write-side / inverse expressions)
A slider can target a **named computed property** whose inverse is hand-coded in the binding layer:

```jsonc
"controls": [{
  "type": "slider",
  "label": "Initial KE",
  "object": "ball",
  "computed": "kineticEnergy",   // not "property" — a registered computed
  "min": 0, "max": 100, "step": 1, "defaultValue": 50, "unit": "J"
}]
```

Internally, when the slider writes `KE = 50`:
- For a **purely horizontal** motion (only `velocity.x` is non-zero or initial config locks vy to 0): `velocity.x = sign(velocity.x || 1) * sqrt(2 * KE / mass)`
- For **2D motion**: write to `velocity.magnitude = sqrt(2 * KE / mass)`, letting the polar layer's held-angle preserve direction. This is the right answer in general — KE doesn't constrain direction, only speed.

A starter registry of named computeds (each with a forward expression for read and an inverse for write):

| Computed             | Forward (read)                                | Inverse (write)                                 | Notes                                  |
|----------------------|-----------------------------------------------|-------------------------------------------------|----------------------------------------|
| `kineticEnergy`      | `0.5 * m * (vx² + vy²)`                       | `velocity.magnitude = sqrt(2·KE / m)`           | Direction held by polar layer          |
| `gravitationalPE`    | `m · |g| · (y − groundY)`                     | `position.y = groundY + GPE / (m·|g|)`          | Needs a designated `ground` body       |
| `speed`              | `hypot(vx, vy)`                               | `velocity.magnitude = speed`                    | Same as polar `.magnitude`             |
| `launchAngle`        | `atan2(vy, vx)`                               | `velocity.angle = θ`                            | Same as polar `.angle`                 |
| `momentumMagnitude`  | `m · hypot(vx, vy)`                           | `velocity.magnitude = p / m`                    |                                        |
| `momentumX`          | `m · vx`                                      | `velocity.x = px / m`                           |                                        |
| `heightAboveGround`  | `y − groundY`                                 | `position.y = groundY + h`                      |                                        |
| `separation`         | `hypot(b1.x − b2.x, b1.y − b2.y)`             | (no inverse — read-only)                        | Two-body                               |
| `period`             | `2π·sqrt(m/k)`                                | (no inverse — derived from joint config)        | For spring-mass primitives             |

Read-only computeds (`separation`, `period`, etc.) are output-only — no slider binding.

**Why a curated registry, not a general inverse solver:** symbolic inversion of arbitrary expressions is hard and fragile. The textbook computeds students actually need are a short list with known closed-form inverses. Curate them; reject novelty.

### ⭐⭐⭐ 🔧 Multi-body controls (group bindings)
A slider/toggle that targets a *set* of bodies, identified by id glob, tag, or type:

```jsonc
"controls": [{
  "type": "slider",
  "label": "Mass of all balls",
  "selector": { "idPattern": "ball_*" },
  "property": "mass",
  "min": 0.1, "max": 5, "step": 0.1, "defaultValue": 1
}, {
  "type": "toggle",
  "label": "Freeze all rockets",
  "selector": { "tags": ["rocket"] },
  "property": "isStatic"
}]
```

Write semantics: **broadcast** — same value to every member. Read semantics for a multi-body output:

```jsonc
"outputs": [{
  "label": "Total system KE",
  "selector": { "idPattern": "ball_*" },
  "expression": "sum(0.5 * mass * (velocity.x^2 + velocity.y^2))",  // sum() reduces over the selection
  "unit": "J"
}]
```

`sum()`, `mean()`, `min()`, `max()`, `count()` reduce over a multi-body selection.

**The pedagogical headline**: "Total system momentum" and "Total system KE" outputs that are *constant* during elastic collisions and *drop* during inelastic collisions. Conservation laws become visible quantities, not derived-on-paper.

**Depends on:** selector resolver (id pattern is enough for v1; tags later) + reduce functions in the expression evaluator.

### ⭐⭐ 🧪 Pure-input "scratch" parameters
A slider that doesn't directly bind to a body — it sets a **named parameter** that expressions can reference:

```jsonc
"parameters": [
  { "name": "launchAngle", "min": 0, "max": 90, "step": 1, "defaultValue": 45, "unit": "°" },
  { "name": "launchSpeed", "min": 0, "max": 50, "step": 0.5, "defaultValue": 30, "unit": "m/s" }
],
"controls": [
  { "type": "slider", "parameter": "launchAngle", "label": "Launch angle" },
  { "type": "slider", "parameter": "launchSpeed", "label": "Launch speed" }
],
"objects": [{
  "id": "ball",
  "velocity": {
    "x": "launchSpeed * cos(deg2rad(launchAngle))",
    "y": "launchSpeed * sin(deg2rad(launchAngle))"
  }
}]
```

Parameters live outside the body state — they're inputs to the expression layer that compute initial conditions or runtime targets. **Subsumes the polar slider**: angle/speed sliders become two scratch parameters with two derived expressions on `velocity.x` / `velocity.y`. **Subsumes a lot of the "named computed" registry too** if expressions are powerful enough — though the named registry is still the cleaner UX for KE/GPE/momentum (so students see "kinetic energy" not "0.5*m*(vx^2+vy^2)").

Both layered styles can coexist: scratch parameters for arbitrary auxiliary inputs, named computeds for canonical physics quantities.

### Other useful expression-based items (input + output)

#### ⭐⭐⭐ 🧪 Conservation-check outputs (with threshold coloring)
A scalar output that displays `|currentValue - initialValue|` and turns red when the deviation exceeds a tolerance. The natural way to make conservation laws *visible* during demos:

```jsonc
"outputs": [{
  "label": "Σ momentum drift",
  "expression": "abs(sum(mass * velocity.x) - sum.initial(mass * velocity.x))",
  "unit": "kg·m/s",
  "threshold": { "warn": 0.01, "alarm": 0.1 }
}]
```

`sum.initial(...)` snapshots the value at t=0 and holds it. Worth its weight for collision sims and "is the engine actually conserving stuff?" sanity checks.

#### ⭐⭐ 🧪 Center-of-mass output / overlay
Per-group center-of-mass position rendered both as a numeric output and as an X marker on the canvas. Pairs with two-body / system sims.

```jsonc
"outputs": [{
  "label": "Center of mass",
  "selector": { "idPattern": "ball_*" },
  "expression": "sum(mass * position.x) / sum(mass)",
  "unit": "m"
}]
```

#### ⭐⭐ 🧪 Cross-body expressions (relative motion, separation, COR)
- Relative velocity: `hypot(ballA.velocity.x - ballB.velocity.x, ballA.velocity.y - ballB.velocity.y)`
- Separation distance: `hypot(ballA.position.x - ballB.position.x, ballA.position.y - ballB.position.y)`
- Coefficient of restitution at impact: requires event hook — `|v_after| / |v_before|`, sampled at contact begin/end (see [events refactor](GIST_Physics_Wishlist.md) §2)

#### ⭐⭐ 🧪 Logarithmic / non-linear sliders
For mass spans like 0.001 kg (feather) to 100 kg (refrigerator), linear sliders are hopeless. Add `scale: "log"` to the slider config:

```jsonc
{ "type": "slider", "label": "Mass", "property": "mass", "min": 0.001, "max": 100, "scale": "log", "defaultValue": 1 }
```

Independent of expressions but high pedagogical value. (Same idea: `scale: "quadratic"` for energies that span orders of magnitude.)

#### ⭐⭐ 🧪 Threshold / alarm outputs
Numeric output that flashes / colors on a condition: `when KE > 50`, `when speed > terminal`, `when y < 0`. Lets demos highlight specific moments without authoring an event.

#### ⭐ 🧪 Computed initial conditions on objects
Already implicit in scratch parameters above, but worth calling out as its own win: `initialKE: 50` on an object should set initial speed to `sqrt(2·50/m)` automatically. Equivalent to "the inverse of the named computed runs at parse time, against the body's initial state."

#### ⭐ 🧪 Bar gauge / dial outputs (presentation variants)
Numeric is fine; for energy meters and force gauges, a horizontal bar or dial with labeled zones is more legible. Same data, different render. Pairs especially well with conservation-check outputs.

#### ⭐ 🧪 Output formatting — sig figs, scientific notation, units autoscale
Energies cross many orders of magnitude (mJ to MJ); a single decimal-format setting won't cover everything. Per-output formatting (`format: { sigFigs: 3, autoScale: true }`) lets readouts stay legible across slider ranges.

### Expression language design notes (intentionally small)

For v1, keep the language **strictly limited**:

- **Pure expressions only** — no statements, no loops, no assignment, no side effects.
- **Variables**:
  - Body properties via dot path: `mass`, `velocity.x`, `position.y` (resolved against the binding's bound body)
  - Cross-body refs with explicit object name: `ballA.position.x`, `ground.position.y`
  - Environment: `env.gravity.x`, `env.gravity.y`, `env.airDensity`
  - Parameters: bare names like `launchAngle` (when declared in the `parameters` block)
  - Time: `t` for current sim time
- **Operators**: `+ - * / %` (arithmetic), `^ or **` (power), `- (unary)`, parens. **No comparison or boolean** in v1 (those land with the events/triggers refactor).
- **Functions**: `sqrt`, `abs`, `sin`, `cos`, `tan`, `atan2`, `asin`, `acos`, `exp`, `log`, `min`, `max`, `hypot`, `pow`, `floor`, `ceil`, `round`, `sign`, `deg2rad`, `rad2deg`. No user-defined functions.
- **Reductions** (multi-body): `sum`, `mean`, `min`, `max`, `count`. `sum.initial(...)` and friends for snapshot-at-t=0.
- **Rejection list** (security): no `eval`, no property access via dynamic strings, no member access on non-whitelisted objects. The evaluator should be a small parser + tree-walker over a whitelist, not a JS sandbox.

A few solid expression-evaluator libraries exist (e.g., `expr-eval`, `mathjs` with safe mode) — pick one with a clear allowlist surface, or write the parser by hand against this spec (it's ~200 lines).

### Composition with the other refactors

- **Vector representation**: `velocity.magnitude` and `velocity.angle` are the cleanest write targets for KE/momentum-magnitude bindings. The polar layer's held-angle / held-magnitude state is *exactly* what makes "set KE while preserving direction" work correctly. The two refactors compose tightly.
- **Applied forces**: `appliedForce.magnitude` slider with a separate `appliedForce.angle` slider, plus an output showing `appliedForce.magnitude` numerically — falls out for free once expressions + polar are wired.
- **Air resistance**: `terminalVelocity = sqrt(m·|g|/k)` becomes a one-line output. Validates the drag refactor visually.
- **Events / sequences** (§2 of this wishlist): events whose `at` is itself an *expression* (`at: "apex"` resolves to the time when `velocity.y` crosses zero) is the natural follow-on. Out of scope for the v1 expression language; lands with events.
- **Authoring ergonomics**: parameters block + N-object spawn together let the LLM author "ten balls each with a slightly different drag coefficient" cleanly without per-object verbosity.

### Phasing

1. **v1 — read-side expressions only.** Outputs and graphs accept `expression`. Curated `selector` for multi-body reductions. No write-side, no parameters block. Smallest possible footprint that delivers KE/PE/momentum displays.
2. **v2 — named computed inputs.** A small registry (`kineticEnergy`, `gravitationalPE`, `momentumMagnitude`, `heightAboveGround`) with hand-coded inverses. No general inverse solver.
3. **v3 — scratch parameters + multi-body controls.** Parameter declarations + write-side broadcasts. Subsumes the polar slider. Largest blast radius — touches initial-condition parsing.
4. **v4 — threshold outputs, log sliders, formatting.** Polish layer; ship as items pile up.

---

## 11. UI & UX — must-haves

The first ten sections are physics/content capabilities. The next three are about *reaching* those capabilities — the UI/UX layer. Capabilities don't help anyone if students can't pause the sim, teachers can't share it, and the LLM can't tell the user something went wrong. Splitting into three tiers (must-have / quality-of-life / power-user) so the conversation about "what to fix first" stays separated from "what to build next."

Many baseline pieces are already in: play/pause/reset, zoom, drag-to-move, edit overlay, engine switcher, data download, scale slider, unsaved-changes indicator, grid background, basic localization. These items are gaps or hardenings on top of that.

### ⭐⭐⭐ 🧪 Clear distinction between Edit mode and Play mode
Recent commits flag this as a real source of confusion ("physics engine sim doesn't follow click-to-edit", "flag that alerts the user when they are trying to move an object when the sim is not in the original position"). The existing flag is a start; the deeper fix is a more obvious *visual* mode signal — different cursor, different chrome color, "Edit" label in the canvas area, locked controls in Play mode that visibly enable on Reset. Until edit-vs-play is unambiguous, the click-to-edit UX has a permanent papercut.

### ⭐⭐⭐ 🧪 Useful error states for invalid configs
LLM-generated JSON is the primary input path; it *will* produce invalid configs. Today (presumed) the failure is silent or stack-trace-y. Need: a panel that surfaces parse errors with the offending field highlighted, a "fix this" hint, and the previous valid sim still visible while you fix.
- Schema validation errors: which field, which value, what was expected.
- Engine-incompat errors (when joints/sensors land): "this sim uses springs which are best on Rapier; switch?".
- Runtime errors: catch and display, don't blank-screen.

### ⭐⭐⭐ 🧪 Loading / progress states for async operations
LLM generation, precompute, replay seek, engine switching — all currently (likely) blocking with little feedback. Each needs a visible progress signal:
- LLM call: streaming preview if available, indeterminate spinner with "Generating sim... ~10s" otherwise.
- Precompute: progress bar (the existing batch loop already knows `done / totalFrames`).
- Engine switch: brief overlay during reinit.

### ⭐⭐⭐ 🧪 Keyboard shortcuts for the core loop
Spacebar = play/pause is universal. Arrow keys = scrub. R = reset. ⌘Z / ⌘⇧Z = undo / redo. Tab through controls. Without these, every interaction is a mouse trip.

### ⭐⭐⭐ 🧪 Undo / redo for edits
Edit-mode changes (drag, slider, JSON paste) need a history stack with ⌘Z / ⌘⇧Z. The unsaved-changes indicator already implies a notion of "modified state" — the next step is reversible state.

### ⭐⭐ 🧪 Tooltip / hover help on every control
LLM-generated sliders may have unfamiliar labels ("Drag coefficient", "Restitution"). A hover tooltip with a one-sentence definition + units removes the "what is this?" tax for students. Pulls the same description text the LLM saw in `.describe()`.

### ⭐⭐ 🧪 Touch / mobile core interactions
Project is iPad-shaped — labs, classrooms, students. Pan, pinch-zoom (zoom landed; pan is the natural pair), tap-to-edit, drag-with-touch. No hover-only affordances that disappear on touch.

### ⭐⭐ 🧪 Browser-back and shareable URL state
At minimum: the current sim config encoded in the URL (or a server-issued shortcode). "Send this link to a student" is the killer-app workflow for classroom use; without it, sharing is "copy this whole JSON blob."

### ⭐⭐ 🧪 Confirm before destructive actions
Clear sim, delete object, switch engine, apply LLM regeneration — anything that destroys current work needs an "are you sure?" with an option to undo for ~10s after.

### ⭐⭐ 🧪 Pristine canvas state on page load
First impression for a new user is everything. A friendly default sim (or a one-screen "what is this?" with a button to load an example) beats an empty canvas with cryptic controls.

---

## 12. UI & UX — quality of life

Substantial UX upgrades that make the product feel polished and reduce friction for routine use.

### ⭐⭐⭐ 🧪 Save / load named sims
Beyond browser localStorage of the current sim — a list of named saves the user can return to. Pairs with shareable URLs: the URL-encoded sim *is* a save.
- Auto-save drafts so a refresh doesn't lose work.
- "Recent sims" menu in the header.

### ⭐⭐⭐ 🧪 Side-by-side JSON / visual editor
Visual edits update the JSON; JSON edits update the visual. Both panels live, syntax-highlighted, with schema-aware autocomplete in the JSON pane. Today the JSON is presumably an opaque export; making it a first-class editing surface bridges the LLM workflow and the click-to-edit workflow.

### ⭐⭐⭐ 🧪 Snap-to-grid / snap-to-axes in Edit mode
Grid background already lands; the natural follow-on is snapping for drag operations. Hold ⇧ to disable snap, hold ⌥ for finer grid. Vector-arrow drags (when force/velocity become draggable) snap to cardinal angles.

### ⭐⭐ 🧪 Multi-select and bulk edit
Lasso or shift-click multiple bodies, then edit them as a group. Pairs with the multi-body controls in §10 — multi-select is the *interactive* counterpart to selector-based bindings.

### ⭐⭐ 🧪 Selection / hover highlight
Hovering an object dims the rest of the canvas; clicking it pins the highlight. Connects to outputs/graphs that bind to that object — they highlight too. Makes "which slider controls what" legible at a glance.

### ⭐⭐ 🧪 Resizable / detachable panels
The fixed layout works on a 1080p monitor. On a tall portrait laptop or an iPad, reflow matters. Existing reactive-spacing commits move toward this; the next step is letting the user resize panels and pin/detach the graphs panel into a second window for projector use.

### ⭐⭐ 🧪 Configurable units display
Same physics, different readout — m vs cm, kg vs g, m/s² vs g, ° vs rad. A user-side preference, not a sim-side change. Lets a teacher show the same sim in the units the curriculum uses.

### ⭐⭐ 🧪 Theme toggle (light / dark)
Classroom projectors handle dark themes badly; student screens at home benefit from dark. Both should look intentional. Tailwind makes this cheap to add if it isn't already.

### ⭐⭐ 🧪 Accessibility audit
Keyboard-only operation through the whole product (build it as you go, not at the end). Screen-reader labels on every control. High-contrast mode. ARIA roles on dynamic regions (the graphs, the canvas, the LLM output panel). Without this, the product can't ship into public-school classrooms.

### ⭐⭐ 🧪 Streaming AI generation feedback
While the LLM is generating: stream tokens into a "preview JSON" panel as they arrive; stream the partial sim into the canvas as parsing succeeds. Beats a 10-second spinner. The current `modal_functions/` setup may already support streaming — UX-side wiring is the missing piece.

### ⭐ 🧪 Export as PNG / GIF / MP4
Screenshot is one click. Animated capture (a few seconds of canvas + graph) is invaluable for teachers building handouts and slide decks. Stretch goal: capture a precomputed run as a video file directly.

### ⭐ 🧪 Print-friendly layout
A "Print this sim" mode produces a clean page with a snapshot, the parameters table, and the graph(s). The Vernier-era equivalent of a lab handout.

### ⭐ 🧪 Internationalization beyond the first pass
Localization started recently. Worth a follow-on for: physics-quantity names ("velocity" → its translation), unit names, error messages, default object names that LLM picks. Schema descriptions stay in English (LLM-prompt) but UI labels respect locale.

---

## 13. UI & UX — power user

Features for teachers building lessons, developers debugging the engine, and curriculum authors who want fine control. None of these are necessary for daily classroom use; together they make GIST a tool that *scales* from "click play" to "build my own physics curriculum."

### ⭐⭐⭐ 🧪 Schema-aware JSON editor
First-class JSON editing surface (Monaco or CodeMirror) with:
- Syntax highlighting + schema validation as-you-type
- Autocomplete on field names and enum values from the Zod schemas
- Inline schema documentation on hover (pulls `.describe()` text)
- Format / lint command
- Diff view against last saved version

This is the bridge between the visual UI and full LLM-prompt-equivalent editing. Today (presumed) JSON paste is the only path; a real editor turns power users into authors.

### ⭐⭐⭐ 🧪 Physics inspector / debug overlay
A panel that shows for each body: live position, velocity, mass, current applied force, current friction, contact list, sleeping state, kinetic + potential energy. Toggle on a per-body basis (click → inspector shows that body). Indispensable for debugging "why doesn't this sim look right" without dropping into the dev console.
- Pairs with the existing `AdvancedDebugPanel`; this is its body-state counterpart.

### ⭐⭐⭐ 🧪 Step-by-step "single step" mode
Pause and step the engine one frame (or one substep) at a time. Watch the contact-list build, the impulses resolve, the position update. Sniffs out integration bugs in seconds. Used to be a Box2D testbed staple.

### ⭐⭐ 🧪 Parameter sweep / sensitivity mode
"Run this sim 20 times with `mass` swept from 0.1 to 10." Each run produces a trace; all traces overlay on the graph. The natural lab tool — students see how a quantity *depends* on a parameter, not just one sample.
- Pairs cleanly with §10 expressions: sweep `dragCoefficient` and watch terminal velocity scale.
- Export all runs as CSV for spreadsheet analysis.

### ⭐⭐ 🧪 Compare / diff two sims side-by-side
Two canvases, two graphs, two parameter panels — same time cursor. "How does this projectile fall with vs without air resistance?" becomes a one-screen visual. Different from the ghost replay (§8) — that's a single canvas with a ghost; this is two full sims.

### ⭐⭐ 🧪 Batch export / scripted runs
A teacher prepares 10 sim variants for an in-class quiz. Headless mode: feed in a list of configs, output snapshots + traces for each. Pairs with the schema-aware editor for authoring at scale.

### ⭐⭐ 🧪 Preset / template library (curated)
A built-in collection of well-formed sims (Galileo's ramp, Newton's cradle, Atwood machine, projectile range, harmonic oscillator) that load with one click. Each preset is annotated with the curriculum unit it teaches, the expected experimental result, and any sliders the student should explore.
- Pairs with the [object presets](GIST_Physics_Wishlist.md) in §1: object-presets are reusable bodies; sim-presets are reusable scenarios.

### ⭐⭐ 🧪 Live editing of physics-engine parameters
The `solverIterations` / `positionIterations` / substep-count knobs already plumbed — surface them in `AdvancedDebugPanel` per-engine. A teacher debugging "why is the spring jittery?" can crank iterations and verify it's a numerical issue, not a model issue.

### ⭐ 🧪 Replay scrubber with event markers
Tick marks on the timeline at every collision, sensor trigger, scripted event. Click a tick to jump there. Pairs with the events refactor.

### ⭐ 🧪 Custom assertions / "test this sim"
Power-user mode: declare a property the sim must satisfy ("|p_total| stays within 1% of initial throughout"). Run the sim and report pass/fail with the failing time/value. Fits naturally with conservation-check outputs (§10) — assertions are conservation-checks with a pass/fail threshold. The natural way to validate that LLM-generated sims actually obey conservation laws.

### ⭐ 🧪 Workspace / project organization
Folders of sims, with shared presets, a project-level parameter library, and a "lesson plan" structure (intro sim → guided exploration → assessment quiz). Stretch goal — only relevant once the user base includes curriculum authors.

### ⭐ 🧪 Plugin / extension hooks
For developers who want to add a new renderable, a new slider variant, or a new computed-property type without forking the project. Out of scope until the project has external developers; flag for posterity.

### ⭐ 🧪 Macro recording
Record a series of edits / interactions and replay them. Useful for building demonstrations ("watch as I increase the force to 10 N, then to 20") that play deterministically. Niche, but a teacher-presentation feature.

---

## 14. Engagement — cartoon-style visuals & audio

Small, tasteful effects layered over the physics canvas to make sims feel alive and to reward student attention. The principle is **effects that reinforce the physics** rather than distract from it: impact lines scale with contact impulse (a real physics quantity); squash-and-stretch tracks contact deformation (a real soft-contact phenomenon); collision pitch tracks energy transfer. When the effect *is* the physics rendered cartoonishly, students associate the visual flourish with the underlying quantity instead of seeing it as decoration.

All effects should be:

- **Toggleable** — globally (user preference), per-sim (LLM/teacher), and per-effect (for fine control).
- **Accessibility-safe** — respect `prefers-reduced-motion`; never use audio as the *only* feedback channel; always provide a visual equivalent for audio cues.
- **Layered above physics** — pure render, never affect simulation state. Physics owns truth; effects own affect.
- **Engine-agnostic** — read the same body/contact state any visualization reads.
- **Default conservatively** — out-of-the-box, sims should look classroom-appropriate. A teacher should opt *in* to cartoon mode, not have to opt out.

### ⭐⭐⭐ 🧪 Impact lines / radial bursts on hard collisions
The Wile E. Coyote starburst at the moment of contact. Radial line burst centered on the contact point, with line count and length scaled to the contact impulse magnitude. Reads from the contact-events hook (cross-ref §4 — "contact-impulse readout"). Works because **the visual size is the physics**: a hard collision genuinely produces longer lines.

### ⭐⭐⭐ 🧪 Squash & stretch on collision
Brief shape deformation at the moment of impact — bodies compress along the contact normal, expand perpendicular, then snap back. Duration and magnitude scaled to impulse. Tracks the real soft-contact deformation that rigid bodies don't model. Best done as a non-physical render-layer animation; the underlying collider stays rigid.

### ⭐⭐ 🧪 Speed lines / motion streaks
Streaking lines trailing fast-moving bodies, intensity scaled to speed. Threshold-gated (only kicks in past some `|v|`) so slow demos stay clean. Closely related to the trajectory trails in §5 but stylized — the trails are scientific, the speed lines are affective.

### ⭐⭐ 🧪 Dust puffs / debris on landing
Small particle burst when a body lands or scrapes a surface. Pairs naturally with the friction physics — dust on high-friction surfaces, none on icy patches. Reinforces the friction concept implicitly.

### ⭐⭐ 🧪 Camera shake on big impacts
A subtle viewport shake whose magnitude scales with the largest contact impulse in the frame. Threshold-gated (small impacts don't shake). Respects `prefers-reduced-motion` — falls back to a brief vignette flash. Used sparingly: a screen that shakes on every collision is exhausting.

### ⭐⭐ 🧪 Wobble / vibration on tension
For springs, pendulums under tension, or bodies resting against a wall under load — a barely-visible shake whose amplitude tracks the constraint force. Communicates "this is under load" the way a real spring vibrates near its limit.

### ⭐⭐ 🧪 Procedural collision sounds (Web Audio synthesis)
Short synthesized thud/click on contact, with **pitch tied to body mass** (heavy → low, light → high) and **loudness tied to contact impulse**. Procedural rather than sampled: zero asset weight, every collision is unique, ties exactly to physics state. Default off; obvious volume / mute control. Materials (wood / metal / rubber) selectable via object preset (§1).

### ⭐⭐ 🧪 Spring "boing" on extension/release
A pitched spring sound whose frequency tracks the spring's natural frequency `√(k/m)` and whose amplitude tracks the displacement from rest length. Reading directly from the `JointData.spring` parameters (cross-ref the joints work in §4). Cute *and* pedagogical — students hear the resonance.

### ⭐⭐ 🧪 Whoosh on fast motion
Low-volume noise sweep whose amplitude tracks `|v|` past a threshold and whose pitch shifts with speed. Off by default; useful for projectile sims and "fastest object?" demos.

### ⭐⭐ 🧪 Confetti / sparkle on success events
For the graph-matching mode in §3 and the conservation-check outputs in §10 — a brief sparkle burst when the student's trace falls within tolerance, when conservation laws hold within ε, when an assertion (§13) passes. Carrots, not gold stars; the celebration should be over in <1 s.

### ⭐ 🧪 Trail flash / arrow pulse on parameter change
When the user moves a slider, the arrow / trail / output that depends on it gets a brief glow pulse to confirm "yes, that's what changed." Helps students connect cause to effect in busy sims.

### ⭐ 🧪 Threshold flash on outputs (color, not motion)
A KE readout flashes amber when energy isn't conserved, a momentum readout flashes red when drift exceeds tolerance. Pairs with the conservation-check outputs in §10. Color-only (no motion), so it stays accessibility-safe and unobtrusive.

### ⭐ 🧪 Outline glow on selected/hovered body
Already mentioned in §12 as a UX item; worth flagging here too because the engagement value is real — having one body subtly pulse "I'm selected" while everything else stays still focuses attention.

### ⭐ 🧪 Faces / eyes on bodies (opt-in, sim-level)
PhET sometimes adds eyes to bodies for younger audiences. Almost certainly the wrong default for high-school-and-up physics, but worth supporting as a per-sim opt-in for the K–8 audience. Requires the SVG manifest system — could be a flag on object presets ("baseball-with-eyes").

### ⭐ 🧪 Speech bubbles / inline narration callouts
Author-placed text bubbles attached to a body or a region: "I'm in free fall!", "Net force = 0 here." Pairs with the sequence/chapter mode in §2 — bubbles fade in/out per chapter. Risk of cute-fatigue if overused; a teacher should be able to disable them globally.

### ⭐ 🧪 Easing on programmatic parameter changes
When an event in the timeline (§2) changes a slider value, animate the slider to the new value over ~200ms instead of snapping. The user *sees* the change happen, which is itself information.

### Engineering notes

- **Web Audio API** is the right tool for procedural sound — synthesize one-shots from oscillators + envelopes, no asset pipeline needed. ~50 lines per sound family. Test on Safari (the historical Web-Audio-on-iOS gotchas around user-gesture activation still bite).
- **Effect dispatch** should hang off the same hooks visualization uses: contact events for collision effects, body-state reads for trails / wobble. No new physics-side machinery.
- **Performance budget**: cap concurrent effect instances per type (e.g., max 6 active impact bursts) and degrade gracefully at high collision counts. A particle storm shouldn't tank framerate.
- **Sound mixing**: a single global gain node + per-category submixes (impacts / springs / motion / UI). Mute is a hard mute, not just volume=0.
- **Effect registry**: each effect is a small module that subscribes to a hook (`onContact`, `onSliderChange`, `onAssertPass`) and renders to its own layer. Adding a new cartoon effect means dropping a new module — no core changes.
- **Cross-reference for engagement-but-pedagogical effects**: prefer the §5 vector-arrow / trail / energy-bar visualizations *first*. They're engagement features that are also content. Cartoon effects are dessert; vectors are dinner.

### Caveat: tasteful defaults, opinionated off-switches

A real risk with engagement features is teachers turning the product off entirely because "it's too distracting" or "students play with the effects instead of the physics." Mitigations:

- **Default off** for all audio. Default to the most subtle visual effect set; punchier presets are an opt-in.
- **Per-classroom presets** — "Quiet mode" disables all audio and reduces motion; "Demo mode" turns on the full set.
- **No effect should be the *primary* signal** for any pedagogical event. The graph-match success is communicated by the trace turning green and a "Match!" label appearing — the confetti is a bonus, not the message.
- **Honor reduced-motion preferences** at the OS level — never override.

---

## How to use this list

1. **Pick by unlocked content, not by elegance.** Every item should be evaluated against "which physics units does this enable, and how many?" Sensors + joints + events + graph-match between them probably cover 80% of intro-mechanics curriculum that we can't do today.
2. **Bundle related items into a single refactor doc when picked up.** E.g., "events + sensors + trigger-based actions" is one refactor, not three. The [Notes_on_*_Refactor.md](.) pattern handles this well.
3. **Update [GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md) when an item starts.** The wishlist is intent; the topics doc is status. Items move from wishlist → topics with a 🟡 once a refactor doc exists.

---

## Items considered but cut

For transparency on what didn't make the list and why:

- **3D physics** — out of scope per project direction (intro-mechanics 2D is the target curriculum).
- **Fluid dynamics / SPH** — too far afield; buoyancy can be approximated with sensor-triggered drag.
- **Sound effects on collision** — engagement-positive but doesn't unlock pedagogy; backlog.
- **Networked multiplayer / classroom mode** — orthogonal to physics; UI/server problem.
- **Custom-shader rendering** — probably overkill; SVG trails and arrows hit the same notes.
- **Body destruction (fracturing)** — cool, none of the units we listed need it.
