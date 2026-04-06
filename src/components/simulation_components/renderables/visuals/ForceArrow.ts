import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';

const ARROW_COLOR = '#e74c3c';
const ARROW_HEAD_LENGTH = 12;
const ARROW_HEAD_ANGLE = Math.PI / 6; // 30 degrees
const ARROW_LINE_WIDTH = 3;
const MIN_ARROW_LENGTH = 8; // Don't draw arrows shorter than this

/**
 * Draws a net-force arrow on a physics body.
 *
 * Reads (body as any).acceleration (pixel-space, set each frame by
 * JsonSimulation's handleUpdate) and body.mass to compute F = m * a.
 * The arrow is drawn from the body centre in the direction of net force,
 * with length proportional to magnitude.
 */
function drawForceArrow(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'force-arrow') return;
  const { ctx, body, opacity } = drawCtx;
  if (!body) return;

  const acc = (body as any).acceleration as { x: number; y: number } | undefined;
  if (!acc) return;

  // F = m * a (acceleration is in pixels/frame², force in pixel-scaled units)
  const fx = body.mass * acc.x;
  const fy = body.mass * acc.y;

  const magnitude = Math.sqrt(fx * fx + fy * fy);
  const arrowLength = magnitude * visual.pixelsPerNewton;
  if (arrowLength < MIN_ARROW_LENGTH) return;

  const angle = Math.atan2(fy, fx);
  const cx = body.position.x;
  const cy = body.position.y;
  const ex = cx + Math.cos(angle) * arrowLength;
  const ey = cy + Math.sin(angle) * arrowLength;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = ARROW_COLOR;
  ctx.fillStyle = ARROW_COLOR;
  ctx.lineWidth = ARROW_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Shaft
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(
    ex - ARROW_HEAD_LENGTH * Math.cos(angle - ARROW_HEAD_ANGLE),
    ey - ARROW_HEAD_LENGTH * Math.sin(angle - ARROW_HEAD_ANGLE),
  );
  ctx.lineTo(
    ex - ARROW_HEAD_LENGTH * Math.cos(angle + ARROW_HEAD_ANGLE),
    ey - ARROW_HEAD_LENGTH * Math.sin(angle + ARROW_HEAD_ANGLE),
  );
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

registerVisual('force-arrow', drawForceArrow);
