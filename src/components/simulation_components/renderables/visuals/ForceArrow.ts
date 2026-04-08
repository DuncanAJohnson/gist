import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';

const ARROW_COLOR = '#e74c3c';
const ARROW_HEAD_LENGTH = 12;
const ARROW_HEAD_ANGLE = Math.PI / 6; // 30 degrees
const ARROW_LINE_WIDTH = 3;
const MIN_ARROW_LENGTH = 8; // Don't draw arrows shorter than this

/**
 * Draws a force arrow on a physics body.
 *
 * Combines two sources:
 * - (body as any).gravityAcceleration — gravitational acceleration, always present
 * - (body as any).acceleration — delta-v acceleration capturing transient forces
 *
 * Both are in pixel-space, set each frame by JsonSimulation's handleUpdate.
 * Force = mass * acceleration. The arrow is drawn from the body centre in
 * the direction of total force, with length proportional to magnitude.
 */
function drawForceArrow(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'force-arrow') return;
  const { ctx, body, opacity } = drawCtx;
  if (!body) return;

  const acc = (body as any).acceleration as { x: number; y: number } | undefined;
  const gravAcc = (body as any).gravityAcceleration as { x: number; y: number } | undefined;
  if (!acc && !gravAcc) return;

  // F = m * a (acceleration is in pixels/frame², force in pixel-scaled units)
  // Include both the delta-v acceleration and the gravitational acceleration.
  // Delta-v captures transient forces (collisions, impulses) but loses gravity
  // for resting bodies, so we add gravity explicitly.
  let fx = 0;
  let fy = 0;
  if (gravAcc) {
    fx += body.mass * gravAcc.x;
    fy += body.mass * gravAcc.y;
  }
  if (acc) {
    fx += body.mass * acc.x;
    fy += body.mass * acc.y;
  }

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
