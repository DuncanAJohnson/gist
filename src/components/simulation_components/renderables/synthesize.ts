import { SIMULATION_WIDTH, SIMULATION_HEIGHT, WALL_THICKNESS } from '../../BaseSimulation';
import type { ExpandedObjectConfig } from '../objects/types';
import type { ExperimentalDataConfig } from '../ExperimentalDataModal';
import type { PixelRenderable, DataPositionResolver } from './types';
import type { VectorKind } from './vectorTheme';
import { interpolate } from './positionSources';

const WALL_COLOR = '#666';

/**
 * Wall renderables — drawn as fixed rectangles at the SI world edges. The
 * matching physics bodies live in Environment.tsx; these are purely visual.
 *
 * `pixelsPerUnit` is needed to compute the SI size of the fixed-pixel
 * simulation area and wall thickness.
 */
export function synthesizeWallRenderables(
  walls: string[],
  pixelsPerUnit: number,
): PixelRenderable[] {
  const worldW = SIMULATION_WIDTH / pixelsPerUnit;
  const worldH = SIMULATION_HEIGHT / pixelsPerUnit;
  const thickness = WALL_THICKNESS / pixelsPerUnit;
  const out: PixelRenderable[] = [];

  const make = (id: string, x: number, y: number, w: number, h: number): PixelRenderable => ({
    id,
    source: { type: 'fixed', x, y, angle: 0 },
    visual: { type: 'shape', shape: 'rectangle', color: WALL_COLOR, width: w, height: h },
    opacity: 1,
    zIndex: -10,
  });

  if (walls.includes('bottom')) {
    out.push(make(
      '__wall_bottom',
      worldW / 2,
      -thickness / 2,
      worldW + 2 * thickness,
      thickness,
    ));
  }
  if (walls.includes('top')) {
    out.push(make(
      '__wall_top',
      worldW / 2,
      worldH + thickness / 2,
      worldW + 2 * thickness,
      thickness,
    ));
  }
  if (walls.includes('left')) {
    out.push(make(
      '__wall_left',
      -thickness / 2,
      worldH / 2,
      thickness,
      worldH + 2 * thickness,
    ));
  }
  if (walls.includes('right')) {
    out.push(make(
      '__wall_right',
      worldW + thickness / 2,
      worldH / 2,
      thickness,
      worldH + 2 * thickness,
    ));
  }
  return out;
}

/**
 * Renderable that draws the object's SVG sprite at its bounding box. Every
 * physics object gets one — the `svg` field on ObjectConfig is the single
 * source of truth for both collider and visual.
 */
export function synthesizeBodyRenderable(obj: ExpandedObjectConfig): PixelRenderable {
  return {
    id: `__default_${obj.id}`,
    source: { type: 'body', bodyId: obj.id, followAngle: true },
    visual: { type: 'renderable', name: obj.svg, width: obj.width, height: obj.height },
    opacity: 1,
    zIndex: 0,
  };
}

/**
 * Collider-observation renderable (`?colliders=1` debug overlay). Draws the
 * body's engine-truth ShapeDescriptor over its sprite — for a concave manifest
 * collider that IS the decomposed compound, so the poly-decomp split renders
 * directly. The BodyOutline drawer handles per-part palette colors and the
 * vertex-count readout (red above Planck's silent 12-vertex truncation cap).
 */
export function synthesizeColliderDebugRenderable(obj: ExpandedObjectConfig): PixelRenderable {
  return {
    id: `__collider_${obj.id}`,
    source: { type: 'body', bodyId: obj.id, followAngle: true },
    visual: { type: 'body-outline', color: '#e6194b', debugParts: true },
    opacity: 0.9,
    zIndex: 30, // above sprites (0), vector arrows (10), and markers (20)
  };
}

/**
 * Background-grid renderable. Anchored at the world origin (bottom-left of the
 * play area in canvas space) and sized to fill the play area exactly. The
 * drawer handles all niceStep math; this synthesizer just fixes the geometry.
 *
 * `pixelsPerUserUnit` is the user-facing px-per-unit value (the same one
 * `Scale` displays), NOT the SI pixelsPerMeter that WorldToCanvas operates in,
 * so labels read in the sim's configured unit.
 *
 * `zoomFactor` scales the play-area dimensions to match the scaled canvas
 * when the user zooms in via the slider. At zoomFactor=1 the grid covers
 * exactly SIMULATION_WIDTH × SIMULATION_HEIGHT canvas pixels.
 *
 * zIndex is set below the wall renderables (-10) so walls paint over the grid.
 */
export function synthesizeGridRenderable(
  pixelsPerUserUnit: number,
  unitLabel: string,
  zoomFactor: number = 1,
): PixelRenderable {
  return {
    id: '__background_grid',
    source: { type: 'fixed', x: 0, y: 0, angle: 0 },
    visual: {
      type: 'background-grid',
      pixelsPerUnit: pixelsPerUserUnit,
      unitLabel,
      playWidthPx: SIMULATION_WIDTH * zoomFactor,
      playHeightPx: SIMULATION_HEIGHT * zoomFactor,
    },
    opacity: 1,
    zIndex: -20,
  };
}

/**
 * Vector-arrow renderables for a physics object with one or more `showVectors`
 * entries. Each entry is either a shorthand kind string ("velocity",
 * "force-net", …) or a full {kind, color?, label?, …} config. Returns one
 * renderable per entry. Objects with no `showVectors` (or an empty array) emit
 * nothing.
 *
 * The renderable `id` is namespaced by kind and array index so that multiple
 * arrows of the same kind on one body (rare but valid — e.g. two F_app pulls
 * at different anchors) don't collide.
 */
