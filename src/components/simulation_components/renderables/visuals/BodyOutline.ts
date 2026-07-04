import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';
import type { ShapeDescriptor } from '../../../../physics/types';

/**
 * Draws the outline of a physics body using its SI ShapeDescriptor, converted
 * to canvas pixels via the DrawContext's WorldToCanvas. Works for all body
 * shapes (circle, rectangle, polygon, compound).
 *
 * With `debugParts` set (the `?colliders=1` observation overlay), each part of
 * the shape is drawn in a distinct palette color with a per-part vertex-count
 * readout. Because `body.shape` for a concave `type:"convex"` manifest
 * collider IS the decomposed compound, this renders the poly-decomp split
 * directly — the engine-truth geometry, not the authored outline.
 */

// One color per decomposed part so the split is legible at a glance.
const PART_PALETTE = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4',
  '#f032e6', '#808000', '#9a6324', '#469990', '#800000', '#000075',
];

// Planck's Settings.maxPolygonVertices. A part above this is SILENTLY
// truncated (first 12 vertices kept, order-dependent) and re-hulled by Planck
// — a wrong collider with no thrown error. Rapier re-hulls safely. The
// overlay's job is to make that silent break loud.
const PLANCK_MAX_POLYGON_VERTS = 12;

function drawBodyOutline(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'body-outline') return;
  const { ctx, body, opacity, position, w2c } = drawCtx;
  if (!body) return;

  ctx.save();
  ctx.globalAlpha = opacity;

  ctx.translate(position.x, position.y);
  ctx.rotate(position.angle);

  if (visual.debugParts) {
    drawDebugParts(ctx, body.shape, w2c, position.angle);
  } else {
    ctx.fillStyle = visual.color;
    drawShape(ctx, body.shape, w2c);
  }

  ctx.restore();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeDescriptor,
  w2c: { dimension: (m: number) => number },
) {
  switch (shape.type) {
    case 'circle': {
      const r = w2c.dimension(shape.radius);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'rectangle': {
      const w = w2c.dimension(shape.width);
      const h = w2c.dimension(shape.height);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      return;
    }
    case 'polygon': {
      tracePolygon(ctx, shape.vertices, w2c);
      ctx.fill();
      return;
    }
    case 'compound': {
      for (const part of shape.parts) drawShape(ctx, part, w2c);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Collider-observation mode

function drawDebugParts(
  ctx: CanvasRenderingContext2D,
  shape: ShapeDescriptor,
  w2c: { dimension: (m: number) => number },
  bodyAngle: number,
) {
  const parts = shape.type === 'compound' ? shape.parts : [shape];

  parts.forEach((part, i) => {
    const color = PART_PALETTE[i % PART_PALETTE.length];
    if (!tracePart(ctx, part, w2c)) return;

    ctx.save();
    ctx.globalAlpha *= 0.25;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (part.type === 'polygon' && part.vertices.length > 0) {
      const n = part.vertices.length;
      const cx = part.vertices.reduce((s, v) => s + v.x, 0) / n;
      const cy = part.vertices.reduce((s, v) => s + v.y, 0) / n;
      drawLabel(
        ctx,
        w2c.dimension(cx),
        -w2c.dimension(cy),
        String(n),
        n > PLANCK_MAX_POLYGON_VERTS,
        bodyAngle,
      );
    }
  });

  // Compound-complexity signal: total fixture count on the body, pinned just
  // above the shape's top extent so it doesn't collide with part counts.
  if (shape.type === 'compound') {
    const topPx = w2c.dimension(shapeTopExtent(shape));
    drawLabel(ctx, 0, -(topPx + 10), `${shape.parts.length} parts`, false, bodyAngle);
  }
}

/** Build the part's path. Returns false for parts it can't trace. */
function tracePart(
  ctx: CanvasRenderingContext2D,
  part: ShapeDescriptor,
  w2c: { dimension: (m: number) => number },
): boolean {
  switch (part.type) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, w2c.dimension(part.radius), 0, Math.PI * 2);
      return true;
    case 'rectangle': {
      const w = w2c.dimension(part.width);
      const h = w2c.dimension(part.height);
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      return true;
    }
    case 'polygon':
      if (part.vertices.length === 0) return false;
      tracePolygon(ctx, part.vertices, w2c);
      return true;
    case 'compound':
      // Nested compounds don't occur (decomposition emits flat part lists).
      return false;
  }
}

function tracePolygon(
  ctx: CanvasRenderingContext2D,
  verts: Array<{ x: number; y: number }>,
  w2c: { dimension: (m: number) => number },
) {
  ctx.beginPath();
  // Y-flip vertices so local SI Y-up matches the already-rotated canvas frame.
  ctx.moveTo(w2c.dimension(verts[0].x), -w2c.dimension(verts[0].y));
  for (let i = 1; i < verts.length; i++) {
    ctx.lineTo(w2c.dimension(verts[i].x), -w2c.dimension(verts[i].y));
  }
  ctx.closePath();
}

/** Highest local-frame Y (SI) any part reaches — for pinning the parts label. */
function shapeTopExtent(shape: ShapeDescriptor): number {
  switch (shape.type) {
    case 'circle': return shape.radius;
    case 'rectangle': return shape.height / 2;
    case 'polygon': return Math.max(0, ...shape.vertices.map((v) => v.y));
    case 'compound': return Math.max(0, ...shape.parts.map(shapeTopExtent));
  }
}

/** Counter-rotated (always-horizontal) text with a white halo for contrast. */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  danger: boolean,
  bodyAngle: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-bodyAngle);
  ctx.font = danger ? 'bold 11px monospace' : '11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = danger ? '#dc2626' : '#111827';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

registerVisual('body-outline', drawBodyOutline);
