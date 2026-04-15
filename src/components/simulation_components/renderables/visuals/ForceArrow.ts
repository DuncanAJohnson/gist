import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';
import type { Vec2 } from '../../../../physics/types';

const ARROW_COLOR = '#e74c3c';
const ARROW_HEAD_LENGTH = 12;
const ARROW_HEAD_ANGLE = Math.PI / 6;
const ARROW_LINE_WIDTH = 3;
const MIN_ARROW_LENGTH = 8;

/**
 * Draws a force arrow on a physics body. All inputs are SI:
 * - body.userData.derivedAcceleration: finite-difference m/s² from JsonSimulation
 * - drawCtx.gravity: gravitational acceleration in m/s²
 * - body.mass: kg
 *
 * F = m · (a_derived + g) in Newtons. Arrow length = |F| · pixelsPerNewton.
 */
function drawForceArrow(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'force-arrow') return;
  const { ctx, body, opacity, position, gravity } = drawCtx;
  if (!body) return;

  const derived = (body.userData.derivedAcceleration as Vec2 | undefined) ?? { x: 0, y: 0 };
  const ax = derived.x + gravity.x;
  const ay = derived.y + gravity.y;

  const fx = body.mass * ax;
  const fy = body.mass * ay;

  const magnitude = Math.sqrt(fx * fx + fy * fy);
  const arrowLength = magnitude * visual.pixelsPerNewton;
  if (arrowLength < MIN_ARROW_LENGTH) return;

  // SI force (Y-up) → canvas direction (Y-down): flip fy sign.
  const angle = Math.atan2(-fy, fx);
  const cx = position.x;
  const cy = position.y;
  const ex = cx + Math.cos(angle) * arrowLength;
  const ey = cy + Math.sin(angle) * arrowLength;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = ARROW_COLOR;
  ctx.fillStyle = ARROW_COLOR;
  ctx.lineWidth = ARROW_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

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
