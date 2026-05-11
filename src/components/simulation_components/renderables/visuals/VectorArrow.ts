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
 * Generalized vector-arrow visual. Phase 1 wires only `kind: 'force-net'`.
 * Other kinds compile (the visual schema accepts them) but draw nothing yet —
 * Phase 2 adds velocity + acceleration sources, Phase 3 adds the decomposed
 * force kinds once `JsonSimulation.onUpdate` writes their `userData` fields.
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

  // Source resolution. Phase 1: only force-net is wired.
  let vx: number;
  let vy: number;
  if (kind === 'force-net') {
    const derived = (body.userData.derivedAcceleration as Vec2 | undefined) ?? { x: 0, y: 0 };
    vx = body.mass * derived.x;
    vy = body.mass * derived.y;
  } else {
    // Phase 2/3: source resolvers for the remaining kinds.
    return;
  }

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

  // Shaft (ends at head base).
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(sx, sy);
  ctx.stroke();

  // Filled arrowhead (apex at the true endpoint).
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - head * Math.cos(angle - headA), ey - head * Math.sin(angle - headA));
  ctx.lineTo(ex - head * Math.cos(angle + headA), ey - head * Math.sin(angle + headA));
  ctx.closePath();
  ctx.fill();

  // Label.
  const labelDef: VectorLabelDef | string | null =
    visual.label === null ? null : (visual.label ?? VECTOR_LABELS[kind]);
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
