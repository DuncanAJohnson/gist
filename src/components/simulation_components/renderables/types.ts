import type { PhysicsBody, Vec2 } from '../../../physics/types';
import type { WorldToCanvas } from '../../../lib/worldToCanvas';

// ============================================================================
// Internal renderable model. Renderables are auto-synthesized from the
// simulation config now that user-facing schema no longer carries them — these
// types describe the in-memory shape passed to the render layer.
// ============================================================================

export type PositionSource =
  | { type: 'body'; bodyId: string; followAngle?: boolean }
  | { type: 'data'; dataId: string }
  | { type: 'fixed'; x: number; y: number; angle?: number };

export interface ShapeVisual {
  type: 'shape';
  shape: 'circle' | 'rectangle' | 'polygon';
  color: string;
  width?: number;
  height?: number;
  radius?: number;
  sides?: number;
  stroke?: string;
  strokeWidth?: number;
}

export interface ImageVisual {
  type: 'image';
  src: string;
  width: number;
  height: number;
}

export interface RenderableVisual {
  type: 'renderable';
  name: string;
  width: number;
  height: number;
}

export type Visual = ShapeVisual | ImageVisual | RenderableVisual;

/**
 * Internal marker visual used by auto-synthesized experimental-data renderables.
 */
export interface MarkerVisual {
  type: 'marker';
  shape: 'circle' | 'rectangle';
  color: string;
  pixelSize: number;
}

/**
 * Internal body-outline visual. Draws the physics body's SI ShapeDescriptor,
 * converted via WorldToCanvas. Currently used for debug overlays.
 */
export interface BodyOutlineVisual {
  type: 'body-outline';
  color: string;
}

/**
 * Internal force-arrow visual. Draws net-force arrows on a physics body
 * using live SI acceleration data.
 */
export interface ForceArrowVisual {
  type: 'force-arrow';
  /** Pixels per Newton — controls arrow length scaling */
  pixelsPerNewton: number;
}

/**
 * All visuals RenderLayer can draw.
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
