import type { PositionSource } from '../../../schemas/simulation';
import type { PhysicsBody } from '../../../physics/types';
import type { WorldToCanvas } from '../../../lib/worldToCanvas';
import type { DataPositionResolver, ResolvedPosition } from './types';

/**
 * Linear interpolation over a sorted time-series. Returns null when the series
 * has no values for the requested key. Values at/beyond the endpoints clamp.
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
  objRefs: Record<string, PhysicsBody>;
  dataSources: Record<string, DataPositionResolver>;
  simulationTime: number;
  w2c: WorldToCanvas;
}

/**
 * Resolve a position source to canvas-pixel coordinates. Inputs (source coords,
 * body positions, data resolvers) are all in SI; the returned ResolvedPosition
 * is converted via the supplied WorldToCanvas.
 */
export function resolvePosition(
  source: PositionSource,
  ctx: ResolveContext
): { position: ResolvedPosition; body?: PhysicsBody } | null {
  const { w2c } = ctx;

  if (source.type === 'fixed') {
    return {
      position: {
        x: w2c.pointX(source.x),
        y: w2c.pointY(source.y),
        angle: w2c.angle(source.angle ?? 0),
      },
    };
  }
  if (source.type === 'body') {
    const body = ctx.objRefs[source.bodyId];
    if (!body) return null;
    // Runaway physics (e.g. Matter going NaN on unstable configs) would
    // otherwise draw at canvas origin via translate(NaN,NaN) → no-op.
    const sx = body.position.x;
    const sy = body.position.y;
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
      if (!(window as any).__nanWarned) {
        console.warn('[nan guard] body position non-finite, skipping render', source.bodyId, { sx, sy });
        (window as any).__nanWarned = true;
      }
      return null;
    }
    const siAngle = source.followAngle === false ? 0 : body.angle;
    return {
      position: {
        x: w2c.pointX(sx),
        y: w2c.pointY(sy),
        angle: w2c.angle(Number.isFinite(siAngle) ? siAngle : 0),
      },
      body,
    };
  }
  // type === 'data'
  const resolver = ctx.dataSources[source.dataId];
  if (!resolver) return null;
  const pos = resolver.resolve(ctx.simulationTime);
  if (!pos) return null;
  return {
    position: {
      x: w2c.pointX(pos.x),
      y: w2c.pointY(pos.y),
      angle: w2c.angle(pos.angle),
    },
  };
}
