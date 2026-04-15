# Physics Engine Adapter Refactor — Matter.js + Rapier

## Context

Gist currently hard-codes Matter.js throughout the simulation pipeline. Config JSON values are already in SI-like real-world units (e.g. `velocity: {x: -6, y: -8}` m/s, `radius: 1` m), but at load time `JsonSimulation` converts everything to pixel-space Y-down to feed Matter, and all downstream code (renderables, controls, outputs, graphs) works in mixed pixel/real units with constant back-and-forth conversions.

The goal is to introduce a `PhysicsAdapter` abstraction so engines are swappable, switch the internal data representation to SI units with Y-up (matching Rapier's native conventions), and land Rapier as the new default while keeping Matter.js available as an opt-in fallback. Existing JSON configs must continue to work unchanged — because they're already essentially SI, backwards compat means "stop pre-converting values at load time." `pixelsPerUnit` becomes a render-only scale, decoupled from physics.

## Target architecture

**SI everywhere above the adapter.** `PhysicsBody.position.x` reads live meters (Y-up). Velocities are m/s. Angles are radians (CCW from +X). Gravity is m/s².

**Pixels only in the renderer.** One `WorldToCanvas` helper, built per render frame, lives on the draw context and is the sole place world-to-canvas conversion happens.

**No engine imports outside adapter directories.** `import 'matter-js'` only inside `src/physics/matter/*`. `@dimforge/rapier2d-compat` only inside `src/physics/rapier/*`.

## The adapter interface

New directory: `src/physics/`

### `src/physics/types.ts`

```ts
type Vec2 = { x: number; y: number };

type ShapeDescriptor =
  | { type: 'circle'; radius: number }
  | { type: 'rectangle'; width: number; height: number }
  | { type: 'polygon'; vertices: Vec2[] }           // local space, convex
  | { type: 'compound'; parts: ShapeDescriptor[] }; // for concave (Vertex) bodies

interface BodyDef {
  id: string;
  position: Vec2;
  angle?: number;
  velocity?: Vec2;
  angularVelocity?: number;
  mass?: number;
  restitution?: number;
  friction?: number;
  frictionStatic?: number;
  frictionAir?: number;  // maps to linearDamping in Rapier
  isStatic?: boolean;
  shape: ShapeDescriptor;
}

interface WallDef {
  side: 'left' | 'right' | 'top' | 'bottom';
  bounds: { minX: number; maxX: number; minY: number; maxY: number }; // meters
  thickness: number; // meters
}

interface WorldSnapshot {
  t: number;
  bodies: Array<{ id: string; position: Vec2; velocity: Vec2; angle: number; angularVelocity: number }>;
}

interface PhysicsBody {
  readonly id: string;
  readonly shape: ShapeDescriptor;
  position: Vec2;          // Vec2Accessor — live getter/setter
  velocity: Vec2;          // Vec2Accessor — live getter/setter
  angle: number;
  angularVelocity: number;
  mass: number;
  isStatic: boolean;
  userData: Record<string, unknown>;
}

interface PhysicsAdapter {
  init(): Promise<void>;
  setGravity(g: Vec2): void;
  createBody(def: BodyDef): PhysicsBody;
  removeBody(body: PhysicsBody): void;
  createWalls(walls: WallDef[]): PhysicsBody[];
  step(dtSeconds: number): void;
  getAllBodies(): PhysicsBody[];
  snapshot(buf?: WorldSnapshot): WorldSnapshot; // optional pre-alloc buffer to avoid GC in precompute
  restore(snap: WorldSnapshot): void;
  destroy(): void;
}
```

**Vec2Accessor pattern.** `body.position` returns a small accessor whose `.x`/`.y` are getter/setters routing back to the owning body. This keeps `body.position.x`, `body.velocity.y = 3`, and `setNestedValue(body, 'velocity.x', v)` working unchanged. Reassignment `body.position = {x, y}` is handled by the body's own setter. Same pattern for velocity.

### `src/physics/matter/MatterAdapter.ts`

Wraps `Matter.Engine`. Uses a fixed internal `MATTER_PX_PER_M = 100` constant (independent of the config's `pixelsPerUnit`, which is only a render scale). Y-flip happens inside the adapter against world bounds passed at construction time. Owns `bodyById: Map<string, { matter: Matter.Body; wrapper: MatterPhysicsBody }>`.

- `setGravity({x, y})`: sets `engine.gravity.x = x`, `engine.gravity.y = -y`, and `engine.gravity.scale` via the Matter-scale formula (pulled out of `UnitConverter.toMatterGravityScale` and parameterized on `MATTER_PX_PER_M` + fixed 60 Hz step).
- `createBody`: consumes a `ShapeDescriptor`, converts to Matter-pixel coordinates internally, calls Matter's body factories. Vertex/concave shapes are decomposed via `poly-decomp` in a helper and built as a compound Matter body. The wrapper stores the original SI `ShapeDescriptor` so renderers never touch Matter internals.
- `step(dtSeconds)`: `Matter.Engine.update(engine, dtSeconds * 1000)`.
- `snapshot/restore`: iterates wrappers, reads/writes via SI getters/setters.

### `src/physics/rapier/RapierAdapter.ts`

Wraps `@dimforge/rapier2d-compat` `World`. Native SI + Y-up — wrapper accessors are near pass-through. `init()` awaits `RAPIER.init()`. Bodies built via `RigidBodyDesc.dynamic()/fixed()` + `ColliderDesc`. Compound bodies = one `RigidBody` with multiple colliders (via the same `poly-decomp` helper used by Matter). `destroy()` calls `world.free()`.

### `src/physics/index.ts`

```ts
export async function createPhysicsAdapter(
  kind: 'matter' | 'rapier',
  opts: { worldBounds: Bounds; gravity: Vec2 }
): Promise<PhysicsAdapter>;
```

Uses dynamic `import()` for the Rapier branch so Matter-only sims don't pay the ~2 MB WASM cost.

## BaseSimulation changes

`src/components/BaseSimulation.tsx` — owns a `PhysicsAdapter` instead of `Matter.Engine`.

- Engine-init `useEffect` becomes an async IIFE that builds the adapter and awaits `adapter.init()` before setting `engineReady`. Cleanup captures `adapter` in closure and calls `adapter.destroy()`.
- `PhysicsContext` now carries `PhysicsAdapter | null`.
- `onInit(engine)` / `onUpdate(engine, time)` prop signatures → `onInit(adapter)` / `onUpdate(adapter, time)`.
- `precompute()` snapshot/apply (currently lines 209–231, Matter-specific) switches to `adapter.snapshot() / adapter.restore()` with a reusable pre-allocated buffer.
- `simToCanvasX/Y` helpers are removed; coordinate conversion moves entirely into the renderer's `WorldToCanvas`.
- Replay mode restores body poses via SI setters through the adapter.

## JsonSimulation changes

`src/components/JsonSimulation.tsx` — massive simplification.

- Delete `pixelObjects` useMemo and all SI→pixel pre-conversion for objects, velocities, dimensions.
- Delete `matterGravityScale` / `toMatterGravityScale`; gravity flows as SI m/s² directly to `adapter.setGravity({x: 0, y: -environment.gravity})`.
- `handleControlChange` collapses: no more `velocity.*` / `position.*` special cases. One line: `setNestedValue(body, control.property, value)`. Vec2Accessor setters route through the adapter.
- `handleUpdate` collapses: `getNestedValue(body, output.property)` already returns SI. Delete `convertPixelToRealUnit`. Finite-difference acceleration is still computed per frame and stored in `body.userData.derivedAcceleration` (not as `(body as any).acceleration`).
- `acceleration.*` property paths in outputs/graphs: small shim at the top of `getNestedValue` that rewrites `acceleration.x/y` to `userData.derivedAcceleration.x/y`.
- `objRefs` type becomes `Record<string, PhysicsBody>`.
- Replay `handleReplayFrame` writes position/angle via SI setters through the adapter.

## Object factories and ObjectRenderer

`src/components/simulation_components/objects/bodies/{Rectangle,Circle,Polygon,Vertex}.ts` — become pure `ShapeDescriptor` builders. No Matter import. The Vertex factory keeps its `poly-decomp` use to build a `{type:'compound', parts:[...]}` descriptor from a concave vertex list.

`src/components/simulation_components/objects/registry.ts` — registry emits `ShapeDescriptor` factories instead of Matter body factories.

`src/components/simulation_components/objects/ObjectRenderer.tsx` — consumes `adapter` from `PhysicsContext`, builds a `BodyDef` in SI from the config, calls `adapter.createBody(def)`, exposes the returned `PhysicsBody` via `forwardRef`. Stops calling `Matter.Body.setVelocity/setAngularVelocity/setMass/setAngle` directly — all of that is now part of `BodyDef` and applied by the adapter.

## Environment / walls

`src/components/simulation_components/Environment.tsx` — stops creating Matter bodies. Computes world bounds from canvas dimensions / `pixelsPerUnit`:

```
worldWidthM = CANVAS_WIDTH / pixelsPerUnit
worldHeightM = CANVAS_HEIGHT / pixelsPerUnit
```

and calls `adapter.createWalls(sides.map(side => ({ side, bounds, thickness: WALL_THICKNESS / pixelsPerUnit })))`. Gravity flows via `adapter.setGravity({x: 0, y: -config.gravity})`.

## Renderables layer

New helper `src/lib/worldToCanvas.ts`:

```ts
class WorldToCanvas {
  constructor(pixelsPerUnit: number, canvasHeight: number, wallOffset: number);
  point(p: Vec2): { x: number; y: number };
  dimension(m: number): number;
  angle(rad: number): number;  // returns -rad (Y-flip inverts rotation direction)
}
```

`src/components/simulation_components/renderables/RenderLayer.tsx` — builds a `WorldToCanvas` from environment config each frame and injects it into `DrawContext`. `objRefs` in `ResolveContext` becomes `Record<string, PhysicsBody>`.

`src/components/simulation_components/renderables/positionSources.ts` — `resolvePosition` for `source.type='body'` reads `PhysicsBody.position` / `PhysicsBody.angle` in SI Y-up. No pixel conversion here.

`src/components/simulation_components/renderables/visuals/BodyOutline.ts` — reads `PhysicsBody.shape` + SI pose and draws via `ctx.w2c`. Handles `circle`, `rectangle`, `polygon`, and `compound` (iterating parts). Stops reading Matter-specific `body.vertices`, `body.parts`, `body.circleRadius`.

`src/components/simulation_components/renderables/visuals/ForceArrow.ts` — reads `body.userData.derivedAcceleration` (SI m/s²), `body.mass`, and gravity from the draw context. Computes `F = m·a` in Newtons and scales via `ctx.w2c` for screen-consistent arrow length. Stops reading `(body as any).gravityAcceleration`.

## Schema

`src/schemas/simulation.ts` — add optional `physicsEngine: 'matter' | 'rapier'` to `EnvironmentConfigSchema`. Default in code is `'rapier'`; any existing config without the field gets Rapier. Update the coordinate-system doc comment to stop mentioning Matter.

After the schema change, run `npm run generate:schema` to regenerate `modal_functions/simulation_schema.json`.

## Dead code to delete

- `UnitConverter.toPixelsX/Y`, `fromPixelsX/Y`, `toPixelsVelocityAcceleration*`, `fromPixelsVelocityAcceleration*`, `toPixelsDimension`, `fromPixelsDimension`, `toPixelsProperty`, `fromPixelsProperty`, `toMatterGravityScale` — all gone.
- What's left of `src/lib/unitConversion.ts`: unit label lookup tables (if any are still used), otherwise delete the file entirely and move labels into the new `worldToCanvas.ts` or a small constants file.
- `BaseSimulation` coordinate helpers `simToCanvasX/Y/canvasToSimX/Y`.
- JsonSimulation `convertPixelToRealUnit` and the `velocity.*`/`position.*` branches in `handleControlChange`.

## Critical files

**Major refactor:**
- `src/components/BaseSimulation.tsx`
- `src/components/JsonSimulation.tsx`
- `src/components/simulation_components/Environment.tsx`
- `src/components/simulation_components/objects/ObjectRenderer.tsx`
- `src/components/simulation_components/objects/bodies/{Rectangle,Circle,Polygon,Vertex}.ts`
- `src/components/simulation_components/renderables/RenderLayer.tsx`
- `src/components/simulation_components/renderables/positionSources.ts`
- `src/components/simulation_components/renderables/visuals/BodyOutline.ts`
- `src/components/simulation_components/renderables/visuals/ForceArrow.ts`
- `src/components/simulation_components/renderables/synthesize.ts` (walls + force arrow synthesis take SI bounds)
- `src/contexts/PhysicsContext.tsx`
- `src/schemas/simulation.ts`
- `src/lib/unitConversion.ts` (mostly deleted)

**New files:**
- `src/physics/types.ts`
- `src/physics/index.ts`
- `src/physics/matter/MatterAdapter.ts`
- `src/physics/matter/bodyFactory.ts`
- `src/physics/rapier/RapierAdapter.ts`
- `src/physics/rapier/bodyFactory.ts`
- `src/lib/worldToCanvas.ts`

**Small touches / verify-only:**
- `src/simulations/*.json` — no change; they're already SI.
- `src/simulations/TossBallSimulation.tsx`, `TwoBoxesSimulation.tsx` — audit for any direct `Matter.Engine` reads via `onInit/onUpdate`, migrate if present.

## Rollout — 6 PRs

Each PR is green on `nvm use 22 && npm run build && npm run lint` and visually regression-checked against the prior PR. (This repo requires Node 22 — always prefix npm commands with `nvm use 22 &&`.)

1. **PR 1 — Adapter scaffolding (Matter only, no callers).** Land `src/physics/types.ts`, `MatterAdapter`, `src/physics/index.ts`. Unit test: instantiate adapter, create a ball, step 60 frames, assert position matches a direct Matter script. App untouched.

2. **PR 2 — BaseSimulation owns the adapter.** `PhysicsContext` becomes `PhysicsAdapter | null`. `onInit/onUpdate` signatures change. `precompute` uses `adapter.snapshot/restore`. `MatterAdapter` temporarily accepts pixel-space inputs (feature-flagged internal mode) so `JsonSimulation` stays unchanged. Visual parity with main required.

3. **PR 3 — Flip to SI internals.** Port `ObjectRenderer`, `Environment`, body factories, `BodyOutline`, `ForceArrow`, `positionSources`, `RenderLayer` to SI. Delete the `pixelObjects` memo and per-property pixel conversions in `JsonSimulation`. Land `WorldToCanvas`. Delete unused `UnitConverter` helpers. Remove the PR 2 feature flag. Frame-exact parity with main on both example sims.

4. **PR 4 — Visual regression pass + polish.** See verification section below. Shake out any behavioral drift from PR 3.

5. **PR 5 — Add `RapierAdapter` + `@dimforge/rapier2d-compat` dep + async adapter init in `BaseSimulation`.** Add `physicsEngine` field to schema (default still `matter` at this step). Dynamic import in `createPhysicsAdapter` for code-splitting.

6. **PR 6 — Flip default to Rapier.** Schema default becomes `'rapier'`. Audit both example sims under Rapier; tweak restitution/friction if solver differences cause visible behavior changes. Document any behavioral notes in CLAUDE.md. Regenerate `modal_functions/simulation_schema.json`.

## Verification

### Matter refactor (PRs 1–4)

- **Determinism harness (dev-only script, not committed):** load each of `tossBall.json` and `twoBoxes.json`, call `precompute(600, noop)`, dump every body's `position.{x,y}` and `velocity.{x,y}` per frame to JSON. Capture reference dumps on `main`, diff after each PR. Matter is deterministic; aim for frame-exact parity through PR 3.
- **Visual smoke test:** run `npm run dev` on both example sims side-by-side with `main`. Confirm ball apex in `tossBall`, collision timing and bounce in `twoBoxes`, wall containment, force-arrow length/direction, output numerical readouts, graph traces.
- **Precompute/replay parity:** precompute 10 s, replay, confirm identical visuals to live play. Verify cache invalidation on slider change still works.
- **Interactive parity:** drag every slider through full range during live play and during replay; outputs and body state should be indistinguishable from main.
- **Type check + lint:** `npm run build && npm run lint` green after every PR.

### Rapier addition (PRs 5–6)

Rapier and Matter solvers differ, so parity is behavioral, not numerical.

- **Projectile apex:** ball toss reaches `v²/(2g)` within 2%.
- **Elastic collision:** two boxes with `restitution=1` conserve momentum within 1%.
- **Wall containment:** high-velocity ball stays inside walls over 60 s.
- **Resting stack:** static configurations stay at rest.
- **Shape sanity:** a Vertex (concave) body's outline rendering and collision footprint look identical under both adapters.
- **WASM init:** hard reload, confirm `JsonSimulation` renders a loading state until adapter resolves, then runs without errors.
- **Bundle split:** confirm via `vite build` output that Rapier is in its own chunk and Matter-only sims don't load it.
- **Regenerate schema:** `npm run generate:schema` and verify `simulation_schema.json` includes the `physicsEngine` field.
