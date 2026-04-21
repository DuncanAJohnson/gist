import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';

function drawShape(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'shape') return;
  const { ctx, position, opacity, w2c } = drawCtx;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(position.x, position.y);
  ctx.rotate(position.angle);
  ctx.fillStyle = visual.color;

  if (visual.shape === 'circle') {
    const r = w2c.dimension(visual.radius ?? 1);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    if (visual.stroke) {
      ctx.strokeStyle = visual.stroke;
      ctx.lineWidth = visual.strokeWidth ?? 1;
      ctx.stroke();
    }
  } else if (visual.shape === 'rectangle') {
    const w = w2c.dimension(visual.width ?? 2);
    const h = w2c.dimension(visual.height ?? 2);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    if (visual.stroke) {
      ctx.strokeStyle = visual.stroke;
      ctx.lineWidth = visual.strokeWidth ?? 1;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
  } else if (visual.shape === 'polygon') {
    const sides = visual.sides ?? 6;
    const r = w2c.dimension(visual.radius ?? 1);
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const theta = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(theta) * r;
      const y = Math.sin(theta) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    if (visual.stroke) {
      ctx.strokeStyle = visual.stroke;
      ctx.lineWidth = visual.strokeWidth ?? 1;
      ctx.stroke();
    }
  }

  ctx.restore();
}

registerVisual('shape', drawShape);
