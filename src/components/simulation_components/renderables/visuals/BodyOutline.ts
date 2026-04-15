import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';
import type { ShapeDescriptor } from '../../../../physics/types';

/**
 * Draws the outline of a physics body using its SI ShapeDescriptor, converted
 * to canvas pixels via the DrawContext's WorldToCanvas. Works for all body
 * shapes (circle, rectangle, polygon, compound).
 */
function drawBodyOutline(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'body-outline') return;
  const { ctx, body, opacity, position, w2c } = drawCtx;
  if (!body) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = visual.color;

  ctx.translate(position.x, position.y);
  ctx.rotate(position.angle);

  drawShape(ctx, body.shape, w2c);

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
      const verts = shape.vertices;
      if (verts.length === 0) return;
      ctx.beginPath();
      // Y-flip vertices so local SI Y-up matches the already-rotated canvas frame.
      ctx.moveTo(w2c.dimension(verts[0].x), -w2c.dimension(verts[0].y));
      for (let i = 1; i < verts.length; i++) {
        ctx.lineTo(w2c.dimension(verts[i].x), -w2c.dimension(verts[i].y));
      }
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'compound': {
      for (const part of shape.parts) drawShape(ctx, part, w2c);
      return;
    }
  }
}

registerVisual('body-outline', drawBodyOutline);
