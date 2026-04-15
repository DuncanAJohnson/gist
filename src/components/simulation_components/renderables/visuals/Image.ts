import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';
import { loadImage } from './imageCache';

function drawImageVisual(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'image') return;
  const { ctx, position, opacity, w2c } = drawCtx;
  const img = loadImage(visual.src);
  if (!img.complete || img.naturalWidth === 0) return;

  const w = w2c.dimension(visual.width);
  const h = w2c.dimension(visual.height);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(position.x, position.y);
  ctx.rotate(position.angle);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

registerVisual('image', drawImageVisual);
