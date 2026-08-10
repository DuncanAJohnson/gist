# Local Sim Workflow — hand-authoring sims in VSCode

How to create, edit, and run a physics sim **locally** by hand-editing JSON in
VSCode, bypassing both the LLM pipeline and the in-app JSON editor. This is the
loop used for the Phase 0 concave-collider work (the cup tests) and is the right
tool for prototyping Tier 1 "physics-curriculum-priority" sims and iterating on
hand-authored colliders.

Use this when you want fast, version-controlled iteration: edit a file, reload
the browser, watch the sim. No backend, no database, no LLM.

---

## TL;DR

1. Write a sim as a `.json` file in [src/simulations/](src/simulations/).
2. Add a one-line wrapper `.tsx` that renders it with `localJsonEdit`.
3. Register a route for it in [src/App.tsx](src/App.tsx).
4. `npm run dev`, open the route, iterate. Append `?simdebug=1` for per-body logs.

For new collider shapes, hand-edit
[public/renderables/manifest.json](public/renderables/manifest.json) and drop the
matching SVG in [public/renderables/](public/renderables/) — exactly as Phase 0
did for the cup.

---

## 0. Run the app

```bash
npm run dev
```

Vite serves on **http://localhost:5173** by default. It hot-reloads on save —
editing a sim `.json` or the manifest and saving will refresh the page. (A
manifest change sometimes needs a hard reload, since it's fetched and cached at
runtime — see Gotchas.)

Other scripts in [package.json](package.json):
- `npm run build` / `npm run preview` — production bundle / preview it.
- `npm run lint` — ESLint.
- `npm run generate:schema` — regenerates `modal_functions/simulation_schema.json`
  from the Zod schema (only needed when you change the schema for the LLM
  backend, **not** for local authoring).

---

## 1. Author the sim JSON

Create a file under [src/simulations/](src/simulations/), e.g.
`myCoolSim.json`. It must match the **simulation schema** — the contract lives in
[src/schemas/simulation.ts](src/schemas/simulation.ts) (`SimulationConfig`). The
schema is the source of truth; when in doubt, read it.

### Minimal skeleton

```json
{
  "title": "My Sim",
  "description": "What this sim teaches.",
  "environment": {
    "walls": ["left", "right", "bottom"],
    "gravity": 9.8,
    "unit": "m",
    "pixelsPerUnit": 200,
    "physicsEngine": "rapier"
  },
  "objects": [
    {
      "id": "ball",
      "x": 2.0,
      "y": 1.5,
      "width": 0.25,
      "height": 0.25,
      "svg": "baseball"
    }
  ]
}
```

### Top-level shape

| Key | Required | Notes |
|-----|----------|-------|
| `title` | ✅ | string |
| `description` | ✅ | string |
| `environment` | ✅ | object, see below |
| `objects` | optional (default `[]`) | the bodies |
| `controls` | optional | sliders/buttons that mutate objects |
| `outputs` | optional | live numeric readouts |
| `graphs` | optional | time-series plots |

`environment`:
- `walls` (✅) — array of `"left" | "right" | "bottom" | "top"`.
- `gravity` — default `9.8` (m/s²).
- `unit` — `"m" | "cm" | "km" | "ft" | "in"`, default `"m"`.
- `pixelsPerUnit` — default `10`. Sets the scene scale. The cup tests use `200`
  for a tight ~4 m × 3 m window; bump it up for small scenes so objects are
  visible.
- `physicsEngine` — `"rapier"` (default, validated) or `"planck"`. **Pin Rapier**
  for anything where impact-induced tip/tumble or collision energy matters — see
  the engine-suitability notes in
  [GIST_Physics_System_Topics.md](GIST_Physics_System_Topics.md).
- `airResistance` — `{ enabled, airDensity }`, optional.

### Object fields

Required per object: `id`, `x`, `y`, `width`, `height`, `svg` (the renderable
name, matched against the manifest).

Common optional fields (with engine defaults):
- `velocity` — `{ x, y }`, default `{0,0}`.
- `acceleration` — `{ x, y }`, default `{0,0}`. **Additive on top of gravity**,
  not an override.
- `mass` — default `1`.
- `friction` — default `0.1`.
- `restitution` — default `0.8`.
- `isStatic` — default `false`.
- `showVectors` — array of arrow kinds to draw, e.g. `["velocity"]`,
  `["netForce"]`. Source of truth for kinds/colors is `vectorTheme.ts`.

