/**
 * Container expansion — the JSON-authoring seam for open containers
 * (concave-colliders Phase 4, landed 2026-07-18).
 *
 * An object carrying a `container` field authors the open-container PARAMS
 * (innerWidth, wallHeight, walls, mode, …); this pass derives the rest at
 * load by delegating to makeOpenContainer — which synthesizes the flat-fill
 * sprite + concave collider, registers them session-side, and computes the
 * bounding box (and grounded seating). Because the authored JSON stays
 * compact, saves round-trip the `container` field and every reload
 * re-expands — the old "saved container sims fall back to a rectangle
 * collider" caveat is gone.
 *
 * This runs at the runtime ingestion boundary, directly ahead of
 * scaleObjectToSI (which requires width/height/svg — nothing Zod-parses at
 * runtime, so like that seam this pass is defensive about incomplete input).
 * It is called from a render-time useMemo ON PURPOSE: registration must
 * complete before the ObjectRenderers mount and look the sprite name up.
 * The signature cache below makes that safe — repeat calls with unchanged
 * params (re-renders, StrictMode double-invoke) reuse the prior factory
 * result without re-registering, so blob URLs stay stable and the sprite
 * imageCache stays warm.
 */

import type { ObjectConfig, ExpandedObjectConfig } from '../schemas/simulation';
import { makeOpenContainer, type OpenContainer } from './openContainer';

export interface ExpansionEnv {
  /** Smaller scene dimension in configured units (wall-thickness clamp floor). */
  sceneMin: number;
  /** Whether environment.walls includes 'bottom' — grounded seating's floor. */
  hasBottomWall: boolean;
}

/**
 * Per-container-id cache of the last factory result, keyed by a full input
 * signature. A signature hit skips makeOpenContainer entirely (no
 * re-registration, no new blob URL). One-time warnings are emitted on cache
 * miss only, so they don't spam every render.
 */
const cache = new Map<string, { sig: string; result: OpenContainer }>();

/** Exposed for tests/harnesses only. */
export function clearContainerExpansionCache(): void {
  cache.clear();
}

function isCompleteObject(obj: ObjectConfig): obj is ExpandedObjectConfig {
  return (
    typeof obj.width === 'number' &&
    typeof obj.height === 'number' &&
    typeof obj.svg === 'string'
  );
}

/**
 * Expand `container` objects into complete ObjectConfigs; pass ordinary
 * complete objects through untouched. Defensive drops (warn + exclude), in
 * the spirit of the ingestion seam:
 *  - ordinary object missing width/height/svg (would NaN-poison the SI
 *    scaling downstream — dropping loudly beats rendering garbage);
 *  - container object whose factory call throws (e.g. mode 'free' without y
 *    in unvalidated JSON).
 */
export function expandContainerObjects(
  objects: ObjectConfig[],
  env: ExpansionEnv,
): ExpandedObjectConfig[] {
  const seenIds = new Set<string>();
  const out: ExpandedObjectConfig[] = [];

  for (const obj of objects) {
    if (!obj.container) {
      if (!isCompleteObject(obj)) {
        console.warn(
          `expandContainerObjects: object "${obj.id}" has no \`container\` and is missing ` +
            `width/height/svg — dropped (it would build a NaN-sized body).`,
        );
        continue;
      }
      out.push(obj);
      continue;
    }

    const c = obj.container;
    const sig = JSON.stringify([
      obj.id, c.innerWidth, c.wallHeight, c.wallThickness, c.floorThickness,
      c.walls, c.mode, c.fill, c.stroke,
      obj.x, obj.y, env.sceneMin, obj.mass, obj.friction, obj.restitution,
    ]);
    const cached = cache.get(obj.id);
    let result: OpenContainer;
    if (cached && cached.sig === sig) {
      result = cached.result;
    } else {
      // Cache miss — the one-time home for authoring warnings.
      const grounded = (c.mode ?? 'grounded') === 'grounded';
      if (grounded && !env.hasBottomWall) {
        console.warn(
          `expandContainerObjects: container "${obj.id}" is grounded but environment.walls ` +
            `has no 'bottom' — it will seat at y=0 over empty space and fall.`,
        );
      }
      if (obj.width !== undefined || obj.height !== undefined || obj.svg !== undefined) {
        console.warn(
          `expandContainerObjects: container "${obj.id}" also authors width/height/svg — ` +
            `derived values win; the authored ones are ignored.`,
        );
      }
      if (seenIds.has(obj.id)) {
        console.warn(
          `expandContainerObjects: duplicate container id "${obj.id}" — the later ` +
            `registration wins the renderable name (duplicate object ids are invalid sim-wide).`,
        );
      }
      try {
        result = makeOpenContainer({
          id: obj.id,
          x: obj.x,
          y: obj.y,
          groundLevel: 0,
          sceneMin: env.sceneMin,
          mass: obj.mass,
          friction: obj.friction,
          restitution: obj.restitution,
          ...c,
        });
      } catch (err) {
        console.warn(
          `expandContainerObjects: container "${obj.id}" failed to synthesize — dropped. `,
          err,
        );
        continue;
      }
      cache.set(obj.id, { sig, result });
    }
    seenIds.add(obj.id);

    // Spread the authored object first so velocity, showVectors, drag fields,
    // angle, isStatic, etc. (and `container` itself) ride along; then override
    // the derived fields from the factory. `y` is the seated center when
    // grounded and the authored y when free. Authored isStatic wins over the
    // factory's hardcoded dynamic default (fixed-bucket case).
    out.push({
      ...obj,
      y: result.object.y,
      width: result.object.width,
      height: result.object.height,
      svg: result.object.svg,
      mass: result.object.mass,
      friction: result.object.friction,
      restitution: result.object.restitution,
      isStatic: obj.isStatic ?? false,
    });
  }

  return out;
}
