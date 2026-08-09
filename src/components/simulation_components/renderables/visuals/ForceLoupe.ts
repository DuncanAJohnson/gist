/**
 * Force loupe (PROTOTYPE — debug-only, `?loupe=1` or the debug-panel checkbox).
 *
 * A DISCLOSED, local, per-body force rescale for bodies whose entire free-body
 * diagram is sub-threshold at the shared canvas scale (2 px/N). The feather in
 * `bowlingBallAndFeather` weighs 0.098 N → a 0.2 px arrow, so every one of its
 * arrows collapses to an identical sub-floor stub while the bowling ball beside
 * it draws a 98 px weight. Direction survives; proportion — the thing an FBD
 * exists to show — does not.
 *
 * Design decisions (see /docs/vector-arrows "Force loupe" and
 * Notes_on_Applied_Forces_Refactor.md Findings 2026-08-08):
 *
 *  - The body inside the loupe is a DOT — the particle model, the actual FBD
 *    convention. A magnifying glass magnifies SPACE; we are changing FORCE
 *    scale. The dot makes the absence of a spatial claim explicit.
 *  - A LABELLED SCALE BAR, not a "×500" factor (micrograph/map convention).
 *    It is the honesty device that makes per-body scaling legitimate rather
 *    than silent.
 *  - Scale is normalized to the body's WEIGHT (m·g), which is constant for a
 *    given body, so the scale does NOT change while scrubbing. Normalizing to
 *    the largest live force would make growth look like rescaling.
 *  - Closure survives: the loupe's interior is exactly one body, and forces are
 *    only ever summed on one body, so head-to-tail closure is untouched.
 *
 * Purely render-side: no physics, no Frame schema change. Reads the same
 * `body.userData` fields VectorArrow does, so it is identical in live, replay
 * and scrub without extra wiring.
 */
import type { DrawContext, PixelVisual } from '../types';
import { registerVisual } from '../registry';
import {
  VECTOR_COLORS,
  VECTOR_DEFAULT_SCALES,
  VECTOR_GEOMETRY,
  VECTOR_LABELS,
  type VectorKind,
} from '../vectorTheme';

type V2 = { x: number; y: number };

/** Kinds the prototype draws, in draw order. */
const LOUPE_KINDS: VectorKind[] = ['force-gravity', 'force-drag', 'force-net'];

const DEFAULT_RADIUS_PX = 62;
/** Fraction of the radius the REFERENCE force (weight) spans. */
const TARGET_FRAC = 0.7;
/** How far right of the dot the net is offset, so it doesn't lie on the weight. */
const NET_OFFSET_FRAC = 0.5;

function forceFor(kind: VectorKind, drawCtx: DrawContext): V2 {
  const body = drawCtx.body!;
  if (kind === 'force-gravity') {
    return { x: body.mass * drawCtx.gravity.x, y: body.mass * drawCtx.gravity.y };
  }
  if (kind === 'force-drag') {
    return (body.userData.dragForce as V2 | undefined) ?? { x: 0, y: 0 };
  }
  if (kind === 'force-net') {
    const a = (body.userData.derivedAcceleration as V2 | undefined) ?? { x: 0, y: 0 };
    return { x: body.mass * a.x, y: body.mass * a.y };
  }
  if (kind === 'force-normal') {
    return (body.userData.normalForce as V2 | undefined) ?? { x: 0, y: 0 };
  }
  if (kind === 'force-friction') {
    return (body.userData.frictionForce as V2 | undefined) ?? { x: 0, y: 0 };
  }
  return { x: 0, y: 0 };
}

/** 1/2/5×10ⁿ snap — same idiom as BackgroundGrid's niceStep. */
function niceValue(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const pow = Math.pow(10, exp);
  const frac = raw / pow;
  const snapped = frac < 1.5 ? 1 : frac < 3.5 ? 2 : frac < 7.5 ? 5 : 10;
  return snapped * pow;
}

function haloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  fontSize: number,
) {
  ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Compact arrow in raw canvas px. Angle is already canvas-frame (Y-down). */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  tailX: number,
  tailY: number,
  angle: number,
  len: number,
  color: string,
) {
  const head = Math.min(VECTOR_GEOMETRY.headLength, Math.max(6, len * 0.35));
  const headA = VECTOR_GEOMETRY.headAngleRad;
  const ex = tailX + Math.cos(angle) * len;
  const ey = tailY + Math.sin(angle) * len;
  const backoff = head * Math.cos(headA);
  const sx = tailX + Math.cos(angle) * Math.max(0, len - backoff);
  const sy = tailY + Math.sin(angle) * Math.max(0, len - backoff);

  ctx.strokeStyle = color;
  ctx.lineWidth = VECTOR_GEOMETRY.lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(sx, sy);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - head * Math.cos(angle - headA), ey - head * Math.sin(angle - headA));
  ctx.lineTo(ex - head * Math.cos(angle + headA), ey - head * Math.sin(angle + headA));
  ctx.closePath();
  ctx.fill();
  return { ex, ey };
}