A fuller real example with controls/outputs/graphs:
[src/simulations/ballIntoCupDrop.json](src/simulations/ballIntoCupDrop.json).

---

## 2. Wrap it in a component

Local sims render through the `JsonSimulation` component with the `localJsonEdit`
prop. Create `src/simulations/MyCoolSimulation.tsx`:

```tsx
import JsonSimulation from '../components/JsonSimulation';
import myCoolConfig from './myCoolSim.json';

function MyCoolSimulation() {
  return <JsonSimulation config={myCoolConfig} localJsonEdit />;
}

export default MyCoolSimulation;
```

That's the entire pattern — see
[src/simulations/BallIntoCupDropSimulation.tsx](src/simulations/BallIntoCupDropSimulation.tsx).

**What `localJsonEdit` does:** when `true` *and* there's no `simulationId`, it
surfaces a **"Tweak Simulation JSON"** button in the advanced debug panel. Edits
apply to the live config locally and re-initialize the sim in place — no backend
write. It's the in-browser counterpart to editing the file in VSCode; either way
works. (Note: hitting *Save* in that modal persists a new DB sim and navigates
away — for pure local iteration, edit the file in VSCode instead.)

---

## 3. Register a route

Add the import and a `<Route>` in [src/App.tsx](src/App.tsx), following the
existing sims (around [src/App.tsx:40-44](src/App.tsx#L40-L44)):

```tsx
import MyCoolSimulation from './simulations/MyCoolSimulation'
// ...
<Route path="/simulation/my-cool-sim" element={<MyCoolSimulation />} />
```

Now visit **http://localhost:5173/simulation/my-cool-sim**.

There is no registry or list beyond this route — the route *is* the registration.

---

## 4. Debugging — `?simdebug=1`

Append `?simdebug=1` to any sim URL:

```
http://localhost:5173/simulation/my-cool-sim?simdebug=1
```

This is read in [src/components/BaseSimulation.tsx](src/components/BaseSimulation.tsx)
and turns on console logging:
- a one-time dump of the bodies present in the world after physics init (handy
  for confirming a compound collider built the parts you expect), and
- throttled per-step snapshots (~every 15 live steps) of each body's
  `{ id, x, y, vx, vy, angleDeg, angVel }`.

Format: `[sim] <label> t=<time> bodies=<count>` followed by one line per body.

> **Note on precompute:** play precomputes the whole run at a high substep rate
> (~480 Hz) and replays it. `simdebug` logs the *live* stepping, which is also why
> tunneling has been a non-issue even with thin walls — the fine substep doubles
> as a de-facto CCD.

---

## 5. Hand-authoring colliders (the Phase 0 loop)

The collider for an `svg` comes from
[public/renderables/manifest.json](public/renderables/manifest.json), loaded and
cached by [src/lib/renderableManifest.ts](src/lib/renderableManifest.ts)
(`loadManifest` → `getManifestItem`). The SVG art lives alongside it in
[public/renderables/](public/renderables/) as `<name>.svg`.

To add or tweak a shape by hand (what Phase 0 did for the cup):

1. **Add the SVG** at `public/renderables/<name>.svg`. Art is authored in a
   **64×64 viewBox**; the collider vertices are in that same 0–64 space and get
   scaled to the object's `width × height` at runtime.
2. **Add a manifest entry** under `items`:
   ```json
   {
     "name": "cup",
     "display_name": "cup",
     "status": "approved",
     "version": 1,
     "physical_properties": {
       "collider": {
         "type": "convex",
         "vertices": [[8,16],[8,56],[56,56],[56,16],[48,16],[48,48],[16,48],[16,16]]
       }
     }
   }
   ```
   This is the **real cup entry** — a concave U traced CCW.

### Collider gotchas (important)

- **`type: "convex"` is a misnomer — it accepts concave outlines.** A `"convex"`
  collider whose vertices are actually concave is decomposed at load by
  `decomposePolygonShape` (poly-decomp) into a **compound** of convex parts. The
  cup's 8-point U becomes 3 convex quads (two walls + floor). You do **not**
  pre-decompose by hand — author the true silhouette and let the loader split it.
  Never use trimesh/polyline on dynamic bodies.
- **Wind the outline CCW** and keep it a simple (non-self-intersecting) polygon.
- **Wall thickness must survive down-scaling.** Walls should be a meaningful
  fraction of the 64×64 viewBox (the cup walls are 8 units ≈ 12.5%) so they don't
  collapse at small scene scales. This is the Phase 1 "wall-thickness convention"
  (tie to diorama scoping / `/docs/design-philosophy`).
- **Planck caps polygon parts at ~8 vertices and needs CCW per part** — the
  decomposition satisfies both, but it's why complex silhouettes can need more
  parts. Cross-engine response is **not** pixel-identical; see the Planck-parity
  findings in
  [Notes_on_Concave_Colliders_Refactor.md](Notes_on_Concave_Colliders_Refactor.md).
- The current SVG-generation tool ships only `circle`/`box`/`convex-hull` and
  **fills in** concave mouths — which is exactly why concave colliders are
  hand-authored here for now. (Generator audit + downstream-decompose plan are in
  the concave-colliders refactor note.)

---

### `y = height/2` does NOT rest an object on the floor (measured 2026-08-09)

A manifest collider is authored in its SVG's viewBox and is usually **inset**
from it, so the physics box is smaller than the authored bounding box. Worked
example — `ice_block`: collider `57.37` tall in a `58.1818` viewBox, i.e.
**98.6%**. Author it at `height: 0.5, y: 0.25` and the collider's bottom edge
sits **3.75 mm above** the floor, not on it.

What you see when this bites:
- **Rapier** — the object free-falls the gap before contact. For the example
  above that is 27.7 ms (measured `vy` at 17 ms = −0.163 m/s, exactly `g·t`),
  so the first ~4 frames carry a landing transient: velocity spikes, and any
  net-force arrow swings either side of horizontal before settling.
- **Planck** — usually *nothing*, because its polygons carry a 10 mm skin
  (`polygonRadius = 2 × linearSlop`) that already spans a gap this small. Same
  reason it rests ~11 mm higher than Rapier (see
  `GIST_Physics_System_Topics.md` → Cross-engine inconsistencies).

The gap scales with authored size, so it is worst on large objects. Fixes:

1. **Compute the seat**: `y = (height × colliderHeight / viewBoxHeight) / 2`,
   adjusted for any collider centre offset. For the example, `y: 0.2462`.
2. **Let it drop** and ignore the first few frames — fine when the transient
   is not the lesson. `/simulation/applied-force-1d` keeps its drop on purpose
   as a specimen of exactly this.
3. **Check the real collider** with `?colliders=1`, which draws engine-truth
   geometry rather than the sprite's bounding box.

Don't calibrate y-positions to sub-centimetre precision on one engine and
expect the other to agree — resting height is engine-dependent at that scale.

## Quick reference — files you'll touch

| What | Where |
|------|-------|
| Sim JSON | [src/simulations/](src/simulations/)`*.json` |
| Wrapper component | [src/simulations/](src/simulations/)`*Simulation.tsx` |
| Route registration | [src/App.tsx](src/App.tsx) |
| Schema (the contract) | [src/schemas/simulation.ts](src/schemas/simulation.ts) |
| Render harness | [src/components/JsonSimulation.tsx](src/components/JsonSimulation.tsx) |
| Debug logging | [src/components/BaseSimulation.tsx](src/components/BaseSimulation.tsx) |
| Collider manifest | [public/renderables/manifest.json](public/renderables/manifest.json) |
| Manifest loader | [src/lib/renderableManifest.ts](src/lib/renderableManifest.ts) |
| SVG art | [public/renderables/](public/renderables/) |
| Worked examples | `ballIntoCupDrop.json`, `ballIntoCupArc.json` + their wrappers |

---

## Gotchas

- **The manifest is fetched and cached at runtime.** After editing
  `manifest.json`, a plain HMR refresh may serve the cached copy — do a hard
  reload (Cmd-Shift-R) to be sure the new collider is picked up.
- **`svg` name must match a manifest `name` exactly.** A typo silently falls back
  / renders without the intended collider.
- **`pixelsPerUnit` controls visibility, not physics.** Engines stay pristine SI;
  scaling for legibility happens above the adapter. If a small object is hard to
  see, raise `pixelsPerUnit` (and shrink the scene), don't fudge sizes in meters.
- **Editing JSON in the in-app "Tweak" modal and *saving* writes a DB sim** and
  navigates away. For file-based local iteration, edit in VSCode and reload.
