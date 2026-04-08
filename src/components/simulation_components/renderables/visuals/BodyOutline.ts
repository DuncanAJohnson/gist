import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';

/**
 * Draws the outline of a Matter.js body using its live world-space vertices.
 * This works for any body shape (rectangle, polygon, vertex, circle) because
 * Matter maintains body.vertices for all bodies. Circles are detected via
 * body.circleRadius and drawn as true arcs.
 *
 * Used for auto-synthesized default renderables that reproduce the exact
 * shape of the underlying physics body.
 */
function drawBodyOutline(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'body-outline') return;
  const { ctx, body, opacity } = drawCtx;
  if (!body) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = visual.color;

  const circleRadius = (body as unknown as { circleRadius?: number }).circleRadius;
  if (circleRadius) {
    ctx.beginPath();
    ctx.arc(body.position.x, body.position.y, circleRadius, 0, Math.PI * 2);
    ctx.fill();
  } else if (body.parts && body.parts.length > 1) {
    // Compound body (e.g. vertex-decomposed concave polygons) — draw each part.
    for (let p = 1; p < body.parts.length; p++) {
      const part = body.parts[p];
      ctx.beginPath();
      ctx.moveTo(part.vertices[0].x, part.vertices[0].y);
      for (let i = 1; i < part.vertices.length; i++) {
        ctx.lineTo(part.vertices[i].x, part.vertices[i].y);
      }
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(body.vertices[0].x, body.vertices[0].y);
    for (let i = 1; i < body.vertices.length; i++) {
      ctx.lineTo(body.vertices[i].x, body.vertices[i].y);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

registerVisual('body-outline', drawBodyOutline);
