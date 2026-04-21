import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';
import { loadImage } from './imageCache';

// Build name → path lookup from the bundled manifest.
const nameToPath = new Map<string, string>();
fetch('/renderables/manifest.json')
  .then(r => r.json())
  .then((data: { items: { name: string; status?: string }[] }) => {
    for (const entry of data.items) {
      if (entry.status && entry.status !== 'approved') continue;
      nameToPath.set(entry.name, `/renderables/${entry.name}.svg`);
    }
  });

function drawRenderable(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'renderable') return;
  const path = nameToPath.get(visual.name);
  if (!path) return;

  const img = loadImage(path);
  if (!img.complete || img.naturalWidth === 0) return;

  const { ctx, position, opacity, w2c } = drawCtx;
  const w = w2c.dimension(visual.width);
  const h = w2c.dimension(visual.height);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(position.x, position.y);
  ctx.rotate(position.angle);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

registerVisual('renderable', drawRenderable);