export function synthesizeVectorArrowRenderables(obj: ExpandedObjectConfig): PixelRenderable[] {
  // Back-compat for sims loaded outside the Zod parse path (Supabase JSON,
  // raw paste). The schema's `z.preprocess` shim translates legacy
  // `showForceArrows: true` → `showVectors: ["force-net"]`, but only when the
  // object actually flows through ObjectConfigSchema.parse. Saved sims read
  // from Supabase by `DynamicSimulation` skip that step, so we honor the
  // legacy field here as a runtime fallback. New authoring should use
  // `showVectors` directly.
  const legacy = (obj as ExpandedObjectConfig & { showForceArrows?: boolean }).showForceArrows;
  const showVectors = obj.showVectors ?? (legacy === true ? ['force-net' as const] : undefined);
  if (!showVectors || showVectors.length === 0) return [];
  return showVectors.flatMap((entry, i) => {
    const cfg = typeof entry === 'string' ? { kind: entry } : entry;
    // `components` is an authoring convenience: strip it from the visual and
    // fan the entry out into one axis-locked arrow per component. The plain
    // (non-component) path stays a single resultant arrow.
    const { components, ...visualCfg } = cfg;
    const axes: Array<'x' | 'y' | undefined> = components ? ['x', 'y'] : [undefined];
    return axes.map((axis) => ({
      id: `__vector_arrow_${obj.id}__${cfg.kind}__${i}${axis ? `__${axis}` : ''}`,
      source: { type: 'body' as const, bodyId: obj.id, followAngle: false },
      visual: { type: 'vector-arrow' as const, ...visualCfg, ...(axis ? { axis } : {}) },
      opacity: 0.9,
      zIndex: 20,
    }));
  });
}

/**
 * Debug force-overlay renderables — the "Show force vectors" toggle / `?forces=1`
 * (Goal-1 FBD step 2, 2026-07-24). Draws the data-ready FBD force kinds on every
 * DYNAMIC body, independent of the body's authored `showVectors`, so any sim can
 * be inspected without editing its JSON — mirroring the collider observation
 * overlay. The kinds:
 *   - `force-gravity` (m·g) — always present on a dynamic body.
 *   - `force-drag` (−k·|v|·v) — only non-zero in air-resistance mode.
 *   - `force-normal` / `force-friction` — ENGINE-READ contact forces from the
 *     adapter seam (Goal-1 step 3, 2026-08-06): solver impulses / dt, so they
 *     jitter at resting contact and read zero on sleeping bodies. Engine-truth
 *     instrument, same spirit as the collider overlay.
 *   - `force-net` (m·a) — the measured resultant.
 * With all four component sources drawn, the FBD should close onto net up to
 * impulse-solver noise — how well it closes IS the step-4 representation-spike
 * question. Static bodies (floors/walls) get nothing; zero-length arrows
 * (drag at rest, net in equilibrium) are suppressed by the renderer's
 * min-length floor.
 */
const FORCE_DEBUG_KINDS: readonly VectorKind[] = [
  'force-gravity',
  'force-drag',
  'force-normal',
  'force-friction',
  'force-net',
];

export function synthesizeForceDebugRenderables(obj: ExpandedObjectConfig): PixelRenderable[] {
  if (obj.isStatic) return [];
  return FORCE_DEBUG_KINDS.map((kind) => ({
    id: `__force_debug_${obj.id}__${kind}`,
    source: { type: 'body' as const, bodyId: obj.id, followAngle: false },
    visual: { type: 'vector-arrow' as const, kind },
    opacity: 0.9,
    zIndex: 20,
  }));
}

/**
 * Marker renderable for imported experimental data.
 */
export function synthesizeExperimentalRenderable(
  experimentalData: ExperimentalDataConfig
): PixelRenderable {
  return {
    id: '__experimental_marker',
    source: { type: 'data', dataId: 'experimental' },
    visual: {
      type: 'marker',
      shape: experimentalData.shape,
      color: experimentalData.color,
      pixelSize: 12,
    },
    opacity: experimentalData.opacity,
    zIndex: 10,
  };
}

/**
 * Builds a DataPositionResolver that reports the SI position of an
 * experimental-data trace at a given simulation time.
 */
export function buildExperimentalDataResolver(
  experimentalData: ExperimentalDataConfig,
  unitScale: number = 1,
): DataPositionResolver | null {
  if (!experimentalData.origin) return null;
  const { data, origin, positiveX, positiveY, hasX, hasY } = experimentalData;
  const initialX = hasX ? (data[0]?.x ?? 0) : 0;
  const initialY = hasY ? (data[0]?.y ?? 0) : 0;
  const signX = positiveX === 'right' ? 1 : -1;
  const signY = positiveY === 'up' ? 1 : -1;

  return {
    resolve(time: number) {
      const dataX = hasX ? interpolate(data, time, 'x') : null;
      const dataY = hasY ? interpolate(data, time, 'y') : null;
      let realX = origin.x;
      let realY = origin.y;
      if (dataX !== null) realX += signX * (dataX - initialX);
      if (dataY !== null) realY += signY * (dataY - initialY);
      // Origin and data are declared in the config's user unit; scale to SI
      // so the render layer's WorldToCanvas can handle them alongside physics.
      return { x: realX * unitScale, y: realY * unitScale, angle: 0 };
    },
  };
}
