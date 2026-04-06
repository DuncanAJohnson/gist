import { CANVAS_WIDTH, CANVAS_HEIGHT, WALL_THICKNESS } from '../../BaseSimulation';
import type { UnitConverter } from '../../../lib/unitConversion';
import type { Renderable } from '../../../schemas/simulation';
import type { ObjectConfig } from '../objects/types';
import type { ExperimentalDataConfig } from '../ExperimentalDataModal';
import type { PixelRenderable, DataPositionResolver } from './types';
import { interpolate } from './positionSources';

const WALL_COLOR = '#666';

/**
 * Wall renderables — drawn as fixed rectangles at hardcoded canvas positions.
 * The corresponding physics bodies live in Environment.tsx; these are purely
 * visual.
 */
export function synthesizeWallRenderables(walls: string[]): PixelRenderable[] {
  const out: PixelRenderable[] = [];
  const make = (id: string, x: number, y: number, w: number, h: number): PixelRenderable => ({
    id,
    source: { type: 'fixed', x, y, angle: 0 },
    visual: { type: 'shape', shape: 'rectangle', color: WALL_COLOR, width: w, height: h },
    opacity: 1,
    zIndex: -10,
  });

  if (walls.includes('bottom')) {
    out.push(make('__wall_bottom', CANVAS_WIDTH / 2, CANVAS_HEIGHT - WALL_THICKNESS / 2, CANVAS_WIDTH, WALL_THICKNESS));
  }
  if (walls.includes('top')) {
    out.push(make('__wall_top', CANVAS_WIDTH / 2, WALL_THICKNESS / 2, CANVAS_WIDTH, WALL_THICKNESS));
  }
  if (walls.includes('left')) {
    out.push(make('__wall_left', WALL_THICKNESS / 2, CANVAS_HEIGHT / 2, WALL_THICKNESS, CANVAS_HEIGHT));
  }
  if (walls.includes('right')) {
    out.push(make('__wall_right', CANVAS_WIDTH - WALL_THICKNESS / 2, CANVAS_HEIGHT / 2, WALL_THICKNESS, CANVAS_HEIGHT));
  }
  return out;
}

/**
 * Default "body-outline" renderable for a physics object that the user hasn't
 * explicitly given a renderable for. Uses live body geometry, honoring any
 * body.color in the config (or a fallback).
 */
export function synthesizeBodyRenderable(obj: ObjectConfig): PixelRenderable {
  const color = (obj.body && 'color' in obj.body && obj.body.color) || '#4ecdc4';
  return {
    id: `__default_${obj.id}`,
    source: { type: 'body', bodyId: obj.id, followAngle: true },
    visual: { type: 'body-outline', color },
    opacity: 1,
    zIndex: 0,
  };
}

/**
 * Force-arrow renderable for a physics object with showForceArrows enabled.
 * Draws above the body outline so it's always visible.
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
 * Marker renderable for imported experimental data. Mirrors the legacy
 * ExperimentalDataRenderer's appearance exactly.
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
 * Builds a DataPositionResolver that reports the canvas-pixel position for an
 * experimental-data trace at a given simulation time. Replicates the position
 * math from the legacy ExperimentalDataRenderer (origin + signed relative
 * displacement).
 */
export function buildExperimentalDataResolver(
  experimentalData: ExperimentalDataConfig,
  unitConverter: UnitConverter
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
      return {
        x: unitConverter.toPixelsX(realX),
        y: unitConverter.toPixelsY(realY),
        angle: 0,
      };
    },
  };
}

/**
 * Convert a user-declared Renderable (real-world units) to a PixelRenderable
 * (canvas pixels). Mirrors the conversion done for `pixelObjects`.
 */
export function toPixelRenderable(
  r: Renderable,
  unitConverter: UnitConverter
): PixelRenderable {
  let source = r.source;
  if (source.type === 'fixed') {
    source = {
      type: 'fixed',
      x: unitConverter.toPixelsX(source.x),
      y: unitConverter.toPixelsY(source.y),
      angle: source.angle ?? 0,
    };
  }

  let visual = r.visual;
  if (visual.type === 'shape') {
    visual = {
      ...visual,
      width: visual.width !== undefined ? unitConverter.toPixelsDimension(visual.width) : undefined,
      height: visual.height !== undefined ? unitConverter.toPixelsDimension(visual.height) : undefined,
      radius: visual.radius !== undefined ? unitConverter.toPixelsDimension(visual.radius) : undefined,
    };
  } else if (visual.type === 'image') {
    visual = {
      ...visual,
      width: unitConverter.toPixelsDimension(visual.width),
      height: unitConverter.toPixelsDimension(visual.height),
    };
  }

  return {
    id: r.id,
    source,
    visual,
    opacity: r.opacity ?? 1,
    zIndex: r.zIndex ?? 0,
  };
}
