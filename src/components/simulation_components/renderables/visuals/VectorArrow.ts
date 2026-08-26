import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';
import { resolveVectorKind } from '../../../../lib/vectorSources';
import {
  VECTOR_COLORS,
  VECTOR_DEFAULT_SCALES,
  VECTOR_GEOMETRY,
  VECTOR_LABELS,
  VECTOR_LABEL_DEFAULTS,
  type VectorKind,
  type VectorLabelDef,
} from '../vectorTheme';

/**
 * Generalized vector-arrow visual.
 *
 * Phase 1 wired `force-net`. Phase 2 adds `velocity` and `acceleration` (both
 * read directly from the body — kinematic state is on `body.velocity` and on
 * `body.userData.derivedAcceleration` in any mode, since Phase 1c-rev moved
 * kinematics into the Frame schema). FBD step 2 (Goal-1, 2026-07-24) un-stubs
 * the two data-ready force kinds: `force-gravity` (= m·g, from
 * `DrawContext.gravity`, an SI Y-up vector already pointing down) and
 * `force-drag` (the per-frame quadratic drag already vectorized onto
 * `body.userData.dragForce = −k·|v|·v`, populated only in air-resistance mode).
 * FBD step 3 (2026-08-06) wires `force-normal` and `force-friction` from the
 * engine contact-force seam: JsonSimulation stashes each frame's
 * `getContactForces()` readback on `userData.normalForce` / `userData.frictionForce`.
 * These are ENGINE-ACTUAL values (solver impulses / dt) — they jitter at
 * resting contact and read zero on sleeping bodies; the analytical display
 * model that may replace them student-facing is Goal-1 step 5, decided after
 * the step-4 representation spike. `force-applied` joined them 2026-08-09
 * (Goal-2 Phase 1, debug-panel source only) — every kind now has a source.
 *
 * For `force-net`, the source is Newton's 2nd Law:
 *   F_net = m · a_derived
 * where a_derived is the finite-differenced *total* acceleration written by
 * JsonSimulation each frame. Because a_derived already includes the effect of
 * gravity, no separate gravity term is added — adding one would double-count
 * (legacy bug, fixed in Phase 1b). For a body at rest, F_net is zero and the
 * arrow is suppressed; in free fall, F_net is the weight; with friction or
 * drag balancing an applied force at terminal velocity, F_net is again zero.
 */
