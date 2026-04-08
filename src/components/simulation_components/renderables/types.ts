import type Matter from 'matter-js';
import type { Renderable, Visual, PositionSource } from '../../../schemas/simulation';

export type { Renderable, Visual, PositionSource };

/**
 * Internal marker visual used by auto-synthesized experimental-data renderables.
 * Not exposed through the schema; created by JsonSimulation.
 */
export interface MarkerVisual {
  type: 'marker';
  shape: 'circle' | 'rectangle';
  color: string;
  pixelSize: number;
}

/**
 * Internal body-outline visual used by auto-synthesized default renderables.
 * Draws the physics body's own vertices — works for any body shape, uses
 * live physics data. Not exposed through the schema.
 */
export interface BodyOutlineVisual {
  type: 'body-outline';
  color: string;
}

/**
 * Internal force-arrow visual. Draws net-force arrows on a physics body
 * using live acceleration data from the engine. Not exposed through the schema.
 */
export interface ForceArrowVisual {
  type: 'force-arrow';
  /** Pixels per Newton — controls arrow length scaling */
  pixelsPerNewton: number;
}

/**
 * All visuals RenderLayer can draw (schema visuals + internal synthesized ones).
 */
export type PixelVisual = Visual | MarkerVisual | BodyOutlineVisual | ForceArrowVisual;

/**
 * A renderable converted to pixel/canvas space — what RenderLayer actually consumes.
 * Numeric dimensions in `visual` are in canvas pixels. Fixed source coords are in canvas pixels.
 */
export interface PixelRenderable {
  id: string;
  source: PositionSource;  // body/data bodyId/dataId, or fixed coords in canvas pixels
  visual: PixelVisual;
  opacity: number;
  zIndex: number;
}

/**
 * Resolved position in canvas-pixel space.
 */
export interface ResolvedPosition {
  x: number;
  y: number;
  angle: number;
}

/**
 * A data source that can report position in canvas pixels at a given simulation time.
 * Used for experimental data (and any future time-series visual sources).
 */
export interface DataPositionResolver {
  resolve(time: number): ResolvedPosition | null;
}

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  position: ResolvedPosition;
  body?: Matter.Body;
  opacity: number;
}

export type VisualDrawFn = (drawCtx: DrawContext, visual: PixelVisual) => void;
