import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';

/**
 * Draws the experimental-data marker (filled shape plus a slightly-more-opaque
 * border). Matches the legacy ExperimentalDataRenderer's appearance exactly.
 */
function drawMarker(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'marker') return;
  const { ctx, position, opacity } = drawCtx;
  const size = visual.pixelSize;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = visual.color;

  if (visual.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(position.x, position.y, size, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(position.x - size, position.y - size, size * 2, size * 2);
  }

  ctx.globalAlpha = Math.min(opacity + 0.2, 1);
  ctx.strokeStyle = visual.color;
  ctx.lineWidth = 1.5;
  if (visual.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(position.x, position.y, size, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeRect(position.x - size, position.y - size, size * 2, size * 2);
  }

  ctx.restore();
}

registerVisual('marker', drawMarker);