function drawVectorArrow(drawCtx: DrawContext, visual: PixelVisual) {
  if (visual.type !== 'vector-arrow') return;
  const { ctx, body, opacity, position } = drawCtx;
  if (!body) return;

  const { kind } = visual;

  // Source resolution lives in `src/lib/vectorSources.ts` (moved there
  // 2026-08-14, when numeric readouts gained access to the same kinds). All
  // kinds read from the body or from `userData`, so the visual layer stays
  // mode-agnostic — the replay loop restores both from the Frame, and live
  // mode keeps them current via the engine step and handleUpdate. Reading
  // through that shared resolver is what guarantees an arrow and its numeric
  // readout can never disagree; see its header before inlining anything back.
  const source = resolveVectorKind(body, kind, drawCtx.gravity);
  let vx = source.x;
  let vy = source.y;

  // Component decomposition: an axis-locked visual zeroes the off-axis
  // component so only the vₓ or v_y leg is drawn (both originate at the body).
  // synthesize.ts fans a `components: true` entry into two of these.
  if (visual.axis === 'x') vy = 0;
  else if (visual.axis === 'y') vx = 0;

  const scale = visual.pixelsPerUnit ?? VECTOR_DEFAULT_SCALES[kind];
  const magnitude = Math.hypot(vx, vy);
  const arrowLen = magnitude * scale;

  // SI (Y-up) → canvas (Y-down): flip vy when computing the screen angle.
  const angle = Math.atan2(-vy, vx);
  const cx = position.x;
  const cy = position.y;
  const color = visual.color ?? VECTOR_COLORS[kind];

  if (arrowLen < VECTOR_GEOMETRY.minPixelLength) {
    // Sub-floor affordance (step-4 drive decision, Bill 2026-08-06): a FORCE
    // that is real but too small to draw at scale gets a fixed-length dashed
    // stub with a hollow head — direction true, magnitude "not to scale".
    // Without this, a block creeping just past breakaway showed NO net arrow
    // and read as equilibrium. Physically-zero forces (and all non-force
    // kinds) still draw nothing, keeping stuck vs. creeping distinct.
    if (!kind.startsWith('force-') || arrowLen <= VECTOR_GEOMETRY.subFloorZeroPx) return;
    drawSubFloorStub(drawCtx, kind, angle, cx, cy, color, visual.label, visual.axis, visual.labelFontSize);
    return;
  }

  const ex = cx + Math.cos(angle) * arrowLen;
  const ey = cy + Math.sin(angle) * arrowLen;

  // Stop the shaft at the BASE of the arrowhead (not the apex). Without this
  // the line's rounded cap pokes past the head's tip — a small "dot" artifact.
  const head = VECTOR_GEOMETRY.headLength;
  const headA = VECTOR_GEOMETRY.headAngleRad;
  const shaftBackoff = head * Math.cos(headA);
  const shaftLen = Math.max(0, arrowLen - shaftBackoff);
  const sx = cx + Math.cos(angle) * shaftLen;
  const sy = cy + Math.sin(angle) * shaftLen;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = VECTOR_GEOMETRY.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Shaft (ends at head base). Component legs are dashed to read distinctly
  // from the solid resultant; the arrowhead below stays filled either way.
  if (visual.axis) ctx.setLineDash(VECTOR_GEOMETRY.componentDash);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(sx, sy);
  ctx.stroke();
  if (visual.axis) ctx.setLineDash([]);

  // Filled arrowhead (apex at the true endpoint).
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - head * Math.cos(angle - headA), ey - head * Math.sin(angle - headA));
  ctx.lineTo(ex - head * Math.cos(angle + headA), ey - head * Math.sin(angle + headA));
  ctx.closePath();
  ctx.fill();

  // Label (shared resolution with the sub-floor stub path).
  const labelDef = resolveVectorLabel(visual.label, visual.axis, kind);
  if (labelDef !== null) {
    const fontSize = visual.labelFontSize ?? VECTOR_LABEL_DEFAULTS.fontSize;
    const placement = visual.labelPlacement ?? VECTOR_LABEL_DEFAULTS.placement;

    let baseX: number;
    let baseY: number;
    if (placement === 'tail') {
      baseX = cx;
      baseY = cy;
    } else if (placement === 'head') {
      baseX = ex;
      baseY = ey;
    } else {
      baseX = (cx + ex) / 2;
      baseY = (cy + ey) / 2;
    }

    const offset = VECTOR_LABEL_DEFAULTS.perpendicularOffsetPx + fontSize * 0.4;
    // Perpendicular to the arrow's left side.
    const perpX = -Math.sin(angle) * offset;
    const perpY = Math.cos(angle) * offset;

    // For 'head' placement, push the label past the arrowhead instead.
    const labelX =
      placement === 'head' ? ex + Math.cos(angle) * (head + offset) : baseX + perpX;
    const labelY =
      placement === 'head' ? ey + Math.sin(angle) * (head + offset) : baseY + perpY;

    drawSubscriptedLabel(ctx, labelDef, labelX, labelY, fontSize, color);
  }

  ctx.restore();
}

/**
 * Shared label resolution. For a component leg with no explicit override,
 * derives a subscripted label from the kind's default by appending the axis
 * (v → vₓ / v_y; F_net → F_net,x / F_net,y). An author-supplied label is
 * respected verbatim; an explicit null suppresses the label.
 */
function resolveVectorLabel(
  label: string | VectorLabelDef | null | undefined,
  axis: 'x' | 'y' | undefined,
  kind: VectorKind,
): VectorLabelDef | string | null {
  if (label === null) return null;
  if (label !== undefined) return label;
  const base = VECTOR_LABELS[kind];
  if (axis) return { main: base.main, sub: base.sub ? `${base.sub},${axis}` : axis };
  return base;
}

