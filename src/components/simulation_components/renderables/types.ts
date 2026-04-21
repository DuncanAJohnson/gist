import type { PhysicsBody, Vec2 } from '../../../physics/types';
import type { WorldToCanvas } from '../../../lib/worldToCanvas';
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
 * Draws the physics body's SI ShapeDescriptor, converted via WorldToCanvas.
 */
export interface BodyOutlineVisual {
  type: 'body-outline';
  color: string;
}

/**
 * Internal force-arrow visual. Draws net-force arrows on a physics body
 * using live SI acceleration data. Not exposed through the schema.
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
 * A renderable prepared for RenderLayer. All numeric values in `source` and
 * `visual` (fixed coordinates, widths, heights, radii) are in SI units —
 * conversion to canvas pixels happens at draw time via the WorldToCanvas
 * supplied on the DrawContext.
 */
export interface PixelRenderable {
  id: string;
  source: PositionSource;
  visual: PixelVisual;
  opacity: number;
  zIndex: number;
}

/**
 * Resolved position in canvas-pixel space, ready to draw.
 */
export interface ResolvedPosition {
  x: number;
  y: number;
  angle: number;
}

/**
 * A data source that can report position in SI at a given simulation time.
 * Used for experimental data (and any future time-series visual sources).
 */
export interface DataPositionResolver {
  resolve(time: number): { x: number; y: number; angle: number } | null;
}

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  /** Canvas-pixel position (already converted from SI). */
  position: ResolvedPosition;
  /** SI physics body, present when the source resolves to a body. */
  body?: PhysicsBody;
  opacity: number;
  /** World → canvas transform for this frame. */
  w2c: WorldToCanvas;
  /** SI gravity (m/s²), used by force-arrow visuals. */
  gravity: Vec2;
}

export type VisualDrawFn = (drawCtx: DrawContext, visual: PixelVisual) => void;