function drawForceLoupe(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'force-loupe') return;
  const { ctx, body, position } = drawCtx;
  if (!body) return;

  const kinds = visual.kinds ?? LOUPE_KINDS;
  const weight = Math.hypot(body.mass * drawCtx.gravity.x, body.mass * drawCtx.gravity.y);
  if (!(weight > 0)) return; // static / massless — nothing to normalize against

  // TRIGGER: only bodies whose LARGEST force arrow is under the render floor,
  // i.e. the whole diagram is illegible — not merely one component of it.
  const forces = kinds.map((k) => ({ kind: k, f: forceFor(k, drawCtx) }));
  const largestCanvasPx = Math.max(
    ...forces.map(({ kind, f }) => Math.hypot(f.x, f.y) * VECTOR_DEFAULT_SCALES[kind]),
  );
  if (largestCanvasPx >= VECTOR_GEOMETRY.minPixelLength) return;

  const r = visual.radiusPx ?? DEFAULT_RADIUS_PX;
  // Normalize to WEIGHT so the interior scale is constant across the whole run.
  const scale = (r * TARGET_FRAC) / weight;

  // ---- placement: offset from the body, flipped/clamped to stay on canvas ----
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const pad = 20;
  let lx = position.x + r + pad;
  let ly = position.y + r + pad;
  // Bottom reserve covers the whole caption stack below the lens edge:
  // bar (+12), value (+24), id (+38), plus descender room.
  const CAPTION_PX = 44;
  if (lx + r + 6 > W) lx = position.x - r - pad;
  if (ly + r + CAPTION_PX > H) ly = position.y - r - pad;
  lx = Math.max(r + 6, Math.min(W - r - 6, lx));
  ly = Math.max(r + 8, Math.min(H - r - CAPTION_PX, ly));

  ctx.save();

  // ---- leader line: body → loupe edge ----
  const dx = lx - position.x;
  const dy = ly - position.y;
  const d = Math.hypot(dx, dy) || 1;
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(position.x, position.y);
  ctx.lineTo(lx - (dx / d) * r, ly - (dy / d) * r);
  ctx.stroke();
  ctx.setLineDash([]);

  // ---- the lens ----
  ctx.beginPath();
  ctx.arc(lx, ly, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.fill();
  ctx.strokeStyle = '#6b7280';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ---- arrows from the particle ----
  for (const { kind, f } of forces) {
    const mag = Math.hypot(f.x, f.y);
    const len = mag * scale;
    if (len < 1) continue; // exactly-zero stays blank (equilibrium reads as absence of an arrow)
    const angle = Math.atan2(-f.y, f.x); // SI Y-up → canvas Y-down
    // Net is drawn offset so it doesn't lie on top of the collinear weight.
    const tailX = kind === 'force-net' ? lx + r * NET_OFFSET_FRAC : lx;
    const tailY = kind === 'force-net' ? ly - r * 0.28 : ly;
    if (kind === 'force-net') {
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tailX - 6, tailY);
      ctx.lineTo(tailX + 6, tailY);
      ctx.stroke();
    }
    const { ex, ey } = drawArrow(ctx, tailX, tailY, angle, len, VECTOR_COLORS[kind]);
    const lab = VECTOR_LABELS[kind];
    const text = lab.sub ? `${lab.main}${lab.sub}` : lab.main;
    haloText(ctx, text, ex + Math.cos(angle) * 10, ey + Math.sin(angle) * 10, VECTOR_COLORS[kind], 11);
  }

  // ---- the particle: body reduced to a point ----
  ctx.beginPath();
  ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#111827';
  ctx.fill();

  // ---- scale bar: the honesty device ----
  // Snap near the WEIGHT so the bar reads as "the weight arrow is about this
  // much" — a bar longer than the largest arrow is confusing.
  const barValue = niceValue(weight);
  const barPx = barValue * scale;
  const barY = ly + r + 12;
  const bx = lx - barPx / 2;
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx, barY);
  ctx.lineTo(bx + barPx, barY);
  ctx.moveTo(bx, barY - 4);
  ctx.lineTo(bx, barY + 4);
  ctx.moveTo(bx + barPx, barY - 4);
  ctx.lineTo(bx + barPx, barY + 4);
  ctx.stroke();
  const label = barValue < 0.01 ? `${(barValue * 1000).toFixed(0)} mN` : `${barValue} N`;
  haloText(ctx, label, lx, barY + 12, '#374151', 10);

  // ---- body id: caption stack, BELOW the scale bar ----
  // Never inside the lens: an up-pointing arrow's label lands within a few px
  // of the lens's top edge (F_ar at ly−53 vs a top-anchored id at ly−50), so
  // the interior is reserved for the diagram and all metadata sits under it —
  // the figure/caption convention.
  haloText(ctx, body.id, lx, barY + 26, '#6b7280', 10);

  ctx.restore();
}

registerVisual('force-loupe', drawForceLoupe);
