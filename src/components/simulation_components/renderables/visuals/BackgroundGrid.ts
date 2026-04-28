import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';

const DEFAULT_TARGET_MAJOR_PX = 80;
const DEFAULT_MINOR_PER_MAJOR = 5;
const DEFAULT_MAJOR_COLOR = 'rgba(0,0,0,0.08)';
const DEFAULT_MINOR_COLOR = 'rgba(0,0,0,0.035)';
const DEFAULT_LABEL_COLOR = 'rgba(0,0,0,0.4)';
const LABEL_FONT = '10px system-ui, sans-serif';
const LABEL_PAD = 2;

/**
 * Snap a positive raw value to the nearest 1/2/5×10ⁿ. Used to pick a major
 * grid step that stays readable across orders of magnitude — the user sees
 * lines at 0.5, 1, 2, 5, 10, 20, ... rather than arbitrary numbers as the
 * configured pixelsPerUnit changes.
 */
function niceStep(raw: number): number {
  if (!(raw > 0) || !isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const frac = raw / Math.pow(10, exp);
  const niceFrac = frac < 1.5 ? 1 : frac < 3.5 ? 2 : frac < 7.5 ? 5 : 10;
  return niceFrac * Math.pow(10, exp);
}

/**
 * Draws a graph-paper grid behind the simulation. Anchored at the world origin
 * (resolved by the position source — `{type:'fixed', x:0, y:0}` puts it at the
 * bottom-left of the play area), extends `playWidthPx` right and `playHeightPx`
 * up. Major and minor lines are stepped in user units (m, ft, etc.) so labels
 * read in the sim's configured unit, not raw SI meters.
 */
function drawBackgroundGrid(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'background-grid') return;
  const { ctx, position, opacity } = drawCtx;
  const {
    pixelsPerUnit,
    unitLabel,
    playWidthPx,
    playHeightPx,
    targetMajorPx = DEFAULT_TARGET_MAJOR_PX,
    minorPerMajor = DEFAULT_MINOR_PER_MAJOR,
    majorColor = DEFAULT_MAJOR_COLOR,
    minorColor = DEFAULT_MINOR_COLOR,
    labelColor = DEFAULT_LABEL_COLOR,
    showLabels = true,
  } = visual;

  if (
    !(pixelsPerUnit > 0) ||
    !isFinite(pixelsPerUnit) ||
    playWidthPx <= 0 ||
    playHeightPx <= 0
  ) {
    return;
  }

  // niceStep input is in user units: target_px / (px per unit) → unit step.
  const majorUserStep = niceStep(targetMajorPx / pixelsPerUnit);
  const majorPx = majorUserStep * pixelsPerUnit;
  const minorPx = majorPx / minorPerMajor;
  // Decimal places the labels need when the major step is sub-unit (e.g. 0.5 m).
  const decimals = Math.max(0, -Math.floor(Math.log10(majorUserStep)));

  // World origin in canvas space — every line is positioned relative to here.
  const ox = position.x;
  const oy = position.y;
  const left = ox;
  const right = ox + playWidthPx;
  const top = oy - playHeightPx;
  const bottom = oy;

  ctx.save();
  ctx.globalAlpha = opacity;

  // Clip to the play area so lines and labels never bleed into the wall borders.
  ctx.beginPath();
  ctx.rect(left, top, playWidthPx, playHeightPx);
  ctx.clip();

  ctx.lineWidth = 1;
  // Minor first so major lines paint over them at the intersections.
  ctx.strokeStyle = minorColor;
  drawGridLines(ctx, ox, oy, minorPx, left, right, top, bottom);
  ctx.strokeStyle = majorColor;
  drawGridLines(ctx, ox, oy, majorPx, left, right, top, bottom);

  if (showLabels) {
    ctx.fillStyle = labelColor;
    ctx.font = LABEL_FONT;
    drawAxisLabels(
      ctx,
      ox,
      oy,
      majorPx,
      majorUserStep,
      decimals,
      unitLabel,
      left,
      right,
      top,
      bottom,
      drawCtx.viewport,
    );
  }

  ctx.restore();
}

/**
 * Axis-aligned lines spaced `step` canvas-pixels apart, anchored at (ox, oy),
 * within [left, right] × [top, bottom]. The `+ 0.5` keeps 1px lines crisp on
 * integer-DPI displays — without it canvas anti-aliases each line into a 2px
 * blur.
 */
function drawGridLines(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  step: number,
  left: number,
  right: number,
  top: number,
  bottom: number,
) {
  if (step <= 0.5) return; // Avoid pathological tight loops at extreme zoom.

  // k indexes lines relative to the world origin.
  const minKx = Math.ceil((left - ox) / step);
  const maxKx = Math.floor((right - ox) / step);
  for (let k = minKx; k <= maxKx; k++) {
    const px = Math.round(ox + k * step) + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px, bottom);
    ctx.stroke();
  }

  // Positive k = above origin in world space, which is smaller canvas y.
  const minKy = Math.ceil((oy - bottom) / step);
  const maxKy = Math.floor((oy - top) / step);
  for (let k = minKy; k <= maxKy; k++) {
    const py = Math.round(oy - k * step) + 0.5;
    ctx.beginPath();
    ctx.moveTo(left, py);
    ctx.lineTo(right, py);
    ctx.stroke();
  }
}

/**
 * Numeric axis labels anchored to the visible portion of the play area —
 * i.e. (play area) ∩ (viewport). X-labels sit just above the visible bottom
 * edge; Y-labels just right of the visible left edge. As the user scrolls a
 * zoomed canvas, labels stay pinned to the visible corner and their *values*
 * update to reflect whatever world coordinates that corner now shows. The Y
 * k=0 label is skipped because X k=0 already labels the origin when both
 * axes' zero lines are visible together.
 */
function drawAxisLabels(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  majorPx: number,
  majorUserStep: number,
  decimals: number,
  unitLabel: string,
  left: number,
  right: number,
  top: number,
  bottom: number,
  viewport: { left: number; top: number; width: number; height: number },
) {
  // Intersection of play area and viewport in canvas pixels. Labels live on
  // these edges so they track scroll position without ever drifting outside
  // the play area.
  const visLeft = Math.max(left, viewport.left);
  const visRight = Math.min(right, viewport.left + viewport.width);
  const visTop = Math.max(top, viewport.top);
  const visBottom = Math.min(bottom, viewport.top + viewport.height);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const minKx = Math.ceil((visLeft - ox) / majorPx);
  const maxKx = Math.floor((visRight - ox) / majorPx);
  for (let k = minKx; k <= maxKx; k++) {
    const x = ox + k * majorPx;
    const value = k * majorUserStep;
    ctx.fillText(formatLabel(value, decimals, unitLabel), x + LABEL_PAD, visBottom - LABEL_PAD);
  }

  ctx.textBaseline = 'middle';
  const minKy = Math.ceil((oy - visBottom) / majorPx);
  const maxKy = Math.floor((oy - visTop) / majorPx);
  for (let k = minKy; k <= maxKy; k++) {
    if (k === 0) continue;
    const y = oy - k * majorPx;
    const value = k * majorUserStep;
    ctx.fillText(formatLabel(value, decimals, unitLabel), visLeft + LABEL_PAD, y);
  }
}

function formatLabel(value: number, decimals: number, unitLabel: string): string {
  const num = value.toFixed(decimals);
  return unitLabel ? `${num} ${unitLabel}` : num;
}

registerVisual('background-grid', drawBackgroundGrid);
