import DocsLayout from './DocsLayout';
import MermaidDiagram from '../../components/MermaidDiagram';
import {
  VECTOR_COLORS,
  VECTOR_DEFAULT_SCALES,
  VECTOR_GEOMETRY,
  VECTOR_LABELS,
  VECTOR_LABEL_DEFAULTS,
  type VectorKind,
  type VectorLabelDef,
} from '../../components/simulation_components/renderables/vectorTheme';

// ============================================================================
// Theme constants live in vectorTheme.ts (Phase 1 of this refactor). The docs
// page imports from there so the spec and the runtime never drift.
// ============================================================================

// ============================================================================
// VectorArrowDemo — implements the proposed standardized arrow rendering.
// Inputs are in PHYSICS FRAME (Y-up) so reading the demo code matches how
// physics is taught. The component does the canvas (Y-down) flip internally,
// which is exactly what the real ForceArrow.ts does today.
// ============================================================================

interface VectorArrowDemoProps {
  kind: VectorKind;
  vectorPhysX: number; // physics frame (Y-up), in SI units of the kind
  vectorPhysY: number;
  tailX: number;       // SVG coords (Y-down)
  tailY: number;
  pixelsPerUnit?: number;
  /**
   * null = suppress the label.
   * undefined = use the standard {main, sub?} for this kind.
   * string = custom plain text (no subscript).
   * {main, sub?} = custom structured label.
   */
  label?: string | VectorLabelDef | null;
  labelPlacement?: 'tail' | 'midpoint' | 'head';
  labelFontSize?: number;
  /** Dash the shaft (component legs are drawn dashed to read distinctly from the solid resultant). */
  dashed?: boolean;
}

function VectorArrowDemo({
  kind,
  vectorPhysX,
  vectorPhysY,
  tailX,
  tailY,
  pixelsPerUnit,
  label,
  labelPlacement = VECTOR_LABEL_DEFAULTS.placement,
  labelFontSize,
  dashed = false,
}: VectorArrowDemoProps) {
  const scale = pixelsPerUnit ?? VECTOR_DEFAULT_SCALES[kind];
  const magnitude = Math.hypot(vectorPhysX, vectorPhysY);
  const arrowLen = magnitude * scale;
  if (arrowLen < VECTOR_GEOMETRY.minPixelLength) return null;

  // Y-up → Y-down flip happens here.
  const angle = Math.atan2(-vectorPhysY, vectorPhysX);
  const ex = tailX + Math.cos(angle) * arrowLen;
  const ey = tailY + Math.sin(angle) * arrowLen;

  const head = VECTOR_GEOMETRY.headLength;
  const headA = VECTOR_GEOMETRY.headAngleRad;

  // Stop the shaft at the BASE of the arrowhead (not the apex). This prevents
  // the line's rounded cap from poking past the head's tip — the small "dot"
  // artifact visible when shaft and head share a common endpoint.
  const shaftBackoff = head * Math.cos(headA);
  const shaftLen = Math.max(0, arrowLen - shaftBackoff);
  const sx = tailX + Math.cos(angle) * shaftLen;
  const sy = tailY + Math.sin(angle) * shaftLen;

  const hx1 = ex - head * Math.cos(angle - headA);
  const hy1 = ey - head * Math.sin(angle - headA);
  const hx2 = ex - head * Math.cos(angle + headA);
  const hy2 = ey - head * Math.sin(angle + headA);

  const color = VECTOR_COLORS[kind];
  const labelDef: VectorLabelDef | string | null =
    label === null ? null : (label ?? VECTOR_LABELS[kind]);
  const fontSize = labelFontSize ?? VECTOR_LABEL_DEFAULTS.fontSize;

  // Label anchor: midpoint by default; perpendicular offset to the arrow's left.
  let baseX: number;
  let baseY: number;
  if (labelPlacement === 'tail') {
    baseX = tailX;
    baseY = tailY;
  } else if (labelPlacement === 'head') {
    baseX = ex;
    baseY = ey;
  } else {
    baseX = (tailX + ex) / 2;
    baseY = (tailY + ey) / 2;
  }

  const offset = VECTOR_LABEL_DEFAULTS.perpendicularOffsetPx + fontSize * 0.4;
  const perpX = -Math.sin(angle) * offset;
  const perpY = Math.cos(angle) * offset;

  // For 'head' placement, push the label past the arrowhead instead of perpendicular.
  const labelX =
    labelPlacement === 'head' ? ex + Math.cos(angle) * (head + offset) : baseX + perpX;
  const labelY =
    labelPlacement === 'head' ? ey + Math.sin(angle) * (head + offset) : baseY + perpY;

  return (
    <g>
      <line
        x1={tailX}
        y1={tailY}
        x2={sx}
        y2={sy}
        stroke={color}
        strokeWidth={VECTOR_GEOMETRY.lineWidth}
        strokeLinecap="round"
        strokeDasharray={dashed ? VECTOR_GEOMETRY.componentDash.join(' ') : undefined}
      />
      <polygon points={`${ex},${ey} ${hx1},${hy1} ${hx2},${hy2}`} fill={color} />
      {labelDef !== null && (
        <text
          x={labelX}
          y={labelY}
          fill={color}
          fontSize={fontSize}
          fontFamily={VECTOR_LABEL_DEFAULTS.fontFamily}
          fontWeight={600}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {typeof labelDef === 'string' ? (
            labelDef
          ) : (
            <>
              <tspan>{labelDef.main}</tspan>
              {labelDef.sub && (
                <tspan dy={fontSize * 0.3} fontSize={Math.round(fontSize * 0.72)}>
                  {labelDef.sub}
                </tspan>
              )}
            </>
          )}
        </text>
      )}
    </g>
  );
}

