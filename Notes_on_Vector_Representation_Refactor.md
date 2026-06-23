# Notes on Vector Representation Refactor

Status: **Phase 1 DONE — implemented + verified 2026-06-23** (path-resolver +
held-state + angle-unit family + three-places: schema describe-strings,
`gist_instructions.py` prompt, this note; JSON schema regenerated). Verified
headlessly (cm+rot risk-#4 case) AND visually via the `projectile-launch-polar`
acceptance sim (held-state on both sliders, read-back |v|=√(vx²+vy²) & θ=atan2,
live graphs correct). **Phase 2 (polar initial conditions) NOT yet implemented.**
Phases 3–4 design-only.
Scope: controls, outputs, and graphs. No physics-engine changes.
Goal: any vector quantity (velocity, acceleration, force, gravity) can be authored, controlled via slider, and displayed as **either** Cartesian components (`x`, `y`) **or** polar form (magnitude, angle) — with the same fluency.

---

## Design update (2026-06-22) — angle is its own display-unit family

**Decision.** Angle is a **display-unit family parallel to length**, not a
dimensionless special case. The UI boundary has two SI bases: **meters** (length)
and **radians** (angle). A new global **`environment.angleUnit: 'deg' | 'rad' |
'rot'`** (default `'deg'`) picks the angle display unit, exactly mirroring
`environment.unit` for length ([simulation.ts:209](src/schemas/simulation.ts#L209)).
Canonical internal storage is **radians** — matches `atan2`, the engines, and the
existing `angle` / `angularVelocity` rad fields ([simulation.ts:104-105](src/schemas/simulation.ts#L104-L105))
— including the held-angle UI state.

**Supersedes** the original *Conventions → "Angle unit at the user surface:
degrees … internal storage of any held-angle is degrees too."* Degrees stay the
**default**, but `rad` / `rot` are selectable and internal storage is radians (not
degrees). Rationale: degrees / radians / rotations are the three representations
physics curricula actually use — projectile launch in °, rotational kinematics in
rad, RPM / turns in rev — so hardcoding degrees blocks the rotational-mechanics
units.

**Why it matters beyond convenience — it dissolves a latent unit bug.** The
display boundary in `JsonSimulation.tsx` ([:403](src/components/JsonSimulation.tsx#L403)
read, [:440](src/components/JsonSimulation.tsx#L440) write) gates unit scaling on
`isDimensionalProperty(path)` ([unitConversion.ts:47](src/lib/unitConversion.ts#L47)),
which matches by **prefix** — so `velocity.angle` matches `startsWith('velocity.')`
and an angle would be scaled by the **length** factor `unitToMeters(unit)`. Silent
on meter sims (factor = 1); wrong on every cm/ft/in/km sim (a 45° launch on a `cm`
sim writes 0.45°, i.e. nearly horizontal). The fix is **not** to exclude `.angle`
from scaling — it is to scale it by **its own family**: replace the boolean
`isDimensionalProperty` with `unitScaleFor(path, env)` returning the angle factor
(`ANGLE_TO_RADIANS[env.angleUnit]`) for `.angle`, the length factor for length
paths (including `.magnitude` of a length vector), else `1`. The polar resolver
then returns **raw radians** for `.angle` (pure SI); the existing boundary converts
to the display unit — no special degree math in the resolver.

**Conversions** (radians per display unit; mirrors `UNIT_TO_METERS`):
`deg = π/180`, `rad = 1`, `rot = 2π`.

**Related prep decisions (same session):**
- Held angle / magnitude keyed by **vector** — `${targetObj}.${base}` (e.g.
  `ball.velocity`), **not** per-control — so a paired magnitude+angle slider
  (Phase 3 `polarSlider`) shares one direction state. (Supersedes the note's
  "per-binding held angle" wording below.)
- Default angle range **`(-180°, 180°]`** CCW from +X (= `atan2` native).
- Scope: implement **Phase 1 + Phase 2 together**; Phase 2's polar→cartesian
  normalization must also run at the runtime apply point (before
  `scaleObjectToSI`) because saved DB sims bypass `.parse()`.

**Three-places status (NOT landed):** design decision recorded in this note only.
It lands when implemented — `environment.angleUnit` + polar describe-strings in
`src/schemas/simulation.ts`, the matching prompt prose in
`modal_functions/gist_instructions.py`, and this note move together.

**Out of scope (flagged):** RPM (angle-per-*minute* — compounds the angle family
with an unmodeled time unit); per-binding angle unit (global only, symmetric with
length; revisit only if a sim must mix ° and rad); the `rev` / `rot` / `turn`
symbol spelling.

---

## Background — what we have today, what's missing

Sliders, outputs, and graphs all bind to vector quantities via a string `property` path:

- [SliderConfig.property](src/schemas/simulation.ts) — `"velocity.x" | "velocity.y" | "position.x" | "position.y"`
- [OutputConfig.property](src/schemas/simulation.ts) — same plus `"acceleration.x" | "acceleration.y"`
- [GraphConfig.property](src/schemas/simulation.ts) — same set

Every binding picks a single scalar leaf of a vector. There's no path that resolves to "speed" (`|v|`) or "direction" (`arg(v)`); no slider that controls launch angle while preserving launch speed; no graph that plots `|a|` over time.

Pedagogically this is the gap: physics curricula teach vectors in **two complementary representations**, and which one is "natural" depends on the unit:

| Unit                       | Natural form     | Example                                  |
|----------------------------|------------------|------------------------------------------|
| Projectile motion          | Polar (input)    | "launch at 30 m/s, 45° above horizontal" |
| Free fall                  | Component (1D)   | `vy(t)`                                  |
| Inclined-plane forces      | Polar (output)   | "decompose `mg` parallel/perpendicular"  |
| 2D kinematics              | Both             | independent `x` and `y` *and* trajectory angle |
| Conservation of momentum   | Both             | 2D oblique collisions need angles        |
| Newton's 2nd law           | Component        | `Fx = m·ax`                              |

A student who can only ever see `vx` and `vy` separately is missing half the curriculum. Same for the LLM — it can author "ball at (3, 4) m/s" but not "ball at 5 m/s, 53°".

**Crucially: this is a *representation* refactor, not a *storage* refactor.** The body's underlying state stays `velocity: { x, y }` (matches the engines' Vec2 APIs and the existing schema). What changes is the binding layer between sliders/displays and that state.

---

## Recommended approach: polar as a derived projection

Keep components canonical. Add `.magnitude` and `.angle` as **derived** path suffixes that the binding layer understands and round-trips.

For any vector field at path `P` (e.g. `velocity`, `appliedForce`, `gravity`):

| Path             | Read                                     | Write                                                                    |
|------------------|------------------------------------------|--------------------------------------------------------------------------|
| `P.x`            | `body[P].x`                              | `body[P] = { x: v, y: body[P].y }`                                       |
| `P.y`            | `body[P].y`                              | `body[P] = { x: body[P].x, y: v }`                                       |
| `P.magnitude`    | `Math.hypot(body[P].x, body[P].y)`       | preserve angle: `body[P] = { x: v·cos(θ), y: v·sin(θ) }` where θ is held |
| `P.angle`        | `Math.atan2(body[P].y, body[P].x)`       | preserve magnitude: `body[P] = { x: |v|·cos(θ), y: |v|·sin(θ) }`         |

This makes polar a first-class binding without changing the underlying physics state. Any existing component-based binding keeps working unchanged.

### "Held angle" — the zero-vector edge case

`atan2(0, 0)` is undefined. When a slider controls `velocity.magnitude` and the user dials it down to zero, we lose the direction. Fix: the binding layer keeps a per-binding **held angle** that's set whenever `|v| > ε`, and used when the user dials magnitude back up. UI-state, not physics-state — lives next to the control's `value`, not on the body.

Same idea applies to `angle` writes when `|v| ≈ 0`: store a **held magnitude**, default `(min + max) / 2` of the slider, so dragging the angle slider on a stationary body smoothly produces motion in the chosen direction.

---

## Schema additions

### Extend the `property` path enums

```ts
// SliderConfigSchema, OutputConfigSchema, GraphConfigSchema
property: z.string().describe(
  'Property path. Cartesian: "velocity.x", "velocity.y", "acceleration.x", ' +
  '"acceleration.y", "position.x", "position.y". Polar: "velocity.magnitude", ' +
  '"velocity.angle", "acceleration.magnitude", "acceleration.angle". ' +
  'Magnitude is in the same units as components; angle is in the environment ' +
  'angleUnit (default degrees), measured counter-clockwise from +X.'
)
```

Add the same `.magnitude` / `.angle` projections for `appliedForce` (once the applied-forces refactor lands), `gravity` (environment-level), and any future vector field.

### Environment-level angle unit (added 2026-06-22 — see *Design update* at top)

```ts
// EnvironmentConfigSchema, alongside `unit` (simulation.ts:209)
angleUnit: z.enum(['deg', 'rad', 'rot']).optional().default('deg').describe(
  'Display unit for angle properties such as "velocity.angle". "deg" (default), ' +
  '"rad", or "rot" (rotations / revolutions). Physics runs in radians internally; ' +
  'this only changes how angles are displayed and authored.'
)
```

In `src/lib/unitConversion.ts`, add `ANGLE_TO_RADIANS = { deg: Math.PI/180, rad: 1,
rot: 2*Math.PI }` (mirrors `UNIT_TO_METERS`) and replace the boolean
`isDimensionalProperty(path)` with `unitScaleFor(path, env): number` — angle factor
for `.angle`, length factor for length paths (incl. `.magnitude` of a length
vector), else `1`. Read = `raw / unitScaleFor(...)`, write = `value *
unitScaleFor(...)`, so both families share one boundary.

### Optional: a paired polar control

For projectile-launch UX, two separate sliders (one for magnitude, one for angle) are good but slightly clunky. A new `polarSlider` control variant pairs them:

```jsonc
{
  "type": "polarSlider",
  "property": "velocity",      // path to the vector itself, not a leaf
  "magnitude": { "label": "Speed",         "min": 0,    "max": 50, "step": 0.5, "unit": "m/s" },
  "angle":     { "label": "Launch angle",  "min": -90,  "max": 90, "step": 1,   "unit": "°" }
}
```

Renders as two sliders + a small read-only arrow preview showing the current direction. Internally just two scalar bindings to `velocity.magnitude` and `velocity.angle` driving the same held-angle/held-magnitude state.

Phase 2 nice-to-have, not Phase 1 critical path.

### Polar input form for object initial conditions

Allow the initial value of a vector to be authored either way:

```jsonc
"velocity": { "x": 10, "y": 5 }
// or equivalently
"velocity": { "magnitude": 11.18, "angle": 26.57 }
```

Schema accepts a discriminated union; parser normalizes to components at load time. LLM-friendly because some sims read more naturally one way than the other.

---

## Acceleration: derived, but newly polar-able

Acceleration is already in the output/graph schema as `acceleration.x` and `acceleration.y`. Presumably it's computed from successive velocity samples (numerical derivative) — wherever that lives, the same series can produce `acceleration.magnitude` and `acceleration.angle` with no new compute. Same for any future computed-vector quantities (net force, drag force).

This is one of the wins of doing this as a representation refactor: the math is "compute the polar projection of whatever vector this path resolves to," wherever the path is wired.

---

## Slider variant changes

Option A — **extend the existing Slider** (recommended):

The Slider variant doesn't need to change at all. It already takes `value` and `onChange`. The binding layer above it (`ControlRenderer` or wherever `setNestedValue` lives) needs:

1. A path-resolver that recognizes `.magnitude` / `.angle` suffixes and runs the table above.
2. A small piece of per-control state for held-angle / held-magnitude.

That's it. The slider itself, the schema for `min` / `max` / `step` / `defaultValue`, and the rendering all stay unchanged — they just bind to a polar projection instead of a Cartesian one when the path says so.

Option B — **new `polarSlider` variant** (additive, not blocking):

For the paired magnitude+angle UX described above. Builds on top of Option A — the polarSlider is just two scalar bindings rendered together. Worth doing in a later phase once Option A is proven.

---

## Output and graph rendering

Both already render scalar series. With Option A's path-resolver in place:

- **Numeric outputs**: `"velocity.magnitude"` reads and displays a number with units; `"velocity.angle"` reads and displays a number with degrees. No display changes.
- **Time-series graphs**: same — Recharts plots whatever scalar series the resolver yields. A graph with `["velocity.x", "velocity.y", "velocity.magnitude"]` overlays all three, which is itself a useful pedagogical view.

The one display improvement worth bundling: a small **vector arrow visual** overlay that takes a vector path and renders the live arrow on the canvas. Overlaps directly with the force-arrow visualization in the [applied-forces refactor](Notes_on_Applied_Forces_Refactor.md) — same renderable, different sources. Coordinate: build one `VectorArrow` renderable that takes any vector path and reuse it everywhere.

---

## Conventions

- **Angle unit: degrees by default, `rad` / `rot` selectable.** (SUPERSEDED 2026-06-22 — see *Design update — angle is its own display-unit family* at top.) A global `environment.angleUnit` picks the display unit; canonical internal storage, **including held-angle**, is **radians**. Original wording was "degrees only; held-angle stored in degrees" — revised so rotational-mechanics sims can use radians / rotations. (The engines' angle conventions are unaffected — we compute polar projections of velocity/force vectors, not body angle.)
- **Angle direction: counter-clockwise from +X.** Matches the project's existing convention ([physics/types.ts:7](src/physics/types.ts#L7) — "counter-clockwise from +X").
- **Angle range: `(-180°, 180°]`** for outputs (matches `atan2`). Slider `min`/`max` is per-binding (e.g., `-90` to `90` for projectile launch).
- **Magnitude range: `≥ 0`.** The slider min for a `.magnitude` binding should default to 0 if not specified.
- **Wrapping**: don't wrap the slider value — use the user-specified range as-is. Wrapping is only relevant for outputs/graphs displaying angle over time, where it's natural to plot the unwrapped value (so a spinning vector traces a monotone line) **or** the wrapped value (so it stays in `(-180°, 180°]`). Lean: unwrapped, with a per-graph option to wrap.

---

## Phased rollout

### Phase 1 — path-resolver extension (the unlock)

- Path-resolver layer recognizes `.magnitude` and `.angle` for any vector path, with the read/write semantics in the table above.
- Held-angle and held-magnitude state lives next to each control instance.
- Slider, Output, and Graph variants are unchanged.
- Schema descriptions updated to advertise the new path suffixes.
- LLM prompt updated with one or two examples ("speed slider for projectile sim", "angle output for vector readout").
- **Acceptance test**: a JSON sim with two sliders bound to `velocity.magnitude` and `velocity.angle` produces correct projectile launches; a graph plotting `velocity.magnitude` over time matches `Math.hypot(vx, vy)` from a separate component-based readout.

### Phase 2 — polar input form for initial conditions

- Schema accepts `velocity: { magnitude, angle }` as an alternative to `{ x, y }`. Parser normalizes at load time.
- Same for `gravity`, `appliedForce`, etc.
- LLM gets a second authoring style for vectors; LLM prompt examples updated.

### Phase 3 — paired `polarSlider` control variant + `VectorArrow` renderable

- New `polarSlider` variant: two stacked sliders with a live arrow preview.
- `VectorArrow` renderable: takes any vector path, draws the live arrow on the canvas.
- Coordinate with the [applied-forces refactor](Notes_on_Applied_Forces_Refactor.md) — same renderable, used for force arrows there.

### Phase 4 (optional) — angle-wrap toggle for graphs

Per-graph option for whether angle series wraps to `(-180°, 180°]` or unwraps continuously. Only worth doing if a sim makes the default look wrong.

---

## Coordination with the other refactors

- **Air resistance**: no overlap — drag is set via damping, not via a vector field; magnitude/angle of drag is derived from velocity if anyone wants to display it.
- **Applied forces**: tight coupling. Once `appliedForce` lands as a vector field on objects, polar projections of it (`appliedForce.magnitude`, `appliedForce.angle`) come for free from this refactor's path-resolver. A "set force magnitude and angle" slider is one of the most pedagogically valuable controls in PhET-style sims and is unlocked by **(this refactor) + (applied forces) together**. Worth landing applied-forces Phase 1 first (so the field exists) and then this refactor's Phase 1 immediately on top.
- **Vector arrow renderable**: shared between this refactor's Phase 3 and the applied-forces refactor's Phase 2. Build it once.

---

## Adjacent fix: replay-loop frame skip (landed 2026-05-15)

Surfaced during vector-arrows Phase 1c-rev. Noted here because vector quantities are the visuals that suffer most when this bites; any future polar-projection arrow built by this refactor would suffer the same way.

**Symptom.** Intermittent missing F_net flip arrows on collision frames during replay, even though the data is in the recorded Frame and visible in the graphs. Flaky — depends on browser state (tab focus, GC timing, devtools open).

**Cause.** [BaseSimulation.tsx:207-226](src/components/BaseSimulation.tsx#L207-L226) used the same `while (accumulator >= FIXED_TIME_STEP)` accumulator pattern for live and replay. Correct for live (physics integration must keep pace with wall-clock or the sim slows down). Wrong for replay: when a single rAF tick delivers a delta > 16.67 ms, the loop runs the replay branch multiple times in one tick. Each call to `handleReplayFrame(idx)` overwrites `body.userData.derivedAcceleration` with that frame's stored value. Only the last iteration's userData write survives until [RenderLayer](src/components/simulation_components/renderables/RenderLayer.tsx) paints. One-frame-wide events (the collision F_net spike, brief direction flips) get restored to userData and clobbered ~0 ms later, never reaching the canvas. Graphs are unaffected — `setGraphData` *appends* per call, so all catch-up frames' data points land in the array regardless of paint timing.

**Fix.** In the replay branch of the rAF loop, `break` after one iteration. Playback drifts slightly behind wall-clock on hiccups (a far better failure mode than dropped visual frames). Live mode keeps the `while`.

**Why it matters for vector representation specifically.** When `velocity.angle` or `appliedForce.magnitude` projections drive polar sliders, the bound value is read at paint time the same way `derivedAcceleration` is. A polar-driven arrow showing a brief direction snap — manual angle-slider step, single-frame impulse, any future spike-prone kind — would have been silently dropped by the same mechanism. The fix protects every one-frame-wide visualization, including ones this refactor hasn't built yet.

**Complementary polish (not landed).** A 1/60 s arrow flash is borderline-perceivable for human viewers even when it does paint. A visual-layer decay on `force-net` (and any other spike-prone kind) — hold peak magnitude for N ms then fade linearly — would make collision impulses comfortably readable. Independent of replay timing; layers cleanly on top of the fix. Worth doing once the Phase 3 force kinds land.

---

## Decisions deferred

1. **Should existing component sliders be left alone, or migrated to polar where it's pedagogically better?** Lean: leave authored sims alone (no breaking change), but update the LLM prompt and example sims to prefer polar for projectile / force-vector demos.
2. **3D in the future?** All this works for 2D vectors. If 3D ever happens (unlikely per current direction), polar becomes spherical — `.magnitude`, `.azimuth`, `.elevation`. Don't overdesign for it now; the path-resolver is easy to extend.
3. **Graph series labels.** When you plot `velocity.magnitude`, what's the auto-label? Lean: "|velocity|" with units, or "speed" if the LLM picks a friendlier label per binding.
4. **Snap-to-cardinal in angle sliders.** Optional UX nicety — snap to 0°, 90°, 180°, 270° when within a few degrees. Cute but not necessary; flag for later.
5. **Angle conventions for forces vs velocities.** Both use the same +X-CCW convention, so this works uniformly. Worth documenting in the schema description so the LLM doesn't invent its own.

---

## Open questions for Duncan

1. **Two separate sliders vs paired `polarSlider` for projectile UX.** Two separate sliders is a Phase 1 freebie (no new control variant). The paired control is nicer but a Phase 3 lift. Worth shipping Phase 1 alone first, or do you want the paired UX bundled?
2. **Should authored initial conditions ever be polar?** Phase 2 adds it. Useful for LLM-authored projectile sims; some risk that the LLM mixes the two forms inconsistently within one config. Lean: ship it but require pure-component **or** pure-polar within a single vector authored value (no mixing `x` with `angle`).
3. **Default angle slider range.** `(-180°, 180°]` is mathematically natural, but `[0°, 360°)` matches compass conventions and is sometimes more intuitive for students. Lean: match what the authored sim says, default to `(-180°, 180°]` if unspecified.
4. **Should `.magnitude` writes clamp at zero?** Velocity magnitude can't be negative, but a slider with `min: -10, max: 10` mistakenly bound to `.magnitude` would silently clamp. Lean: warn at parse time if `min < 0` for a `.magnitude` binding.

---

## Out of scope

- Engine-level changes (none needed).
- 3D vectors.
- Vector visualization beyond the simple `VectorArrow` renderable shared with applied-forces (no parallelogram-rule "add these two arrows" widget — that's a separate teaching aid).
- Polar coordinate system for *positions* (i.e., orbital `r`, `θ` controls). Same machinery would work, but no current sim needs it.

---

## Findings

### 2026-06-22 — Phase 1 implemented (path-resolver + angle-unit family)

Phase 1 is built and unit-verified; **not yet visually acceptance-tested or
committed**. Phase 2 (polar initial conditions) is untouched.

**Angle-unit family (the foundation).** [unitConversion.ts](src/lib/unitConversion.ts):
added `AngleUnit` type, `ANGLE_TO_RADIANS` (`deg: π/180, rad: 1, rot: 2π`),
`angleUnitToRadians`, and **replaced the boolean `isDimensionalProperty` with
`unitScaleFor(path, lengthScale, angleScale)`** — the `.angle`-first check returns
the angle factor (not the length prefix it shares), which is what fixes the
silent-mis-scale bug. Verified headlessly on the cm+rot case:
`unitScaleFor('velocity.angle', 0.01, 2π) → 2π`, not `0.01`.

**Resolver + writer.** [JsonSimulation.tsx](src/components/JsonSimulation.tsx):
- `getNestedValue` resolves `<base>.magnitude` (`hypot`) and `<base>.angle`
  (`atan2`, **raw radians** — SI) for any vector base; feeds outputs and graphs
  through one site.
- `writeVectorPolar` handles slider writes, preserving the orthogonal component
  via per-vector held state in `heldVectorStateRef`, **keyed by
  `${targetObj}.${base}`** (vector-keyed, so a paired magnitude+angle slider
  shares one direction — Phase 3 `polarSlider` composes for free).
- Read/write boundary (`readDisplayValue`, `handleControlChange`) now uses
  `unitScaleFor` with a new `angleScale = angleUnitToRadians(environment.angleUnit)`
  memo. Angle math stays in the resolver; conversion stays at the boundary.

**Three-places landing — DONE (first fully-landed decision this session):**
1. Schema — `AngleUnitSchema`, `environment.angleUnit` (default `deg`,
   [simulation.ts:213](src/schemas/simulation.ts#L213)), polar paths in all three
   `property` describe-strings; **`simulation_schema.json` regenerated**.
2. Prompt — [gist_instructions.py](modal_functions/gist_instructions.py) controls
   (valid polar paths + a projectile Speed/Launch-angle recipe), outputs (replaced
   the now-obsolete "emit two readouts for speed" line with `velocity.magnitude`),
   and graphs prose.
3. Doc — this note (Design update + this Findings entry; Status updated).

**Open questions / deferred decisions this resolved:**
- *Open Q #3 (default angle range)* → `(-180°, 180°]`, CCW from +X — falls out of
  `atan2` natively; no extra wrapping.
- *Open Q #1 (two sliders vs paired control)* → Phase 1 ships **two separate
  sliders**; the paired `polarSlider` stays Phase 3.
- *Deferred #4 (.magnitude clamp at zero)* → magnitude writes clamp negative to 0
  (`Math.max(0, value)` in `writeVectorPolar`). The "warn at parse time if a
  `.magnitude` slider has `min < 0`" half is **not** done (no parse-time validator
  yet) — still open.

**Verification.** `tsc` clean on all changed files (one pre-existing unrelated
error remains at JsonSimulation `dataSources`); `gist_instructions.py` parses; a
throwaway tsx harness proved `unitScaleFor` on cm+rot and the polar read/write
round-trips, then was deleted (re-creatable from this entry). **Visual acceptance
PASSED 2026-06-23** via `src/simulations/projectileLaunchPolar.json` (route
`/simulation/projectile-launch-polar`, m+deg so `angleScale=π/180≠1` is exercised
end-to-end): dragging Launch Speed preserved direction and Launch Angle preserved
magnitude (held-state); the four read-back outputs satisfied |v|=√(vx²+vy²) and
θ=atan2(vy,vx); the speed-vs-components and direction graphs tracked correctly
through flight. The acceptance sim is committed as a worked example.

**Note — JsonSimulation has its own local `SimulationConfig` interface** (not the
Zod-inferred type), so `environment.angleUnit` had to be added there too; and the
two imported example JSONs (`tossBall.json`, `twoBoxes.json`) needed
`"angleUnit": "deg"` because the `.default('deg')` makes it required in the
inferred output type used by their `as SimulationConfig` casts.
