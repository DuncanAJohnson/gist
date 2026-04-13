import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';
import { loadImage } from './imageCache';

// Build name → path lookup from the bundled manifest.
// Eagerly fetched at module load; the manifest is tiny and local so it resolves
// nearly instantly. If the draw function fires before it resolves, the name
// simply won't be found and drawing is skipped (same as a not-yet-loaded image).
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

  const { ctx, position, opacity } = drawCtx;
  const w = visual.width;
  const h = visual.height;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(position.x, position.y);
  ctx.rotate(position.angle);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

registerVisual('renderable', drawRenderable);