// Small helper that pulls a sprite from /public/renderables, centered at (cx, cy).
function RenderableSprite({
  src,
  cx,
  cy,
  size,
}: {
  src: string;
  cx: number;
  cy: number;
  size: number;
}) {
  return (
    <image
      href={`/renderables/${src}`}
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

// Simple ground hatch for scenes that imply contact with a surface.
function Ground({ y, width = 320 }: { y: number; width?: number }) {
  return (
    <g stroke="#9ca3af" strokeWidth={1}>
      <line x1={0} y1={y} x2={width} y2={y} />
      {Array.from({ length: 16 }).map((_, i) => (
        <line key={i} x1={i * 20} y1={y} x2={i * 20 - 6} y2={y + 8} />
      ))}
    </g>
  );
}

interface SceneCardProps {
  title: string;
  caption: string;
  children: React.ReactNode;
}

function SceneCard({ title, caption, children }: SceneCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-800">
        {title}
      </div>
      <div className="bg-white">{children}</div>
      <div className="px-4 py-2 text-xs text-gray-600 border-t border-gray-100">
        {caption}
      </div>
    </div>
  );
}

// ============================================================================
// Test scenes — each is a self-contained SVG that pulls a sprite from
// /public/renderables and overlays the proposed vector arrow.
// ============================================================================

function VelocityScene() {
  return (
    <SceneCard
      title="Velocity"
      caption="Cannonball moving right at 5 m/s. Default scale 20 px per (m/s) → 100 px arrow. Color = green, symbol = v."
    >
      <svg viewBox="0 0 320 180" className="w-full h-auto bg-gray-50" role="img" aria-label="Velocity vector demo">
        <Ground y={140} />
        <RenderableSprite src="cannonball.svg" cx={70} cy={120} size={42} />
        <VectorArrowDemo kind="velocity" vectorPhysX={5} vectorPhysY={0} tailX={70} tailY={120} />
      </svg>
    </SceneCard>
  );
}

function AccelerationScene() {
  return (
    <SceneCard
      title="Acceleration"
      caption="Apple in free fall, a = 9.8 m/s² downward. Default scale 10 px per (m/s²) → 98 px arrow. Color = purple, symbol = a."
    >
      <svg viewBox="0 0 320 180" className="w-full h-auto bg-gray-50" role="img" aria-label="Acceleration vector demo">
        <RenderableSprite src="apple.svg" cx={160} cy={45} size={40} />
        <VectorArrowDemo kind="acceleration" vectorPhysX={0} vectorPhysY={-9.8} tailX={160} tailY={45} />
      </svg>
    </SceneCard>
  );
}

function ProjectileScene() {
  // Apple mid-arc — velocity rising-rightward, acceleration straight down.
  return (
    <SceneCard
      title="Velocity + Acceleration (projectile)"
      caption="Apple mid-flight: v ≈ (3, 2) m/s, a = (0, −9.8) m/s². Two kinds simultaneously — distinct colors keep them readable on the same body."
    >
      <svg viewBox="0 0 320 180" className="w-full h-auto bg-gray-50" role="img" aria-label="Projectile motion vectors">
        <Ground y={170} />
        <RenderableSprite src="apple.svg" cx={70} cy={70} size={36} />
        <VectorArrowDemo kind="velocity" vectorPhysX={3} vectorPhysY={2} tailX={70} tailY={70} />
        <VectorArrowDemo kind="acceleration" vectorPhysX={0} vectorPhysY={-9.8} tailX={70} tailY={70} />
      </svg>
    </SceneCard>
  );
}

function ComponentsScene() {
  // Same projectile, decomposed: solid resultant + dashed vₓ / v_y legs, all from the body.
  return (
    <SceneCard
      title="Velocity components (vₓ / v_y)"
      caption='components: true fans one vector into its two axis-aligned legs (dashed, both from the body), auto-subscripted vₓ / v_y. The resultant is NOT drawn by that entry — compose it by also listing the plain kind: ["velocity", {"kind": "velocity", "components": true}]. Canonical projectile view: vₓ constant, v_y ramps down through zero at the apex.'
    >
      <svg viewBox="0 0 320 180" className="w-full h-auto bg-gray-50" role="img" aria-label="Velocity component-decomposition vectors">
        <Ground y={170} />
        <RenderableSprite src="cannonball.svg" cx={90} cy={90} size={36} />
        {/* Solid resultant (plain "velocity" entry) */}
        <VectorArrowDemo kind="velocity" vectorPhysX={4} vectorPhysY={3} tailX={90} tailY={90} />
        {/* Dashed component legs (components: true fans into these two) */}
        <VectorArrowDemo kind="velocity" vectorPhysX={4} vectorPhysY={0} tailX={90} tailY={90} dashed label={{ main: 'v', sub: 'x' }} />
        <VectorArrowDemo kind="velocity" vectorPhysX={0} vectorPhysY={3} tailX={90} tailY={90} dashed label={{ main: 'v', sub: 'y' }} />
      </svg>
    </SceneCard>
  );
}

function AppliedForceScene() {
  return (
    <SceneCard
      title="Applied force"
      caption="Dynamics cart pushed rightward, F_app = 50 N. Default scale 2 px per N → 100 px arrow. Color = blue."
    >
      <svg viewBox="0 0 320 180" className="w-full h-auto bg-gray-50" role="img" aria-label="Applied force vector">
        <Ground y={140} />
        <RenderableSprite src="dynamics_cart.svg" cx={90} cy={115} size={70} />
        <VectorArrowDemo kind="force-applied" vectorPhysX={50} vectorPhysY={0} tailX={90} tailY={115} />
      </svg>
    </SceneCard>
  );
}

function FrictionScene() {
  // Crate sliding rightward; kinetic friction opposes motion.
  return (
    <SceneCard
      title="Friction force"
      caption="Crate sliding right at 4 m/s; kinetic friction F_f = 30 N opposing motion. Velocity (green) and friction (orange) on the same body — opposite directions, distinct colors."
    >
      <svg viewBox="0 0 320 180" className="w-full h-auto bg-gray-50" role="img" aria-label="Friction force vector">
        <Ground y={140} />
        <RenderableSprite src="crate.svg" cx={160} cy={115} size={56} />
        <VectorArrowDemo kind="velocity" vectorPhysX={4} vectorPhysY={0} tailX={160} tailY={115} />
        <VectorArrowDemo kind="force-friction" vectorPhysX={-30} vectorPhysY={0} tailX={160} tailY={115} />
      </svg>
    </SceneCard>
  );
}

function DragScene() {
  // Parachute descending; air drag opposes velocity.
  return (
    <SceneCard
      title="Drag force"
      caption="Parachute descending at 3 m/s; quadratic air-resistance F_ar = 25 N upward. Velocity (green, downward) + air-resistance (blue-grey, upward)."
    >
      <svg viewBox="0 0 320 180" className="w-full h-auto bg-gray-50" role="img" aria-label="Drag force vector">
        <RenderableSprite src="parachute.svg" cx={160} cy={70} size={70} />
        <VectorArrowDemo kind="velocity" vectorPhysX={0} vectorPhysY={-3} tailX={160} tailY={70} />
        <VectorArrowDemo kind="force-drag" vectorPhysX={0} vectorPhysY={25} tailX={160} tailY={70} />
      </svg>
    </SceneCard>
  );
}

function GravityScene() {
  return (
    <SceneCard
      title="Gravity force"
      caption="Bowling ball, W = m·g ≈ 30 N down (≈ 3 kg). Color = navy, symbol = F_g. Always-on; usually visible only in free-body-diagram mode."
    >
      <svg viewBox="0 0 320 180" className="w-full h-auto bg-gray-50" role="img" aria-label="Gravity force vector">
        <RenderableSprite src="bowling_ball.svg" cx={160} cy={50} size={48} />
        <VectorArrowDemo kind="force-gravity" vectorPhysX={0} vectorPhysY={-30} tailX={160} tailY={50} />
      </svg>
    </SceneCard>
  );
}

function NewtonsSecondScene() {
  // Multi-arrow scene: applied + friction at body center, net rendered above the body.
  return (
    <SceneCard
      title="Newton's 2nd Law diorama (multi-arrow)"
      caption="Cart with three arrows: F_app (blue, 50 N) + F_f (orange, 20 N) → F_net (red, 30 N) shown above the body. The standardized colors and labels disambiguate three vectors on one body."
    >
      <svg viewBox="0 0 320 180" className="w-full h-auto bg-gray-50" role="img" aria-label="Newton's 2nd Law multi-arrow demo">
        <Ground y={140} />
        <RenderableSprite src="dynamics_cart.svg" cx={130} cy={115} size={70} />
        {/* Applied + friction at body center */}
        <VectorArrowDemo kind="force-applied" vectorPhysX={50} vectorPhysY={0} tailX={130} tailY={115} />
        <VectorArrowDemo kind="force-friction" vectorPhysX={-20} vectorPhysY={0} tailX={130} tailY={115} />
        {/* Net force, drawn above the body so the resultant is unambiguous */}
        <VectorArrowDemo kind="force-net" vectorPhysX={30} vectorPhysY={0} tailX={130} tailY={70} />
      </svg>
    </SceneCard>
  );
}

function LabelOverridesScene() {
  // Demonstrates label flexibility: per-arrow override of font size and placement.
  return (
    <SceneCard
      title="Label flexibility (overrides)"
      caption='Same kind, three label styles. Left: default ("v" at midpoint, 13 px). Center: larger font (18 px). Right: head placement and custom string.'
    >
      <svg viewBox="0 0 480 160" className="w-full h-auto bg-gray-50" role="img" aria-label="Label override demo">
        <Ground y={130} />
        <RenderableSprite src="cannonball.svg" cx={70} cy={100} size={36} />
        <VectorArrowDemo kind="velocity" vectorPhysX={4} vectorPhysY={0} tailX={70} tailY={100} />
        <RenderableSprite src="cannonball.svg" cx={230} cy={100} size={36} />
        <VectorArrowDemo
          kind="velocity"
          vectorPhysX={4}
          vectorPhysY={0}
          tailX={230}
          tailY={100}
          labelFontSize={18}
        />
        <RenderableSprite src="cannonball.svg" cx={390} cy={100} size={36} />
        <VectorArrowDemo
          kind="velocity"
          vectorPhysX={4}
          vectorPhysY={0}
          tailX={390}
          tailY={100}
          label="v = 4 m/s"
          labelPlacement="head"
        />
      </svg>
    </SceneCard>
  );
}

// ============================================================================
// Force loupe (PROPOSED) — design scratchpad for reading sub-threshold forces.
//
// The feather in `bowlingBallAndFeather` weighs 0.098 N. At the shared force
// scale of 2 px/N that is a 0.2 px arrow, so ALL of its force arrows fall under
// `minPixelLength` and render as identical sub-floor stubs — the body's whole
// diagram is illegible while the bowling ball beside it draws a 98 px weight.
// The loupe is a DISCLOSED local rescale: same per-body scaling we could do
// silently, but wrapped in a signifier that says "this is enlarged."
// ============================================================================

/** The shipped sub-floor stub, drawn standalone (VectorArrowDemo returns null
 *  below minPixelLength, so the docs page could not show a stub until now). */
function StubArrowDemo({
  kind,
  dirX,
  dirY,
  tailX,
  tailY,
  label,
}: {
  kind: VectorKind;
  dirX: number;
  dirY: number;
  tailX: number;
  tailY: number;
  label?: VectorLabelDef;
}) {
  const len = VECTOR_GEOMETRY.subFloorStubLength;
  const angle = Math.atan2(-dirY, dirX);
  const ex = tailX + Math.cos(angle) * len;
  const ey = tailY + Math.sin(angle) * len;
  const head = VECTOR_GEOMETRY.headLength * 0.7;
  const headA = VECTOR_GEOMETRY.headAngleRad;
  const color = VECTOR_COLORS[kind];
  const labelDef = label ?? VECTOR_LABELS[kind];
  return (
    <g opacity={0.85}>
      <line
        x1={tailX}
        y1={tailY}
        x2={ex}
        y2={ey}
        stroke={color}
        strokeWidth={2}
        strokeDasharray={VECTOR_GEOMETRY.subFloorDash.join(' ')}
      />
      {/* HOLLOW head — the "not to scale" signal. */}
      <polygon
        points={`${ex + Math.cos(angle) * head},${ey + Math.sin(angle) * head} ${
          ex - head * Math.cos(angle - headA) + Math.cos(angle) * head
        },${ey - head * Math.sin(angle - headA) + Math.sin(angle) * head} ${
          ex - head * Math.cos(angle + headA) + Math.cos(angle) * head
        },${ey - head * Math.sin(angle + headA) + Math.sin(angle) * head}`}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      <text
        x={ex + Math.cos(angle) * 22}
        y={ey + Math.sin(angle) * 22}
        fill={color}
        fontSize={11}
        fontFamily={VECTOR_LABEL_DEFAULTS.fontFamily}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        <tspan>{labelDef.main}</tspan>
        {labelDef.sub && (
          <tspan dy={3} fontSize={8}>
            {labelDef.sub}
          </tspan>
        )}
      </text>
    </g>
  );
}

/** Labelled scale bar — the honesty device. Micrograph/map convention: state
 *  the magnitude a fixed pixel length represents, rather than a bare "×500". */
function ForceScaleBar({
  x,
  y,
  widthPx,
  labelText,
}: {
  x: number;
  y: number;
  widthPx: number;
  labelText: string;
}) {
  return (
    <g stroke="#374151" fill="#374151">
      <line x1={x} y1={y} x2={x + widthPx} y2={y} strokeWidth={1.5} />
      <line x1={x} y1={y - 4} x2={x} y2={y + 4} strokeWidth={1.5} />
      <line x1={x + widthPx} y1={y - 4} x2={x + widthPx} y2={y + 4} strokeWidth={1.5} />
      <text
        x={x + widthPx / 2}
        y={y + 15}
        fontSize={11}
        fontFamily={VECTOR_LABEL_DEFAULTS.fontFamily}
        textAnchor="middle"
        stroke="none"
      >
        {labelText}
      </text>
    </g>
  );
}

// Feather instant used by every loupe scene: v = 0.8·v_terminal, so the three
// forces are distinct AND still close exactly (0.098 − 0.063 = 0.035 N).
const F_G = 0.098;
const F_DRAG = 0.063;
const F_NET = F_G - F_DRAG;
const LOUPE_SCALE = 600; // px per N inside the loupe (vs 2 px/N on canvas)

function LoupeProblemScene() {
  return (
    <SceneCard
      title="The problem — a body whose whole diagram is sub-threshold"
      caption="Feather at the shared 2 px/N canvas scale. Weight is 0.098 N → 0.2 px, drag likewise, so every arrow falls under the 14 px floor and draws as the same fixed 10 px dashed stub. The stubs correctly say 'a force is here'; they cannot say which is larger, and at terminal velocity F_net drops below 0.1 px and vanishes entirely. Direction survives, proportion does not."
    >
      <svg viewBox="0 0 320 180" className="w-full h-auto bg-gray-50" role="img" aria-label="Feather with all force arrows below the render threshold">
        <RenderableSprite src="feather.svg" cx={150} cy={86} size={54} />
        <StubArrowDemo kind="force-gravity" dirX={0} dirY={-1} tailX={150} tailY={86} />
        <StubArrowDemo kind="force-drag" dirX={0} dirY={1} tailX={150} tailY={86} />
        <text x={232} y={84} fontSize={11} fill="#6b7280" fontFamily="ui-sans-serif, system-ui">
          F_net: not drawn
        </text>
        <text x={232} y={98} fontSize={10} fill="#9ca3af" fontFamily="ui-sans-serif, system-ui">
          (≤ 0.1 px at terminal)
        </text>
      </svg>
    </SceneCard>
  );
}

function LoupeParticleScene() {
  const cx = 150;
  const cy = 78;
  return (
    <SceneCard
      title="Proposed — force loupe, particle model"
      caption="The same instant at 600 px/N inside the loupe. The body is a DOT — the particle model, the actual FBD convention — so no spatial claim is made and nothing invites a 'zoomed in on what?' reading. Arrows still close exactly: F_g (59 px) − F_ar (38 px) = F_net (21 px). The scale bar, not a '×N' factor, is what makes the rescale honest."
    >
      <svg viewBox="0 0 320 205" className="w-full h-auto bg-gray-50" role="img" aria-label="Force loupe showing the feather as a particle-model dot with rescaled force arrows">
        <circle cx={160} cy={82} r={74} fill="#ffffff" stroke="#6b7280" strokeWidth={2} />
        <VectorArrowDemo kind="force-gravity" vectorPhysX={0} vectorPhysY={-F_G} tailX={cx} tailY={cy} pixelsPerUnit={LOUPE_SCALE} />
        <VectorArrowDemo kind="force-drag" vectorPhysX={0} vectorPhysY={F_DRAG} tailX={cx} tailY={cy} pixelsPerUnit={LOUPE_SCALE} />
        {/* Net drawn offset so it doesn't lie on top of the collinear weight. */}
        <line x1={207} y1={62} x2={219} y2={62} stroke="#9ca3af" strokeWidth={1} />
        <VectorArrowDemo kind="force-net" vectorPhysX={0} vectorPhysY={-F_NET} tailX={213} tailY={62} pixelsPerUnit={LOUPE_SCALE} />
        {/* The particle: body reduced to a point. */}
        <circle cx={cx} cy={cy} r={5} fill="#111827" />
        <ForceScaleBar x={130} y={178} widthPx={0.1 * LOUPE_SCALE} labelText="0.1 N" />
      </svg>
    </SceneCard>
  );
}

function LoupeOutlineScene() {
  const cx = 150;
  const cy = 78;
  return (
    <SceneCard
      title="Rejected alternative — silhouette inside the loupe"
      caption="Identical arrows, but the body drawn as its own outline. This is the version to avoid: a lens around a recognisable shape reads as a SPATIAL magnifier, so a viewer expects the feather to be enlarged too — and it isn't, only the force scale changed. Same picture, false promise."
    >
      <svg viewBox="0 0 320 205" className="w-full h-auto bg-gray-50" role="img" aria-label="Force loupe drawn with a body silhouette instead of a particle dot">
        <circle cx={160} cy={82} r={74} fill="#ffffff" stroke="#6b7280" strokeWidth={2} />
        <g opacity={0.35}>
          <RenderableSprite src="feather.svg" cx={cx} cy={cy} size={46} />
        </g>
        <ellipse cx={cx} cy={cy} rx={13} ry={23} fill="none" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 3" />
        <VectorArrowDemo kind="force-gravity" vectorPhysX={0} vectorPhysY={-F_G} tailX={cx} tailY={cy} pixelsPerUnit={LOUPE_SCALE} />
        <VectorArrowDemo kind="force-drag" vectorPhysX={0} vectorPhysY={F_DRAG} tailX={cx} tailY={cy} pixelsPerUnit={LOUPE_SCALE} />
        <ForceScaleBar x={130} y={178} widthPx={0.1 * LOUPE_SCALE} labelText="0.1 N" />
      </svg>
    </SceneCard>
  );
}

function LoupeAnchoredScene() {
  return (
    <SceneCard
      title="Placement — anchored to the selected body, in a mixed-scale scene"
      caption="Bowling ball (49 N → 98 px) and feather (0.098 N → stubs) in one scene: a 500× spread no shared scale can serve. On pause, selecting the feather opens its loupe beside it with a leader line. The canvas scale never changes, so the ball's arrows stay comparable to every other sim; only the loupe's interior is rescaled, and it says so."
    >
      <svg viewBox="0 0 320 215" className="w-full h-auto bg-gray-50" role="img" aria-label="Scene with a bowling ball at canvas scale and a feather with an anchored force loupe">
        <RenderableSprite src="bowling_ball.svg" cx={48} cy={40} size={34} />
        <VectorArrowDemo kind="force-gravity" vectorPhysX={0} vectorPhysY={-49} tailX={48} tailY={40} pixelsPerUnit={2} />
        <RenderableSprite src="feather.svg" cx={150} cy={40} size={34} />
        <StubArrowDemo kind="force-gravity" dirX={0} dirY={-1} tailX={150} tailY={40} />
        <StubArrowDemo kind="force-drag" dirX={0} dirY={1} tailX={150} tailY={40} />
        {/* Selection ring + leader line to the loupe. */}
        <rect x={132} y={22} width={36} height={36} fill="none" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4 3" rx={3} />
        <line x1={168} y1={58} x2={215} y2={104} stroke="#9ca3af" strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={243} cy={131} r={56} fill="#ffffff" stroke="#6b7280" strokeWidth={2} />
        <VectorArrowDemo kind="force-gravity" vectorPhysX={0} vectorPhysY={-F_G} tailX={232} tailY={116} pixelsPerUnit={340} label={null} />
        <VectorArrowDemo kind="force-drag" vectorPhysX={0} vectorPhysY={F_DRAG} tailX={232} tailY={116} pixelsPerUnit={340} label={null} />
        <circle cx={232} cy={116} r={4} fill="#111827" />
        <ForceScaleBar x={219} y={176} widthPx={0.1 * 340} labelText="0.1 N" />
      </svg>
    </SceneCard>
  );
}

// ============================================================================
// Mermaid diagrams
// ============================================================================

const systemChart = `
flowchart TB
  subgraph DOC["Doc lineage"]
    APP["Applied Forces Refactor<br/>(Phase 2 wants force arrows)"]
    VEC["Vector Rep Refactor<br/>(Phase 3: shared VectorArrow)"]
    PHYSCH["Physics Chapters Engine Map<br/>(arrows underpin all dioramas)"]
    DIORAMA["Diorama Model<br/>(left-wall standard UI)"]
  end

  subgraph THIS["This refactor"]
    VA["Vector Arrows Refactor<br/>(VectorArrow + theme + 7 kinds)"]
  end

  subgraph CODE["Codebase touchpoints"]
    THEME["renderables/vectorTheme.ts<br/>(NEW — colors / labels / scales)"]
    VISUAL["renderables/visuals/VectorArrow.ts<br/>(replaces ForceArrow.ts)"]
    TYPES["renderables/types.ts<br/>(ForceArrowVisual → VectorArrowVisual)"]
    SYNTH["renderables/synthesize.ts<br/>(showVectors → renderables)"]
    OBJ["objects/types.ts<br/>(showForceArrows → showVectors)"]
    JSON["JsonSimulation.tsx<br/>(populates userData[*Force])"]
    SCHEMA["schemas/simulation.ts<br/>(showVectors field)"]
    PROMPT["modal_functions/<br/>gist_instructions.py"]
  end

  APP -.->|requires| VA
  VEC -.->|requires| VA
  PHYSCH -.->|motivates| VA
  DIORAMA -.->|standard UI for| VA

  VA --> THEME
  VA --> VISUAL
  VA --> TYPES
  VA --> SYNTH
  VA --> OBJ
  VA --> JSON
  VA --> SCHEMA
  VA --> PROMPT

  classDef docs fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef refactor fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  classDef code fill:#dcfce7,stroke:#16a34a,color:#166534;

  class APP,VEC,PHYSCH,DIORAMA docs;
  class VA refactor;
  class THEME,VISUAL,TYPES,SYNTH,OBJ,JSON,SCHEMA,PROMPT code;
`;

const phaseChart = `
flowchart LR
  P1A["Phase 1a:<br/>rename + kind field<br/>+ theme module<br/><b>SHIPPED</b>"]
  P1B["Phase 1b:<br/>drop gravity<br/>double-count in F_net<br/><b>SHIPPED</b>"]
  P1C["Phase 1c-rev:<br/>store kinematics<br/>in Frame schema<br/><b>SHIPPED</b>"]
  P2["Phase 2:<br/>velocity + acceleration<br/>+ showVectors schema<br/><b>SHIPPED</b>"]
  P3["Phase 3:<br/>applied / friction /<br/>drag / gravity kinds"]
  P4["Phase 4:<br/>legend overlay<br/>+ diorama presets"]
  P5["Phase 5:<br/>auto-scale<br/>calibration (opt.)"]
  P1A --> P1B --> P1C --> P2 --> P3 --> P4 --> P5

  classDef done fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef proposed fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef pending fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  class P1A,P1B,P1C,P2 done;
  class P3,P4,P5 pending;
`;

const precomputeReplayChart = `
flowchart TB
  PLAY["User: press play"] --> PRESTART["Mode → precomputing"]

  subgraph PRE["Precompute phase (hidden, runs in batches via rAF yields)"]
    direction TB
    PRESTART --> P1["handleUpdate(t)"]
    P1 -->|"computes #40;v − v_prev#41; / dt"| P1W["frame.bodies#91;i#93; ←<br/>#123;x, y, angle,<br/>vx, vy, omega,<br/>ax, ay, alpha#125;"]
    P1W --> P2["adapter.step(FIXED_DT)"]
    P2 --> P3["frames#91;#93;.push#40;frame#41;<br/>(no userData;<br/>frame IS the truth)"]
    P3 -->|next frame| P1
  end

  PRE -->|all frames done| FLIP["Mode → replay"]
  FLIP --> REP

  subgraph REP["Replay phase (visible, real-time, one rAF per frame)"]
    direction TB
    R1["read frames#91;idx#93;"]
    R1 --> R2["write to body:<br/>position, angle,<br/>velocity, omega<br/>+ userData.derivedAccel<br/>(no compute; just restore)"]
    R2 --> DRAW["VectorArrow source resolver<br/>reads body — same code<br/>as if physics were live"]
    DRAW -->|next rAF| R1
  end

  classDef fix fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef neutral fill:#fef3c7,stroke:#d97706,color:#92400e;
  class P1W,R2 fix;
  class P1,DRAW neutral;
`;

// ============================================================================
// Page
// ============================================================================

function VectorArrows() {
  return (
    <DocsLayout
      title="6. Vector arrows"
      subtitle="Refactor proposal: standardize the vector-arrow renderable across velocity, acceleration, and the force family. Lives on the diorama model's left-wall standard UI shelf."
    >
      <p>
        Vector visualization is the single most reused affordance across every introductory-physics
        diorama — projectile motion, free fall, Newton's 2nd Law, tug-of-war, friction, drag. Today
        the codebase has one bespoke <code>ForceArrow</code>{' '}
        (<a href="https://github.com/DuncanAJohnson/gist/blob/main/src/components/simulation_components/renderables/visuals/ForceArrow.ts">
          renderables/visuals/ForceArrow.ts
        </a>
        ) hardcoded to net force in red, with no labels and no support for velocity or acceleration.
        This refactor generalizes it into a single <code>VectorArrow</code> visual driven by a
        themed registry of <em>kinds</em>, with standardized colors, symbols, default scales, and
        label conventions — all overridable per-arrow.
      </p>

      <h2>What it touches</h2>
      <MermaidDiagram
        chart={systemChart}
        caption="Doc lineage on top, this refactor in the middle, codebase touchpoints below. The vector-rep refactor's Phase 3 and the applied-forces refactor's Phase 2 both expected this renderable — landing it once and pointing both refactors at it is the planned consolidation."
      />

      <h2>The standard palette</h2>
      <p>
        One color per kind, picked so adjacent kinds (velocity vs. acceleration, applied vs.
        friction) are visually distinct on a typical neutral background. The symbol is the
        textbook glyph for that quantity. The default scale is sized so a "natural" magnitude
        (5 m/s, 9.8 m/s², 50 N) produces an arrow ~100 px long at default canvas zoom.
      </p>

      <div className="not-prose overflow-x-auto">
        <table className="min-w-full text-sm border-collapse border border-gray-200 rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left border border-gray-200">Kind</th>
              <th className="px-3 py-2 text-left border border-gray-200">Color</th>
              <th className="px-3 py-2 text-left border border-gray-200">Symbol</th>
              <th className="px-3 py-2 text-left border border-gray-200">Default scale</th>
              <th className="px-3 py-2 text-left border border-gray-200">Source on body</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['velocity', '20 px per (m/s)', 'body.velocity'],
                ['acceleration', '10 px per (m/s²)', 'userData.derivedAcceleration'],
                ['force-net', '2 px per N', 'm · a_derived'],
                ['force-applied', '2 px per N', 'userData.appliedForce (unwired)'],
                ['force-friction', '2 px per N', 'userData.frictionForce (engine-read)'],
                ['force-normal', '2 px per N', 'userData.normalForce (engine-read)'],
                ['force-drag', '2 px per N', 'userData.dragForce'],
                ['force-gravity', '2 px per N', 'm · g'],
              ] as Array<[VectorKind, string, string]>
            ).map(([kind, scale, src]) => (
              <tr key={kind}>
                <td className="px-3 py-2 border border-gray-200 font-mono text-xs">{kind}</td>
                <td className="px-3 py-2 border border-gray-200">
                  <span
                    className="inline-block w-4 h-4 rounded mr-2 align-middle"
                    style={{ background: VECTOR_COLORS[kind] }}
                  />
                  <code className="text-xs">{VECTOR_COLORS[kind]}</code>
                </td>
                <td className="px-3 py-2 border border-gray-200">
                  <span style={{ color: VECTOR_COLORS[kind], fontWeight: 600 }}>
                    {VECTOR_LABELS[kind].main}
                    {VECTOR_LABELS[kind].sub && <sub>{VECTOR_LABELS[kind].sub}</sub>}
                  </span>
                </td>
                <td className="px-3 py-2 border border-gray-200 text-xs">{scale}</td>
                <td className="px-3 py-2 border border-gray-200 text-xs font-mono">{src}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        <strong>Unit anchoring (known issue, 2026-07-07):</strong> these default scales are
        px per <em>SI</em> unit, while every other render path is anchored to the sim's
        configured unit — so in a (hypothetical, none exist yet) cm-authored sim, arrows
        would draw ~100× shorter than the diorama warrants. Agreed direction: make arrow
        scales diorama-anchored (px per config unit), most naturally with Phase 5's
        auto-scale calibration; force kinds need their own treatment (Newtons don't rescale
        with the length unit). Deliberately not landed — schema description, prompt, and
        this table move together when it is. The governing unit-semantics decision
        ("preservation": units describe the diorama, never resize it) lives in{' '}
        <code>parking_lot.md</code> → "Saved sims bypass schema validation", UPDATE
        2026-07-07.
      </p>
      <p>
        <strong>Colorblind note:</strong> green/red are the most common confusion pair
        (deuteranopia, protanopia). The symbol-label channel is the backup — even if{' '}
        <code>v</code>'s green and <code>F<sub>net</sub></code>'s red merge for some viewers,
        the glyphs disambiguate. Worth revisiting the palette if a color-vision audit happens.
      </p>
      <p>
        <strong>Friction & air-resistance contrast:</strong> early renders showed the original
        sun-flower orange (<code>#f39c12</code>) blending into brown sprites and the asbestos
        gray (<code>#7f8c8d</code>) reading too faintly on white. The current defaults (pumpkin{' '}
        <code>#d35400</code> for friction, blue-grey 700 <code>#455a64</code> for air-resistance)
        keep the warm/neutral semantics but with stronger contrast. Two alternate paths if
        these still feel off:
      </p>
      <ul>
        <li>
          <strong>Friction → magenta <code>#c2185b</code>:</strong> maximally distinct from any
          sprite color, breaks the warm-= -friction convention.
        </li>
        <li>
          <strong>Air-resistance → dark teal <code>#00838f</code>:</strong> suggests "fluid"
          semantically; risks visual confusion with the applied-force blue.
        </li>
      </ul>

      <h2>Test scenes</h2>
      <p>
        Each scene below is a real React-rendered SVG that pulls a sprite from{' '}
        <code>/public/renderables</code> and overlays the proposed{' '}
        <code>VectorArrowDemo</code> component using the theme constants above. The demo
        component is a fully functional reference implementation of the proposed{' '}
        <code>VectorArrow.ts</code> draw function.
      </p>

      <div className="not-prose grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
        <VelocityScene />
        <AccelerationScene />
        <ProjectileScene />
        <ComponentsScene />
        <AppliedForceScene />
        <FrictionScene />
        <DragScene />
        <GravityScene />
        <NewtonsSecondScene />
      </div>

      <div className="not-prose my-6">
        <LabelOverridesScene />
      </div>

      <h2>Force loupe — reading sub-threshold forces (PROPOSED, 2026-08-08)</h2>
      <p>
        <strong>The problem is dynamic range.</strong> A single scene can hold forces three
        orders of magnitude apart — <code>bowlingBallAndFeather</code> pairs a 49 N weight
        with a 0.098 N one, a 500× spread. At the shared force scale of 2 px/N the ball draws
        a 98 px arrow and every one of the feather's arrows lands under the 14 px floor, so
        the feather's whole diagram collapses into identical sub-floor stubs. Direction
        survives; proportion — the thing an FBD exists to show — does not.
      </p>
      <p>
        Two obvious fixes were considered and rejected. A <strong>logarithmic</strong> arrow
        scale fails on arithmetic: log|A| + log|B| ≠ log|A+B|, so the arrows stop closing
        head-to-tail, and head-to-tail closure is the FBD's entire teaching promise (it is a
        ratified design gate — see the applied-forces note). It also breaks component
        decomposition, is undefined at F_net = 0 (exactly the terminal-velocity case we want
        to show), and asks ages-10–13 readers to parse a late-secondary abstraction.
        A <strong>silent per-body scale</strong> keeps the arithmetic — closure is a per-body
        property, since forces are only ever summed on one body — but it is undisclosed: two
        arrows of equal length on screen would mean wildly different forces with nothing
        saying so. Observant students notice, and they are right to.
      </p>
      <p>
        <strong>The loupe is per-body scaling made honest.</strong> Same arithmetic, wrapped
        in a signifier that announces the rescale. That is the whole idea: it does not escape
        per-body scaling, it legitimises it.
      </p>

      <h3>The particle-model dot</h3>
      <p>
        A magnifying glass magnifies <em>space</em>; what we need to change is{' '}
        <em>force scale</em>. Those come apart badly here — a 500× spatial zoom on a feather
        shows a few square millimetres of barrel with the arrows in exactly the same
        proportion, because the problem was never spatial resolution. So the body inside the
        loupe is drawn as a <strong>dot</strong>: the particle model, the actual convention
        of the free-body diagram, and the same reduction every physics textbook makes when it
        says "treat the object as a point mass." It makes the absence of a spatial claim
        explicit rather than merely hoped for. The rejected-alternative card below shows why
        a silhouette is worse: a lens around a recognisable shape promises spatial
        magnification the loupe does not deliver.
      </p>
      <p>
        The second honesty device is a <strong>labelled scale bar</strong> rather than a bare
        "×500" factor — the micrograph and map convention. It answers the observant student
        directly, in the units of the quantity, and it degrades gracefully when the loupe is
        small.
      </p>

      <h3>Why it is gated on pause</h3>
      <p>
        A free-body diagram is inherently a <em>single-instant</em> object; textbook FBDs are
        always drawn at an instant, and drawing them continuously during motion is a bonus
        GIST happens to offer. Gating the loupe on pause aligns the affordance with that:
        playing is the qualitative read (stubs say "a force is here, too small to draw"),
        paused is the quantitative read (the loupe says what it is). The stub stops being a
        dead end and becomes an invitation.
      </p>
      <p>
        <strong>The cost, and the fix.</strong> The feather's lesson is dynamic — drag growing
        until it cancels weight is a process, and static snapshots do not show growth. So the
        loupe must stay live under <em>scrub</em>, not just static pause. The frame cache
        holds every recorded frame with full force data and{' '}
        <a href="/docs/runtime-loop">replay never drops frames</a>, so scrubbing with the
        loupe open recovers the dynamics frame by frame — arguably better than real time,
        since at 1.6 m/s terminal the interesting part is over in a third of a second. Treat
        "live under scrub" as part of the definition, not an enhancement.
      </p>

      <div className="not-prose grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
        <LoupeProblemScene />
        <LoupeParticleScene />
        <LoupeOutlineScene />
        <LoupeAnchoredScene />
      </div>

      <h3>Placement</h3>
      <p>
        Lean: <strong>selection-gated and anchored</strong>. On pause, clicking a body opens
        its loupe beside it with a leader line, at a fixed pixel size so it is invariant to
        diorama scale. Selection-gating solves crowding, multi-body ambiguity, and occlusion
        in one move, and it reuses an affordance the debug tooling already has. Bodies near a
        canvas edge dock their loupe to the nearest corner, keeping the leader.
      </p>
      <p>
        The tempting alternative — auto-appearing on every sub-threshold body — sounds more
        helpful and is probably worse: most bodies have <em>some</em> sub-floor arrow at some
        instant, so loupes would bloom everywhere. If it is ever made automatic, the trigger
        should be that the body's <em>largest</em> force arrow is under the floor, meaning the
        whole diagram is illegible, not merely one component of it.
      </p>

      <h3>Open questions</h3>
      <ul>
        <li>
          <strong>Circle or inset rectangle?</strong> The circle carries the magnifier
          metaphor that makes the affordance instantly readable, and simultaneously carries
          the spatial-zoom implication we are trying to disown. The dot plus scale bar may
          defuse that; if it does not, a rounded-rect inset reads as "inset diagram" and drops
          the metaphor entirely. Worth trying both on a drive.
        </li>
        <li>
          <strong>Does it overlap the vector panel?</strong> A separate autoscaled
          bar-chart-style panel (discussed 2026-08-08) solves the cross-body, quantitative,
          always-on half; the loupe solves the single-body, proportional, in-place half. Both
          are defensible — but shipping both without naming one as primary gives a student two
          answers to "how big is this force" that they then have to reconcile.
        </li>
        <li>
          <strong>Or is the numeric-values toggle enough?</strong> Numbers beside the stubs
          (currently HELD) would answer the quantitative need for a fraction of the effort,
          at the cost of proportional reading — which is what arrows are for. Plausible
          sequencing: numbers as the cheap stepping stone, loupe as the real answer.
        </li>
        <li>
          <strong>What sets the loupe's scale?</strong> Normalise so the body's largest force
          hits a target pixel budget (self-tuning, but the scale changes as you scrub), or pin
          it per pause (stable, but can under- or overflow). Leaning: normalise on open, then
          hold it for the duration of that selection so scrubbing shows real growth rather
          than a rescaling illusion.
        </li>
        <li>
          <strong>Multiple loupes at once?</strong> Comparing two bodies is a real teaching
          move, but two different interior scales side by side reintroduces exactly the
          confusion the scale bar is fighting. If allowed, they should probably share one
          interior scale.
        </li>
      </ul>
      <p>
        Cost note: this is a purely render-side affordance — no physics, no{' '}
        <code>Frame</code> schema change, no three-places pass — so it can ship debug-first
        behind a flag exactly as <code>?forces=1</code> did. It also does not depend on the
        unresolved analytical-vs-engine representation call, because it concerns scale
        legibility rather than where the numbers come from.
      </p>

      <h2>Geometry conventions</h2>
      <ul>
        <li>
          <strong>Tail anchor:</strong> body centroid (in canvas pixels), unless an explicit{' '}
          <code>anchor</code> override is supplied. Force arrows traditionally come from the
          centroid; component legs (<code>components: true</code>) also originate at the centroid —
          both vₓ and v_y share the body's tail (PhET-style), rather than being drawn tip-to-tail.
        </li>
        <li>
          <strong>Component-leg dash:</strong> shafts of component arrows (the vₓ / v_y legs from a{' '}
          <code>components: true</code> entry) are dashed —{' '}
          <code>VECTOR_GEOMETRY.componentDash = [7, 5]</code> px on/off — with a filled head, so they
          read distinctly from the solid resultant. The dash pattern lives in{' '}
          <code>vectorTheme.ts</code> (the one knob) alongside the other geometry constants.
        </li>
        <li>
          <strong>Line width:</strong> 3 px. <strong>Head length:</strong> 12 px.{' '}
          <strong>Head half-angle:</strong> 30°.
        </li>
        <li>
          <strong>Shaft ends at the head's base, not its apex.</strong> The line stops{' '}
          <code>headLength · cos(headAngle) ≈ 10.4 px</code> short of the tip so the head's
          polygon sits flush atop the shaft. Without this, the line's rounded cap pokes past
          the head's apex (a small "dot" artifact visible in early renders).
        </li>
        <li>
          <strong>Minimum arrow length:</strong> 14 px — below this, non-force arrows are
          suppressed. Tuned so that after subtracting the shaft backoff, a visible shaft stub
          still remains. Prevents jittery sub-pixel arrows when a quantity is near zero.
        </li>
        <li>
          <strong>Sub-floor force stub</strong> (FBD step 4, 2026-08-06): a FORCE kind whose
          true length lands between 0.1 px and the 14 px floor draws a fixed 10 px dashed stub
          with a <em>hollow</em> arrowhead — direction real, magnitude "not to scale". Without
          it, a block creeping just past breakaway showed no F_net and read as equilibrium.
          At or below 0.1 px (physically zero, rest-noise is ~10⁻³ px) nothing draws, so{' '}
          <em>stuck</em> and <em>creeping</em> stay visually distinct.
        </li>
        <li>
          <strong>Y-up → Y-down flip:</strong> centralized in the draw function. Callers pass
          vectors in physics frame (Y-up, matching <code>body.velocity</code>); the drawer flips.
        </li>
      </ul>

      <h2>Label conventions</h2>
      <ul>
        <li>
          <strong>Default placement:</strong> midpoint of the shaft, with a perpendicular offset
          to the arrow's left side ({VECTOR_LABEL_DEFAULTS.perpendicularOffsetPx} px +
          fontSize-aware padding). Rotates with the arrow; never sits on the shaft.
        </li>
        <li>
          <strong>Default font:</strong> 13 px <code>system-ui</code>, weight 600. Same color as
          the arrow.
        </li>
        <li>
          <strong>Default text:</strong> structured as <code>{`{ main, sub? }`}</code> per kind so
          subscripts render via SVG <code>{'<tspan>'}</code> (smaller font, lower baseline).
          Unicode subscripts cover only a partial set of letters (no <code>f</code>,{' '}
          <code>r</code>, <code>d</code>, or <code>g</code>) — using <code>{'<tspan>'}</code>{' '}
          handles arbitrary multi-character subscripts (<code>net</code>, <code>app</code>,{' '}
          <code>ar</code>) cleanly. Pass <code>label={'{null}'}</code> to suppress.
        </li>
        <li>
          <strong>Per-arrow overrides (all optional):</strong> <code>label</code> (string for a
          plain custom label, <code>{`{ main, sub? }`}</code> for a structured one),{' '}
          <code>labelPlacement</code> (<code>tail</code> | <code>midpoint</code> |{' '}
          <code>head</code>), <code>labelFontSize</code>, <code>color</code>,{' '}
          <code>pixelsPerUnit</code>. The "Label flexibility" scene above shows three
          placements/sizes side-by-side.
        </li>
        <li>
          <strong>Collision (Phase 4 polish):</strong> when two arrows share a tail and are
          near-parallel, labels can overlap. Plan: detect co-linear arrows and stagger labels to
          opposite sides. Not a Phase 1 blocker.
        </li>
      </ul>

      <h2>Schema additions</h2>
      <p>
        The current per-object <code>showForceArrows: boolean</code>{' '}
        becomes a richer <code>showVectors</code> array. Both shorthand strings and full configs
        are accepted; parser normalizes:
      </p>
      <pre className="bg-gray-100 rounded p-4 text-xs overflow-x-auto">{`"objects": [{
  // Shorthand: list of kinds with default styling.
  "showVectors": ["velocity", "acceleration"]

  // Or full form, with per-arrow overrides:
  "showVectors": [
    { "kind": "velocity" },
    { "kind": "acceleration", "color": "#7e57c2" },
    { "kind": "force-net", "label": "ΣF", "labelPlacement": "head" }
  ]

  // Component decomposition: draw the two axis-aligned legs
  // (dashed vₓ / v_y from the body) instead of the resultant.
  // List the plain kind too to show the resultant alongside them.
  "showVectors": ["velocity", { "kind": "velocity", "components": true }]
}]`}</pre>
      <p>
        The legacy <code>showForceArrows: true</code> normalizes to{' '}
        <code>showVectors: ["force-net"]</code> for one release, then is dropped.
      </p>
      <p>
        <strong>
          Component decomposition (<code>components: true</code>, SHIPPED 2026-07-22).
        </strong>{' '}
        A full-config entry with <code>components: true</code> is fanned — at synthesis time in{' '}
        <code>synthesize.ts</code> — into <em>two</em> axis-locked arrows (an internal{' '}
        <code>axis: 'x' | 'y'</code> discriminator on the visual), one per component. The renderer
        zeroes the off-axis component, dashes the shaft, and derives the subscript from the kind's
        default label (<code>v → vₓ / v_y</code>, <code>F_net → F_net,x / F_net,y</code>). Both legs
        originate at the body; the resultant is <em>not</em> drawn by that entry, so composing{' '}
        <code>["velocity", {`{ "kind": "velocity", "components": true }`}]</code> shows the solid
        resultant with its dashed legs (the "Velocity components" scene above). Decomposition is
        horizontal/vertical only for now — the bare-boolean field and the internal axis
        discriminator are the extension points for a future <strong>rotated basis</strong>{' '}
        (incline-plane sims: <code>'parallel' | 'perp'</code> + a basis angle, axis-aligned being
        the θ=0 case). Where that basis angle should live — per-arrow vs. an env-level tilted
        coordinate frame — is an open fork parked in <code>parking_lot.md</code>.
      </p>

      <h2>Runtime modes &amp; what they mean for vector arrows</h2>
      <p>
        See <a href="/docs/runtime-loop">3. Runtime loop</a> for the general picture of
        BaseSimulation's three modes (<em>live</em>, <em>precomputing</em>,{' '}
        <em>replay</em>). The piece that matters specifically for vector arrows is{' '}
        <strong>where each kind gets its numbers</strong> — because that question
        was being answered badly. Two bugs surfaced in close succession (Phase 1b
        and the discovery that became Phase 1c-rev), and the cleanest fix isn't a
        patch but an architectural reframe: <strong>derived physics belongs in the
        Frame, not in <code>userData</code></strong>.
      </p>

      <h3>The architectural shift</h3>
      <p>
        Pre-1c, the data pipeline split state into two stores:
      </p>
      <ul>
        <li>
          <strong>Direct state</strong> — values living on the physics body or
          world: <code>body.velocity</code>, <code>body.position</code>,{' '}
          <code>body.angle</code>, <code>body.mass</code>, world{' '}
          <code>gravity</code>. These rode in <code>WorldSnapshot</code> and were
          written back into the body by <code>adapter.restore()</code> at every
          replay frame. Always current.
        </li>
        <li>
          <strong>Derived state</strong> — values written by{' '}
          <code>JsonSimulation.handleUpdate</code> to <code>body.userData</code>:{' '}
          <code>userData.derivedAcceleration</code> and (future) per-force vectors.
          These were <em>not</em> in the snapshot. During replay,{' '}
          <code>handleUpdate</code> early-returned, so userData froze at its
          end-of-precompute value. The F<sub>net</sub> arrow vanished during the
          visible replay because the value backing it was stale.
        </li>
      </ul>
      <p>
        Phase 1c-rev erases the split. Every quantity a vector arrow needs to
        display — kinematic (velocity, acceleration) and dynamic (force vectors,
        contact data) — is computed during precompute and stored in the per-frame
        recording. <strong>Replay does no physics calculation</strong>; it reads
        the frame and writes its contents back to the body. Vector arrow source
        resolvers don't know or care whether they're seeing live physics or
        replayed data — they always read from the body, and the body always has
        fresh state because either the engine just stepped it (live) or the
        replay loop just restored it from a frame (replay).
      </p>
      <p>
        This is the architectural pattern formalized in{' '}
        <a href="/docs/recordings-and-cameras">7. Recordings &amp; cameras</a>:
        rich precompute, lean replay. The per-frame schema becomes "everything you
        could possibly want to visualize," tiered by diorama type (kinematics,
        dynamics, momentum). Recordings become sealed artifacts that can be saved,
        shared, scrubbed, and compared — none of which requires the physics engine
        to run again.
      </p>

      <h3>The data flow across precompute → replay</h3>
      <MermaidDiagram
        chart={precomputeReplayChart}
        caption="Pre-1c, derived state was on userData and got clobbered each replay frame. Post-1c-rev, derived state IS the Frame: handleUpdate writes it during precompute, the replay loop writes it back to the body during replay, and vector resolvers read from the body unchanged. Same data path, mode-agnostic."
      />

      <h3>Per-kind dependency</h3>
      <p>
        With Phase 1c-rev, every kind reads from the body. The architectural
        question is just <em>what gets recorded in the Frame so the body has the
          right state during replay</em>. Tiers grow as needed:
      </p>
      <div className="not-prose overflow-x-auto">
        <table className="min-w-full text-sm border-collapse border border-gray-200 rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left border border-gray-200">Kind</th>
              <th className="px-3 py-2 text-left border border-gray-200">Source on body</th>
              <th className="px-3 py-2 text-left border border-gray-200">Recorded in Frame?</th>
              <th className="px-3 py-2 text-left border border-gray-200">Tier</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-2 border border-gray-200 font-mono text-xs">velocity</td>
              <td className="px-3 py-2 border border-gray-200"><code>body.velocity</code></td>
              <td className="px-3 py-2 border border-gray-200">Yes (new in 1c-rev: vx, vy, omega)</td>
              <td className="px-3 py-2 border border-gray-200">Kinematics</td>
            </tr>
            <tr>
              <td className="px-3 py-2 border border-gray-200 font-mono text-xs">acceleration</td>
              <td className="px-3 py-2 border border-gray-200"><code>userData.derivedAcceleration</code></td>
              <td className="px-3 py-2 border border-gray-200">Yes (new: ax, ay, alpha)</td>
              <td className="px-3 py-2 border border-gray-200">Kinematics</td>
            </tr>
            <tr>
              <td className="px-3 py-2 border border-gray-200 font-mono text-xs">force-net</td>
              <td className="px-3 py-2 border border-gray-200"><code>m · userData.derivedAcceleration</code></td>
              <td className="px-3 py-2 border border-gray-200">Derived at render from acceleration</td>
              <td className="px-3 py-2 border border-gray-200">Kinematics</td>
            </tr>
            <tr>
              <td className="px-3 py-2 border border-gray-200 font-mono text-xs">force-applied</td>
              <td className="px-3 py-2 border border-gray-200"><code>userData.appliedForce</code></td>
              <td className="px-3 py-2 border border-gray-200">Yes (Phase 3, dynamics tier)</td>
              <td className="px-3 py-2 border border-gray-200">Dynamics</td>
            </tr>
            <tr>
              <td className="px-3 py-2 border border-gray-200 font-mono text-xs">force-friction</td>
              <td className="px-3 py-2 border border-gray-200"><code>userData.frictionForce</code> (engine-read)</td>
              <td className="px-3 py-2 border border-gray-200">Yes — shipped FBD step 3 (fricFx/fricFy)</td>
              <td className="px-3 py-2 border border-gray-200">Dynamics</td>
            </tr>
            <tr>
              <td className="px-3 py-2 border border-gray-200 font-mono text-xs">force-normal</td>
              <td className="px-3 py-2 border border-gray-200"><code>userData.normalForce</code> (engine-read)</td>
              <td className="px-3 py-2 border border-gray-200">Yes — shipped FBD step 3 (normalFx/normalFy)</td>
              <td className="px-3 py-2 border border-gray-200">Dynamics</td>
            </tr>
            <tr>
              <td className="px-3 py-2 border border-gray-200 font-mono text-xs">force-drag</td>
              <td className="px-3 py-2 border border-gray-200"><code>userData.dragForce</code></td>
              <td className="px-3 py-2 border border-gray-200">Yes (Phase 3, dynamics tier)</td>
              <td className="px-3 py-2 border border-gray-200">Dynamics</td>
            </tr>
            <tr>
              <td className="px-3 py-2 border border-gray-200 font-mono text-xs">force-gravity</td>
              <td className="px-3 py-2 border border-gray-200"><code>m · drawCtx.gravity</code></td>
              <td className="px-3 py-2 border border-gray-200">No — derived inline from world gravity</td>
              <td className="px-3 py-2 border border-gray-200">All</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>How Phase 1b's fix exposed Phase 1c's bug</h3>
      <p>
        The legacy <code>ForceArrow</code> computed{' '}
        <code>F = m · (a_derived + g)</code>. That <code>+ g</code> term was quietly
        playing two roles:
      </p>
      <ol>
        <li>
          <strong>Pedagogically wrong, but visually convenient.</strong> It baked
          gravity into the visual so even when <code>derivedAcceleration</code>{' '}
          was zero (resting body, terminal velocity, any equilibrium), the arrow
          still showed the body's <em>weight</em> rather than nothing. That's not
          Newton's-2nd-Law net force — it's "the arrow that's never zero" — but it
          kept something on screen.
        </li>
        <li>
          <strong>Accidental replay safety net.</strong> Because{' '}
          <code>g</code> is read from <code>drawCtx.gravity</code> (a direct,
          world-level read, not userData), even when{' '}
          <code>derivedAcceleration</code> went stale during replay, the arrow
          still rendered as roughly <code>m·g</code>. Wrong physics, but visibly{' '}
          <em>something</em>. The stale-userData bug never surfaced because the
          gravity term was always doing the work.
        </li>
      </ol>
      <p>
        Phase 1b fixed (1): the visual now computes{' '}
        <code>F_net = m · a_derived</code> honestly. That immediately made (2)
        visible — and you spotted it within minutes of running the
        bowling-ball-and-feather sim. Two bugs for the price of one fix, and the
        second bug's correct fix is the architectural reframe above.
      </p>

      <h3>Phase 1c-rev — store kinematics in the Frame</h3>
      <p>Three edits restore correctness <em>and</em> set the architectural
        precedent for everything downstream:</p>
      <ul>
        <li>
          <strong>Extend <code>FrameBodySnap</code></strong> to include kinematic
          state: <code>vx</code>, <code>vy</code>, <code>omega</code>,{' '}
          <code>ax</code>, <code>ay</code>, <code>alpha</code>. Roughly doubles the
          per-body bytes (still trivial in absolute terms — see{' '}
          <a href="/docs/recordings-and-cameras">recordings doc</a> for sizing).
        </li>
        <li>
          <strong>Precompute recording path</strong> (in JsonSimulation, after each
          frame's <code>adapter.step()</code>) captures these fields from{' '}
          <code>body.velocity</code> / <code>angularVelocity</code> and{' '}
          <code>userData.derivedAcceleration</code> at frame-capture time. No new
          computation — just include them in the recorded Frame.
        </li>
        <li>
          <strong>Replay restoration path</strong> (<code>handleReplayFrame</code>)
          writes those fields back to <code>body.velocity</code>,{' '}
          <code>body.angularVelocity</code>, and{' '}
          <code>body.userData.derivedAcceleration</code>. Vector arrow source
          resolvers see the same body interface in any mode.
        </li>
      </ul>
      <p>
        Result: every replay frame has correct kinematic state. F<sub>net</sub>{' '}
        renders correctly throughout the replay — weight-magnitude during free
        fall, zero at rest and at terminal velocity, net-of-friction during sliding.
        Seek to any frame index works without finite-diff acrobatics — the data is
        in the frame, no derivation needed.
      </p>

      <h3>Implications for future kinds — pattern now proven three times</h3>
      <p>
        <code>force-drag</code> (FBD step 2, 2026-07-24) and the engine-read{' '}
        <code>force-friction</code> / <code>force-normal</code> pair (FBD step 3,
        2026-08-06, via the adapter's <code>getContactForces()</code> seam) landed
        exactly this way: their source vectors are computed during precompute and
        ride the Frame (<code>dragFx/dragFy</code>,{' '}
        <code>normalFx/normalFy/fricFx/fricFy</code> on FrameBodySnap). The vector
        resolver reads from the body during render; the body has fresh state
        because replay just restored it from the frame. The still-unwired{' '}
        <code>force-applied</code> must follow the same pattern when its pipeline
        lands. <strong>No mode-aware code in the visual layer. No userData
          write-during-replay invariant to remember.</strong>
      </p>
      <p>
        <strong>The invariant for new derived kinds is now structural, not
          behavioral:</strong> if a value must be visible in replay, it goes in the
        Frame schema for that diorama tier. Period. Putting it on userData without
        also recording it in the Frame is the same bug class as Phase 1c, and the
        symptom is the same — works in precompute, vanishes in replay. The Frame
        schema makes "what gets seen" a compile-time question, not a runtime hope.
      </p>

      <h2>Phasing</h2>
      <MermaidDiagram
        chart={phaseChart}
        caption="Phase 1 split into three sub-phases as bugs surfaced during testing: 1a renames + adds the kind field; 1b fixes the gravity double-count in F_net; 1c-rev extends the Frame schema to carry kinematic state, so vector arrows render correctly during replay. 2+ are the original phases unchanged."
      />
      <ul>
        <li>
          <strong>Phase 1a — theme module + rename + kind field. <em>SHIPPED.</em></strong>{' '}
          Created <code>vectorTheme.ts</code>. Renamed <code>ForceArrowVisual</code> →{' '}
          <code>VectorArrowVisual</code> with a <code>kind</code> field. Default kind ={' '}
          <code>force-net</code>. Visual type string <code>'force-arrow'</code> →{' '}
          <code>'vector-arrow'</code>. Existing sims with <code>showForceArrows: true</code>{' '}
          continued rendering identically (now with an F<sub>net</sub> label).
        </li>
        <li>
          <strong>Phase 1b — drop the gravity double-count in <code>F_net</code>.{' '}
          <em>SHIPPED.</em></strong> The legacy formula{' '}
          <code>m · (a_derived + g)</code> was wrong: <code>a_derived</code> is the body's
          total acceleration (including gravity), so adding <code>g</code> separately
          double-counted. New formula: <code>F_net = m · a_derived</code>. Resting bodies
          show no arrow, falling bodies show their weight (half the legacy doubled
          length), terminal velocity shows no arrow.
        </li>
        <li>
          <strong>Phase 1c-rev — store kinematics in the Frame schema.{' '}
            <em>SHIPPED 2026-05-15.</em></strong> Discovered immediately after 1b shipped: F<sub>net</sub>{' '}
          arrows blinked during precompute and vanished during the visible replay. Initial
          diagnosis was "call <code>handleUpdate</code> during replay too"; deeper
          investigation found that the replay frame schema only carried position +
          angle — no velocity, no acceleration — so even firing{' '}
          <code>handleUpdate</code> would have finite-diffed against stale values. The
          architecturally correct fix was to extend <code>FrameBodySnap</code> with{' '}
          <code>vx, vy, omega, ax, ay, alpha</code>, populate them during precompute,
          and restore them during replay. Sets the precedent that derived data lives
          in the Frame, not on userData — see{' '}
          <a href="/docs/recordings-and-cameras">recordings doc</a> for the broader
          architecture this fix established. A related runtime-loop fix landed in the
          same pass: the replay branch of <code>BaseSimulation</code>'s rAF loop now
          advances at most one frame per paint, so one-frame-wide events (collision F<sub>net</sub>{' '}
          spikes) survive rAF hiccups instead of being clobbered by catch-up iterations
          before <code>RenderLayer</code> reads <code>userData</code>. See{' '}
          <code>Notes_on_Vector_Representation_Refactor.md</code> for the full writeup.
        </li>
        <li>
          <strong>Phase 2 — velocity + acceleration kinds + <code>showVectors</code> schema.{' '}
          <em>SHIPPED 2026-05-20.</em></strong> The source resolver in{' '}
          <code>VectorArrow.ts</code> now lights up <code>kind: 'velocity'</code> (reads{' '}
          <code>body.velocity</code>) and <code>kind: 'acceleration'</code> (reads{' '}
          <code>body.userData.derivedAcceleration</code> with a <code>{`{0,0}`}</code> fallback
          for the very first live tick before <code>handleUpdate</code> runs once).
          No physics or Frame-schema work needed — Phase 1c-rev had already recorded the
          kinematics, so the visual layer is mode-agnostic across live and replay on both
          engines (Rapier and Planck verified). The per-object{' '}
          <code>showForceArrows: boolean</code> field is replaced by{' '}
          <code>showVectors: Array&lt;VectorKind | VectorArrowConfig&gt;</code> — a discriminated
          form that accepts both kind-string shorthand (<code>["velocity", "acceleration"]</code>)
          and full per-arrow override configs (<code>{`{ kind, color?, label?, labelPlacement?, labelFontSize?, pixelsPerUnit? }`}</code>).
          Legacy <code>showForceArrows: true</code> is auto-translated to{' '}
          <code>showVectors: ["force-net"]</code> via a <code>z.preprocess</code> shim on parse
          plus a runtime fallback in the synthesize step (the latter catches Supabase-loaded
          sims that bypass schema validation — see{' '}
          <code>parking_lot.md</code> for the broader load-path gap this surfaced).
          The LLM prompt was updated and re-deployed to Modal so generated sims author{' '}
          <code>showVectors</code> natively. Acceptance test confirmed end-to-end with a
          projectile sim showing green velocity, purple acceleration, and red F<sub>net</sub>{' '}
          simultaneously on one body.
        </li>
        <li>
          <strong>Phase 2.5 — acceleration sliders unlocked (LLM-authoring).{' '}
          <em>SHIPPED 2026-05-20.</em></strong> Adjacent to Phase 2 but a controls-system change,
          not a vector-arrow one. The runtime stack was already wired end-to-end —
          <code>ObjectRenderer</code> initializes{' '}
          <code>userData.configuredAcceleration</code> from the object's <code>acceleration</code>{' '}
          field at body creation, <code>JsonSimulation.handleUpdate</code> integrates it via{' '}
          <code>v += a·dt</code> each frame, and <code>setNestedValue</code> routes slider
          writes to <code>acceleration.x</code> / <code>acceleration.y</code> through the same
          path. The only gap was that <code>SliderConfigSchema.property</code>'s describe text
          (the LLM-facing one) omitted the acceleration options that{' '}
          <code>OutputConfig</code> and <code>GraphConfig</code> already listed, so the LLM
          never authored acceleration sliders. Fixed by updating the slider's property describe,
          the object's <code>acceleration</code> describe (clarifying it's an{' '}
          <em>additional</em> constant acceleration on top of environment gravity — rocket
          thrust, braking, conveyor push — not a gravity override), and the FILL CONTROLS
          fragment of the LLM prompt. Composes naturally with Phase 2's acceleration arrow:
          students can now drag a slider and watch the purple acceleration arrow respond.
        </li>
        <li>
          <strong>Phase 3 — applied / friction / drag / gravity kinds.</strong> Reads{' '}
          <code>userData.appliedForce</code>, <code>frictionForce</code>, <code>dragForce</code>{' '}
          (populated by <code>JsonSimulation.onUpdate</code> as the applied-forces and
          air-resistance refactors land their fields). Gravity is computed inline from{' '}
          <code>m · g</code>.
        </li>
        <li>
          <strong>Phase 4 — legend overlay + diorama presets.</strong> A small "What you're
          seeing" legend in the canvas corner driven by the same theme. Per-diorama default
          arrow sets (a "Free Fall" diorama defaults to <code>v</code> + <code>a</code>; a
          "Newton's 2nd" diorama defaults to <code>F_app</code> + <code>F_f</code> +{' '}
          <code>F_net</code>) — these become menu presets the LLM picks from.
        </li>
        <li>
          <strong>Phase 5 — auto-scale calibration (optional).</strong> One-pass calibration
          during precompute that picks <code>pixelsPerUnit</code> per kind so the largest-magnitude
          vector across the simulation fits a target pixel budget. Avoids "arrow offscreen" /
          "arrow invisible" footguns.
        </li>
      </ul>

      <h2>Coordination with other refactors</h2>
      <ul>
        <li>
          <strong>Applied forces refactor.</strong> Its Phase 2 calls for a{' '}
          <code>ForceArrow</code> renderable; this work delivers a generalized version that
          covers it. Once <code>userData.appliedForce</code> lands, the{' '}
          <code>force-applied</code> kind lights up automatically —{' '}
          <code>userData.frictionForce</code> proved the pattern when the engine
          contact-force seam populated it (FBD step 3, 2026-08-06).
        </li>
        <li>
          <strong>Vector representation refactor.</strong> Its Phase 3 calls for a shared{' '}
          <code>VectorArrow</code> renderable. This is that. The polar projections (
          <code>.magnitude</code> / <code>.angle</code>) operate on the same{' '}
          <code>body.velocity</code> / <code>userData.appliedForce</code> fields the arrow
          visualizes — orthogonal binding-layer work.
        </li>
        <li>
          <strong>Air resistance refactor.</strong> Once Phase 2 of that work writes{' '}
          <code>userData.dragForce</code>, the <code>force-drag</code> kind in this refactor
          renders it. No coordination needed beyond the userData contract.
        </li>
        <li>
          <strong>Diorama model.</strong> This work is "left-wall standard UI." Every diorama
          floor (free fall, projectile, Newton's 2nd, tug-of-war, friction breakaway) reaches up
          to it. Promotion criterion satisfied — at least three planned dioramas already need
          it.
        </li>
      </ul>

      <h2>Open questions</h2>
      <ul>
        <li>
          <strong>Net-force computation on inclines.</strong> The current{' '}
          <code>force-net</code> source uses <code>m · a_derived</code> — Newton's 2nd Law
          applied to the body's finite-differenced total acceleration — which is correct on
          any geometry. The decomposed forces (applied / friction / gravity) sum to the same
          net <em>only on flat ground</em> unless the analytical decomposition is ramp-aware
          (see the applied-forces doc's "ramp-aware analytical" question). Worth showing both{' '}
          <code>force-net</code> and the decomposed sum side-by-side on the static-friction
          ramp diorama to make the difference visible to students — or to flag a bug.
        </li>
        <li>
          <strong>Phase 1b + 1c-rev: legacy-formula correction and the architectural reframe
            it forced.</strong> The pre-refactor <code>ForceArrow</code> computed{' '}
          <code>m · (a_derived + g)</code>, which silently double-counted gravity. Phase 1b
          dropped the extra <code>+ g</code> — visible consequence: a body at rest now shows
          no F<sub>net</sub> arrow, free fall is <code>m·g</code> (half the legacy length),
          terminal velocity is no arrow. That fix unmasked a deeper issue: the replay frame
          schema only carried position + angle (no velocity, no acceleration), so even if
          replay re-ran the finite-diff it would do so on stale values. Phase 1c-rev moves
          derived physics into the Frame schema itself — see the "Runtime modes" section and{' '}
          <a href="/docs/recordings-and-cameras">7. Recordings &amp; cameras</a> for the
          architecture. Any saved sims that were visually tuned against the old (doubled)
          arrow lengths will look different.
        </li>
        <li>
          <strong>Acceleration arrow noise.</strong> <code>derivedAcceleration</code> is
          finite-differenced, so it spikes on collision frames. A small EWMA on the displayed
          value (not the underlying physics) might smooth the visual. Phase 4 polish.
        </li>
        <li>
          <strong>Legend overlay placement.</strong> Top-right corner of canvas? Bottom edge?
          Or in the side panel as part of the controls? Lean: bottom-right, dismissable. Wait
          for Phase 4 design.
        </li>
        <li>
          <strong>Should magnitude readouts attach to labels?</strong> e.g.,{' '}
          <code>v = 5.0 m/s</code> next to the arrow head. PhET does this, and it's compelling
          pedagogically. Risk: clutter when many arrows are visible. Lean: opt-in via{' '}
          <code>showMagnitude: true</code> per-arrow.
        </li>
        <li>
          <strong>Component decomposition arrows.</strong> A "show v as <code>vx</code> +{' '}
          <code>vy</code>" mode that draws two right-angle arrows from the tail and a dashed
          parallelogram. Out of scope here; flagged for a future "vector decomposition" left-wall
          extension. Pairs with the vector-rep refactor's polar projections.
        </li>
      </ul>

      <h2>Source files</h2>
      <ul>
        <li>
          Existing: <code>src/components/simulation_components/renderables/visuals/ForceArrow.ts</code> —
          to be replaced by <code>VectorArrow.ts</code>.
        </li>
        <li>
          Existing: <code>src/components/simulation_components/renderables/types.ts</code> —{' '}
          <code>ForceArrowVisual</code> → <code>VectorArrowVisual</code>.
        </li>
        <li>
          Existing: <code>src/components/simulation_components/renderables/synthesize.ts</code> —{' '}
          <code>synthesizeForceArrowRenderable</code> updates to read <code>showVectors</code>.
        </li>
        <li>
          Existing: <code>src/components/JsonSimulation.tsx</code> — currently writes{' '}
          <code>userData.derivedAcceleration</code>; will additionally write{' '}
          <code>userData.frictionForce</code> / <code>dragForce</code> when those refactors land.
        </li>
        <li>
          New: <code>src/components/simulation_components/renderables/vectorTheme.ts</code> —
          colors, symbols, default scales, geometry, label defaults.
        </li>
      </ul>
    </DocsLayout>
  );
}

export default VectorArrows;
