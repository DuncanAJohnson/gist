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
  P1["Phase 1: theme + rename<br/>(no behavior change;<br/>force-net keeps drawing)"]
  P2["Phase 2: velocity + acceleration<br/>(free-fall + projectile dioramas)"]
  P3["Phase 3: applied / friction / drag<br/>(coordinates with applied-forces)"]
  P4["Phase 4: legend overlay<br/>+ diorama presets"]
  P5["Phase 5: auto-scale calibration<br/>(optional)"]
  P1 --> P2 --> P3 --> P4 --> P5

  classDef done fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef pending fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  class P1,P2,P3,P4,P5 pending;
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
                ['force-net', '2 px per N', 'm · (a + g)'],
                ['force-applied', '2 px per N', 'userData.appliedForce'],
                ['force-friction', '2 px per N', 'userData.frictionForce (analytical)'],
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
        <AppliedForceScene />
        <FrictionScene />
        <DragScene />
        <GravityScene />
        <NewtonsSecondScene />
      </div>

      <div className="not-prose my-6">
        <LabelOverridesScene />
      </div>

      <h2>Geometry conventions</h2>
      <ul>
        <li>
          <strong>Tail anchor:</strong> body centroid (in canvas pixels), unless an explicit{' '}
          <code>anchor</code> override is supplied. Force arrows traditionally come from the
          centroid; component-decomposition diagrams may want edge anchors.
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
          <strong>Minimum arrow length:</strong> 14 px — below this, the arrow is suppressed.
          Tuned so that after subtracting the shaft backoff, a visible shaft stub still remains.
          Prevents jittery sub-pixel arrows when a quantity is near zero.
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
}]`}</pre>
      <p>
        The legacy <code>showForceArrows: true</code> normalizes to{' '}
        <code>showVectors: ["force-net"]</code> for one release, then is dropped.
      </p>

      <h2>Phasing</h2>
      <MermaidDiagram
        chart={phaseChart}
        caption="Five phases. Phase 1 is a pure refactor (no rendered output changes). Phase 2 unlocks the free-fall and projectile dioramas. Phase 3 lights up Newton's 2nd Law and tug-of-war once applied-forces lands the userData fields."
      />
      <ul>
        <li>
          <strong>Phase 1 — theme + rename.</strong> Create{' '}
          <code>vectorTheme.ts</code>. Rename <code>ForceArrowVisual</code> →{' '}
          <code>VectorArrowVisual</code> with a <code>kind</code> field. Default kind ={' '}
          <code>force-net</code>. Existing sims with <code>showForceArrows: true</code> render
          identically (now with an <code>F_net</code> label).
        </li>
        <li>
          <strong>Phase 2 — velocity + acceleration kinds.</strong> Source resolver reads{' '}
          <code>body.velocity</code> and <code>userData.derivedAcceleration</code> directly. No
          new physics work. Schema accepts <code>showVectors: ["velocity", "acceleration"]</code>.
          Acceptance: a free-fall sim shows a green-growing velocity arrow and a constant purple
          acceleration arrow.
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
          <code>force-applied</code> kind lights up automatically. Same for{' '}
          <code>userData.frictionForce</code> in the static-friction demo mode.
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
          <code>force-net</code> source uses <code>m · (a_derived + g)</code> — back-derived
          from velocity samples — which is correct on any geometry. The decomposed forces
          (applied / friction / gravity) sum to the same net <em>only on flat ground</em>{' '}
          unless the analytical decomposition is ramp-aware (see the applied-forces doc's
          "ramp-aware analytical" question). Worth showing both <code>force-net</code> and the
          decomposed sum side-by-side on the static-friction ramp diorama to make the
          difference visible to students — or to flag a bug.
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
