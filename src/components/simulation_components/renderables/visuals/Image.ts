import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): HTMLImageElement {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imageCache.set(src, img);
  }
  return img;
}

function drawImageVisual(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'image') return;
  const { ctx, position, opacity } = drawCtx;
  const img = loadImage(visual.src);
  if (!img.complete || img.naturalWidth === 0) return;

  // visual.width / visual.height are pre-converted to canvas pixels by JsonSimulation
  const w = visual.width;
  const h = visual.height;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(position.x, position.y);
  ctx.rotate(position.angle);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

registerVisual('image', drawImageVisual);
