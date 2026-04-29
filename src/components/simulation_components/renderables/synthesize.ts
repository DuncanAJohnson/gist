import { SIMULATION_WIDTH, SIMULATION_HEIGHT, WALL_THICKNESS } from '../../BaseSimulation';
import type { ObjectConfig } from '../objects/types';
import type { ExperimentalDataConfig } from '../ExperimentalDataModal';
import type { PixelRenderable, DataPositionResolver } from './types';
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
export function synthesizeBodyRenderable(obj: ObjectConfig): PixelRenderable {
  return {
    id: `__default_${obj.id}`,
    source: { type: 'body', bodyId: obj.id, followAngle: true },
    visual: { type: 'renderable', name: obj.svg, width: obj.width, height: obj.height },
    opacity: 1,
    zIndex: 0,
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
 * Force-arrow renderable for a physics object with showForceArrows enabled.
 */
export function synthesizeForceArrowRenderable(obj: ObjectConfig): PixelRenderable {
  return {
    id: `__force_arrow_${obj.id}`,
    source: { type: 'body', bodyId: obj.id, followAngle: false },
    visual: { type: 'force-arrow', pixelsPerNewton: 2 },
    opacity: 0.9,
    zIndex: 20,
  };
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