/**
 * Sub-floor force stub: fixed-length dashed shaft + HOLLOW (stroked, never
 * filled) arrowhead, drawn slightly faded. Signals "this force is real and
 * points this way, but its magnitude is below the display floor" — used only
 * for force kinds whose true arrow length lands in (subFloorZeroPx,
 * minPixelLength). The open head and dash pattern (tighter than the
 * component-leg dash) are the not-to-scale markers.
 */
function drawSubFloorStub(
  drawCtx: DrawContext,
  kind: VectorKind,
  angle: number,
  cx: number,
  cy: number,
  color: string,
  label: string | VectorLabelDef | null | undefined,
  axis: 'x' | 'y' | undefined,
  labelFontSize: number | undefined,
) {
  const { ctx, opacity } = drawCtx;
  const len = VECTOR_GEOMETRY.subFloorStubLength;
  const head = VECTOR_GEOMETRY.headLength * 0.75;
  const headA = VECTOR_GEOMETRY.headAngleRad;
  const ex = cx + Math.cos(angle) * len;
  const ey = cy + Math.sin(angle) * len;
  // Head apex sits past the shaft end so the stub reads shaft-then-head.
  const hx = ex + Math.cos(angle) * head;
  const hy = ey + Math.sin(angle) * head;

  ctx.save();
  ctx.globalAlpha = opacity * 0.85;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.setLineDash(VECTOR_GEOMETRY.subFloorDash);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx - head * Math.cos(angle - headA), hy - head * Math.sin(angle - headA));
  ctx.lineTo(hx - head * Math.cos(angle + headA), hy - head * Math.sin(angle + headA));
  ctx.closePath();
  ctx.stroke();

  const labelDef = resolveVectorLabel(label, axis, kind);
  if (labelDef !== null) {
    const fontSize = labelFontSize ?? VECTOR_LABEL_DEFAULTS.fontSize;
    const offset = VECTOR_LABEL_DEFAULTS.perpendicularOffsetPx + fontSize * 0.4;
    drawSubscriptedLabel(
      ctx,
      labelDef,
      hx + Math.cos(angle) * offset,
      hy + Math.sin(angle) * offset,
      fontSize,
      color,
    );
  }
  ctx.restore();
}

/**
 * Draws a label that may be a plain string or a {main, sub} structured form.
 * For the structured form, the subscript is rendered with reduced font size
 * and a downward baseline shift, sitting flush to the right of the main glyph.
 *
 * The composite (main + sub) is centered at (x, y).
 */
function drawSubscriptedLabel(
  ctx: CanvasRenderingContext2D,
  label: string | VectorLabelDef,
  x: number,
  y: number,
  fontSize: number,
  color: string,
) {
  const family = VECTOR_LABEL_DEFAULTS.fontFamily;
  const weight = VECTOR_LABEL_DEFAULTS.fontWeight;

  if (typeof label === 'string') {
    ctx.font = `${weight} ${fontSize}px ${family}`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y);
    return;
  }

  const mainFont = `${weight} ${fontSize}px ${family}`;
  const subFontSize = Math.round(fontSize * VECTOR_LABEL_DEFAULTS.subFontFactor);
  const subFont = `${weight} ${subFontSize}px ${family}`;

  ctx.font = mainFont;
  const mainWidth = ctx.measureText(label.main).width;
  let subWidth = 0;
  if (label.sub) {
    ctx.font = subFont;
    subWidth = ctx.measureText(label.sub).width;
  }
  const totalWidth = mainWidth + subWidth;

  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // Center the composite at (x, y).
  const startX = x - totalWidth / 2;

  ctx.font = mainFont;
  ctx.fillText(label.main, startX, y);

  if (label.sub) {
    ctx.font = subFont;
    const subY = y + fontSize * VECTOR_LABEL_DEFAULTS.subBaselineShiftFactor;
    ctx.fillText(label.sub, startX + mainWidth, subY);
  }
}

registerVisual('vector-arrow', drawVectorArrow);
