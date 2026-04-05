import type Matter from 'matter-js';
import type { PositionSource } from '../../../schemas/simulation';
import type { DataPositionResolver, ResolvedPosition } from './types';

/**
 * Linear interpolation over a sorted time-series. Returns null when the series
 * has no values for the requested key. Values at/beyond the endpoints clamp.
 * Moved verbatim from the old ExperimentalDataRenderer.
 */
export function interpolate(
  data: { time: number; x?: number; y?: number }[],
  time: number,
  key: 'x' | 'y'
): number | null {
  if (data.length === 0) return null;

  if (time <= data[0].time) {
    return data[0][key] ?? null;
  }
  if (time >= data[data.length - 1].time) {
    return data[data.length - 1][key] ?? null;
  }

  for (let i = 0; i < data.length - 1; i++) {
    if (time >= data[i].time && time <= data[i + 1].time) {
      const v0 = data[i][key];
      const v1 = data[i + 1][key];
      if (v0 === undefined || v1 === undefined) return null;
      const t = (time - data[i].time) / (data[i + 1].time - data[i].time);
      return v0 + t * (v1 - v0);
    }
  }

  return null;
}

export interface ResolveContext {
  objRefs: Record<string, Matter.Body>;
  dataSources: Record<string, DataPositionResolver>;
  simulationTime: number;
}

/**
 * Resolve a position source to canvas-pixel coordinates. Returns null if the
 * referenced body/data source isn't available yet.
 *
 * For 'fixed' sources, x/y are expected to already be in canvas-pixel space
 * (JsonSimulation performs the unit conversion before handing renderables to
 * RenderLayer).
 */
export function resolvePosition(
  source: PositionSource,
  ctx: ResolveContext
): { position: ResolvedPosition; body?: Matter.Body } | null {
  if (source.type === 'fixed') {
    return {
      position: { x: source.x, y: source.y, angle: source.angle ?? 0 },
    };
  }
  if (source.type === 'body') {
    const body = ctx.objRefs[source.bodyId];
    if (!body) return null;
    const angle = source.followAngle === false ? 0 : body.angle;
    return {
      position: { x: body.position.x, y: body.position.y, angle },
      body,
    };
  }
  // type === 'data'
  const resolver = ctx.dataSources[source.dataId];
  if (!resolver) return null;
  const pos = resolver.resolve(ctx.simulationTime);
  if (!pos) return null;
  return { position: pos };
}
