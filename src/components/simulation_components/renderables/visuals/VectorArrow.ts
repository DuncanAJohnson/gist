import { registerVisual } from '../registry';
import type { DrawContext, PixelVisual } from '../types';
import type { Vec2 } from '../../../../physics/types';
import {
  VECTOR_COLORS,
  VECTOR_DEFAULT_SCALES,
  VECTOR_GEOMETRY,
  VECTOR_LABELS,
  VECTOR_LABEL_DEFAULTS,
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
 * The remaining force kinds (`force-applied`, `force-friction`, and the
 * normal force) await the engine contact-force seam (Goal-1 step 3).
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

  // Source resolution. All vector kinds read from the body (or from userData
  // on the body) so the visual layer is mode-agnostic — the replay loop
  // restores both `body.velocity` and `body.userData.derivedAcceleration`
  // from the Frame, and live mode keeps them current via the engine step and
  // JsonSimulation.handleUpdate respectively.
  let vx: number;
  let vy: number;
  if (kind === 'velocity') {
    vx = body.velocity.x;
    vy = body.velocity.y;
  } else if (kind === 'acceleration') {
    // Undefined for the first live frame, before handleUpdate runs once.
    const derived = (body.userData.derivedAcceleration as Vec2 | undefined) ?? { x: 0, y: 0 };
    vx = derived.x;
    vy = derived.y;
  } else if (kind === 'force-net') {
    const derived = (body.userData.derivedAcceleration as Vec2 | undefined) ?? { x: 0, y: 0 };
    vx = body.mass * derived.x;
    vy = body.mass * derived.y;
  } else if (kind === 'force-gravity') {
    // Weight, m·g. drawCtx.gravity is the SI Y-up gravity vector ({x:0, y:-g}),
    // so this already points down. In a gravity+drag-only scene, force-gravity +
    // force-drag close exactly onto force-net (m·a = m·g + F_drag) — the FBD
    // closure property that holds until contact forces enter (Goal-1 step 5).
    vx = body.mass * drawCtx.gravity.x;
    vy = body.mass * drawCtx.gravity.y;
  } else if (kind === 'force-drag') {
    // Quadratic air resistance, already vectorized every frame as −k·|v|·v by
    // JsonSimulation's onUpdate. Only populated when airResistance.enabled; a
    // body at rest or in vacuum reads {0,0} and the arrow is suppressed below.
    const drag = (body.userData.dragForce as Vec2 | undefined) ?? { x: 0, y: 0 };
    vx = drag.x;
    vy = drag.y;
  } else {
    // force-applied, force-friction: await the engine contact-force seam
    // (Goal-1 step 3). Not wired yet.
    return;
  }

  // Component decomposition: an axis-locked visual zeroes the off-axis
  // component so only the vₓ or v_y leg is drawn (both originate at the body).
  // synthesize.ts fans a `components: true` entry into two of these.
  if (visual.axis === 'x') vy = 0;
  else if (visual.axis === 'y') vx = 0;

  const scale = visual.pixelsPerUnit ?? VECTOR_DEFAULT_SCALES[kind];
  const magnitude = Math.hypot(vx, vy);
  const arrowLen = magnitude * scale;
  if (arrowLen < VECTOR_GEOMETRY.minPixelLength) return;

  // SI (Y-up) → canvas (Y-down): flip vy when computing the screen angle.
  const angle = Math.atan2(-vy, vx);
  const cx = position.x;
  const cy = position.y;
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

  const color = visual.color ?? VECTOR_COLORS[kind];

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

  // Label.
  // Label. For a component leg with no explicit override, derive a subscripted
  // label from the kind's default by appending the axis (v → vₓ / v_y;
  // F_net → F_net,x / F_net,y). An author-supplied label is respected verbatim.
  let labelDef: VectorLabelDef | string | null;
  if (visual.label === null) {
    labelDef = null;
  } else if (visual.label !== undefined) {
    labelDef = visual.label;
  } else if (visual.axis) {
    const base = VECTOR_LABELS[kind];
    labelDef = { main: base.main, sub: base.sub ? `${base.sub},${visual.axis}` : visual.axis };
  } else {
    labelDef = VECTOR_LABELS[kind];
  }
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
