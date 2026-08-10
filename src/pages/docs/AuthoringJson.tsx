import DocsLayout from './DocsLayout';
import MermaidDiagram from '../../components/MermaidDiagram';

// ---------------------------------------------------------------------------
// Small presentational helpers (kept local to this page).
// ---------------------------------------------------------------------------

function Callout({
  tone = 'amber',
  title,
  children,
}: {
  tone?: 'amber' | 'blue' | 'red' | 'green';
  title: string;
  children: React.ReactNode;
}) {
  const palette = {
    amber: 'bg-amber-50 border-amber-300 text-amber-900',
    blue: 'bg-blue-50 border-blue-300 text-blue-900',
    red: 'bg-red-50 border-red-300 text-red-900',
    green: 'bg-green-50 border-green-300 text-green-900',
  }[tone];
  return (
    <div className={`not-prose my-4 rounded-lg border px-4 py-3 text-sm leading-relaxed ${palette}`}>
      <div className="font-semibold mb-1">{title}</div>
      <div className="[&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.85em]">
        {children}
      </div>
    </div>
  );
}

interface FieldRow {
  name: string;
  type: string;
  req?: boolean;
  desc: React.ReactNode;
}

function FieldTable({ rows }: { rows: FieldRow[] }) {
  return (
    <div className="not-prose my-4 overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-300">
            <th className="py-2 pr-4 font-semibold whitespace-nowrap">Field</th>
            <th className="py-2 pr-4 font-semibold whitespace-nowrap">Type</th>
            <th className="py-2 font-semibold">Meaning</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-gray-100 align-top">
              <td className="py-2 pr-4 whitespace-nowrap">
                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[0.85em] font-medium text-gray-900">
                  {r.name}
                </code>
                {r.req && <span className="ml-1 text-red-500 text-xs align-top">*</span>}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap text-gray-500 font-mono text-[0.8em]">{r.type}</td>
              <td className="py-2 text-gray-700 leading-relaxed">{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-xs text-gray-400">
        <span className="text-red-500">*</span> required
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagrams.
// ---------------------------------------------------------------------------

const anatomyChart = `
flowchart TB
  ROOT["Simulation JSON<br/>(one file = one sim)"]
  ROOT --> META["title · description<br/><i>strings — the header card</i>"]
  ROOT --> ENV["environment<br/><i>units · scale · gravity · walls · engine</i>"]
  ROOT --> OBJ["objects[]<br/><i>the physical bodies — 1–3 recommended</i>"]
  ROOT --> CTRL["controls[]<br/><i>sliders / toggles students drag</i>"]
  ROOT --> OUT["outputs[]<br/><i>live numeric readouts</i>"]
  ROOT --> GRAPH["graphs[]<br/><i>time-series line charts</i>"]

  CTRL -.->|targetObj + property| OBJ
  OUT -.->|targetObj + property| OBJ
  GRAPH -.->|targetObj + property| OBJ

  classDef root fill:#e0e7ff,stroke:#4f46e5,color:#3730a3,font-weight:bold;
  classDef body fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef ref fill:#fef3c7,stroke:#d97706,color:#92400e;
  class ROOT root;
  class OBJ body;
  class CTRL,OUT,GRAPH ref;
`;

const workflowChart = `
flowchart LR
  A["1 · Write<br/>src/simulations/<br/>mySim.json"] --> B["2 · Wrapper<br/>MySimSimulation.tsx<br/>(1 line + localJsonEdit)"]
  B --> C["3 · Route<br/>register in App.tsx<br/>/simulation/my-sim"]
  C --> D["4 · Run<br/>npm run dev<br/>open the route"]
  D --> E["5 · Iterate<br/>edit JSON · save · reload<br/>or Tweak JSON in-app"]
  E -->|not right yet| A

  classDef step fill:#eff6ff,stroke:#2563eb,color:#1e40af;
  class A,B,C,D,E step;
`;

const ingestChart = `
flowchart LR
  JSON["your .json"] --> CAST["asLocalSimConfig()<br/><i>type cast only — NO Zod .parse()</i>"]
  CAST --> EXP["containerExpansion.ts<br/><i>derive container width/height/svg</i>"]
  EXP --> SEAM["scaleObjectToSI<br/><i>units → SI · polar → x,y</i>"]
  SEAM --> ENGINE["PhysicsAdapter<br/>Rapier / Planck"]
  SEAM --> REND["renderers<br/>objects · vectors · graphs"]

  classDef seam fill:#f3e8ff,stroke:#9333ea,color:#6b21a8;
  classDef warn fill:#fee2e2,stroke:#dc2626,color:#991b1b;
  class SEAM,EXP seam;
  class CAST warn;
`;

// ---------------------------------------------------------------------------
// Coordinate-system SVG (Y-up, origin bottom-left).
// ---------------------------------------------------------------------------

function CoordinateSystem() {
  return (
    <figure className="not-prose my-6">
      <svg viewBox="0 0 460 300" className="w-full max-w-xl h-auto bg-gray-50 rounded-lg border border-gray-200" role="img" aria-label="GIST coordinate system: origin at bottom-left, X right, Y up">
        {/* canvas box */}
        <rect x="60" y="30" width="360" height="230" fill="#ffffff" stroke="#d1d5db" strokeDasharray="4 4" />
        {/* origin */}
        <circle cx="60" cy="260" r="4" fill="#dc2626" />
        <text x="30" y="278" fontSize="12" fill="#dc2626" fontWeight="bold">(0, 0)</text>
        {/* X axis */}
        <line x1="60" y1="260" x2="415" y2="260" stroke="#2563eb" strokeWidth="2" markerEnd="url(#arrX)" />
        <text x="380" y="252" fontSize="13" fill="#2563eb" fontWeight="bold">+X →</text>
        {/* Y axis */}
        <line x1="60" y1="260" x2="60" y2="35" stroke="#16a34a" strokeWidth="2" markerEnd="url(#arrY)" />
        <text x="70" y="48" fontSize="13" fill="#16a34a" fontWeight="bold">+Y ↑</text>
        {/* sample object */}
        <circle cx="250" cy="150" r="22" fill="#fde68a" stroke="#d97706" strokeWidth="1.5" />
        <circle cx="250" cy="150" r="2.5" fill="#92400e" />
        <text x="240" y="132" fontSize="11" fill="#92400e">center (x, y)</text>
        {/* guide lines to axes */}
        <line x1="250" y1="150" x2="250" y2="260" stroke="#9ca3af" strokeWidth="1" strokeDasharray="3 3" />
        <line x1="250" y1="150" x2="60" y2="150" stroke="#9ca3af" strokeWidth="1" strokeDasharray="3 3" />
        <text x="255" y="215" fontSize="11" fill="#6b7280">x</text>
        <text x="120" y="145" fontSize="11" fill="#6b7280">y</text>
        {/* canvas dimensions note */}
        <text x="240" y="290" fontSize="10" fill="#9ca3af" textAnchor="middle">canvas = 800 × 600 px → SI: (800 / pixelsPerUnit) × (600 / pixelsPerUnit)</text>
        <defs>
          <marker id="arrX" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#2563eb" />
          </marker>
          <marker id="arrY" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#16a34a" />
          </marker>
        </defs>
      </svg>
      <figcaption className="mt-2 text-sm text-gray-500">
        Real-world physics coordinates: origin (0, 0) at the <strong>bottom-left</strong>, X increases
        right, Y increases <strong>up</strong>. An object&rsquo;s <code>x</code>/<code>y</code> is its{' '}
        <em>center</em>. Positive <code>velocity.y</code> = upward motion; gravity is a separate positive-is-down scalar.
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Worked-example JSON (kept in sync with src/simulations/projectileVelocityComponents.json).
// ---------------------------------------------------------------------------

const workedExample = `{
  "title": "Projectile — Velocity Components",
  "description": "Watch vₓ stay constant while v_y ramps down through zero at the apex.",
  "environment": {
    "walls": ["bottom"],
    "gravity": 9.8,
    "unit": "m",
    "angleUnit": "deg",
    "pixelsPerUnit": 12,
    "physicsEngine": "rapier"
  },
  "objects": [
    {
      "id": "ball",
      "x": 4, "y": 4,
      "width": 3, "height": 3,
      "svg": "baseball",
      "velocity": { "magnitude": 24, "angle": 65 },
      "mass": 1,
      "restitution": 0.4,
      "showVectors": [
        "velocity",
        { "kind": "velocity", "components": true }
      ]
    }
  ],
  "controls": [
    { "type": "slider", "label": "Launch Speed (m/s)",
      "targetObj": "ball", "property": "velocity.magnitude",
      "min": 0, "max": 40, "step": 1, "defaultValue": 24 },
    { "type": "slider", "label": "Launch Angle (°)",
      "targetObj": "ball", "property": "velocity.angle",
      "min": 0, "max": 90, "step": 1, "defaultValue": 65 }
  ],
  "outputs": [
    { "title": "Velocity components",
      "values": [
        { "label": "Vx", "targetObj": "ball", "property": "velocity.x", "unit": "m/s" },
        { "label": "Vy", "targetObj": "ball", "property": "velocity.y", "unit": "m/s" },
        { "label": "Speed", "targetObj": "ball", "property": "velocity.magnitude", "unit": "m/s" }
      ] }
  ],
  "graphs": [
    { "type": "line", "title": "Velocity components over time",
      "yAxisRange": { "min": -25, "max": 30 },
      "yAxisLabel": "Velocity (m/s)",
      "lines": [
        { "label": "Vx", "color": "#2563eb", "targetObj": "ball", "property": "velocity.x" },
        { "label": "Vy", "color": "#db2777", "targetObj": "ball", "property": "velocity.y" }
      ] }
  ]
}`;

const wrapperExample = `// src/simulations/ProjectileComponentsSimulation.tsx
import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import config from './projectileComponents.json';

function ProjectileComponentsSimulation() {
  // localJsonEdit turns on the in-app "Tweak JSON" editor.
  return <JsonSimulation config={asLocalSimConfig(config)} localJsonEdit />;
}

export default ProjectileComponentsSimulation;`;

const routeExample = `// src/App.tsx — add an import + a <Route>
import ProjectileComponentsSimulation from './simulations/ProjectileComponentsSimulation'

<Route
  path="/simulation/projectile-components"
  element={<ProjectileComponentsSimulation />}
/>`;

function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div className="not-prose my-4">
      {label && <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">{label}</div>}
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-[0.8rem] leading-relaxed">
        <code className="!bg-transparent !p-0 text-gray-100">{children}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page.
// ---------------------------------------------------------------------------

function AuthoringJson() {
  return (
    <DocsLayout
      title="9. Authoring simulation JSON"
      subtitle="Soup to nuts: how a developer hand-writes and modifies the JSON that defines a custom simulation — the same contract the LLM emits."
    >
      <p>
        Every GIST simulation — whether typed as a prompt and generated by the LLM, loaded from
        Supabase, or hand-authored in the repo — is one JSON object matching the{' '}
        <strong>simulation schema</strong> in{' '}
        <code>src/schemas/simulation.ts</code> (<code>SimulationConfig</code>). That Zod schema is
        the single source of truth; this page is a guided tour of it for people editing the JSON by
        hand. When this page and the schema ever disagree, <strong>the schema wins</strong> — read
        it.
      </p>

      <Callout tone="red" title="The one gotcha to internalize first: the frontend never runs Zod .parse() at runtime">
        Hand-authored dev sims are consumed via a plain type-cast (<code>asLocalSimConfig</code>),
        LLM output and Supabase loads likewise. That means Zod <code>.default()</code> values are{' '}
        <strong>documentation, not runtime behavior</strong> — a missing <code>gravity</code> is not
        silently backfilled to 9.8 by the schema. The normalizations that <em>do</em> run live at
        the <em>ingestion seam</em> (<code>containerExpansion.ts</code> then{' '}
        <code>scaleObjectToSI</code>): unit&nbsp;→&nbsp;SI scaling, polar&nbsp;→&nbsp;<code>x,y</code>,
        container expansion. Practical rule: <strong>author the <code>environment</code> block fully</strong>{' '}
        (as every example here does) and don&rsquo;t rely on a field being auto-filled unless you&rsquo;ve
        confirmed a downstream default.
      </Callout>

      <MermaidDiagram
        chart={ingestChart}
        caption="What actually happens to your JSON at load. The cast (red) does no validation; the seam (purple) does the real normalization."
      />

      <h2>The soup-to-nuts workflow</h2>
      <p>
        To stand up a brand-new hand-authored sim locally is four files-worth of edits, then an
        iterate loop. No backend, no database, no LLM.
      </p>

      <MermaidDiagram chart={workflowChart} caption="The local authoring loop. Steps 1–3 are one-time setup; steps 4–5 are the iterate cycle." />

      <ol className="not-prose my-4 space-y-3 text-sm text-gray-700">
        <li>
          <strong>1 · Write the JSON.</strong> Drop <code className="bg-gray-100 px-1 rounded">mySim.json</code> in{' '}
          <code className="bg-gray-100 px-1 rounded">src/simulations/</code>. Its shape is the rest of this page.
        </li>
        <li>
          <strong>2 · Add a one-line wrapper.</strong> A tiny <code className="bg-gray-100 px-1 rounded">.tsx</code> that
          renders it. Pass <code className="bg-gray-100 px-1 rounded">localJsonEdit</code> to enable the in-app
          &ldquo;Tweak JSON&rdquo; editor.
          <CodeBlock label="src/simulations/…Simulation.tsx">{wrapperExample}</CodeBlock>
        </li>
        <li>
          <strong>3 · Register a route</strong> in <code className="bg-gray-100 px-1 rounded">src/App.tsx</code>.
          <CodeBlock label="src/App.tsx">{routeExample}</CodeBlock>
        </li>
        <li>
          <strong>4 · Run.</strong> <code className="bg-gray-100 px-1 rounded">npm run dev</code> → open{' '}
          <code className="bg-gray-100 px-1 rounded">http://localhost:5173/simulation/my-sim</code>. Vite hot-reloads on save.
        </li>
        <li>
          <strong>5 · Iterate.</strong> Edit the JSON and save, or tweak live in the browser (below).
        </li>
      </ol>

      <Callout tone="blue" title="Two ways to edit, one source of truth">
        The <strong>file</strong> is version-controlled and survives reload. The in-app{' '}
        <strong>Tweak JSON</strong> panel (enabled by <code>localJsonEdit</code>, or on any sim under{' '}
        <code>?simdebug=1</code>) is for fast trial-and-error — but its edits are session-only. Found a
        keeper in Tweak JSON? Paste it back into the <code>.json</code> file.
      </Callout>

      <h2>Coordinate system &amp; units (read before you place anything)</h2>
      <CoordinateSystem />
      <ul>
        <li>
          <strong>Origin bottom-left, Y-up.</strong> Standard physics, not screen coordinates. An
          object&rsquo;s <code>x</code>/<code>y</code> is its <em>center</em>, not a corner.
        </li>
        <li>
          <strong>Everything is in the configured <code>unit</code></strong> (default <code>m</code>) —
          positions, sizes, velocities. Don&rsquo;t mix units within a sim.
        </li>
        <li>
          <strong>Diorama-scoped sizing.</strong> Widths/heights are tuned so the action pops on
          canvas, <em>not</em> to match real-world spans. Rule of thumb: with the smaller scene
          dimension = D, the largest object ≈ 10% of D, the smallest ≥ 4%. Keep real-world ordering
          (bowling ball &gt; feather) but compress extreme ratios. See the{' '}
          <a href="/docs/design-philosophy">Design philosophy</a> doc for why.
        </li>
        <li>
          <strong>Scene scale is set by time budget.</strong> Aim for the main event to resolve in
          2–6 s. Free fall from rest: <code>scene_height ≈ ½·g·t²</code>. Horizontal projectile:{' '}
          <code>scene_width ≈ v₀·t</code>. Add ~20% padding.
        </li>
      </ul>

      <h2>Top-level anatomy</h2>
      <MermaidDiagram chart={anatomyChart} caption="The seven top-level keys. Controls, outputs, and graphs all point back at objects by id + property path (dotted)." />
      <FieldTable
        rows={[
          { name: 'title', type: 'string', req: true, desc: 'Short header shown on the sim card. Name the physics concept.' },
          { name: 'description', type: 'string', req: true, desc: 'One or two engaging sentences on what to observe or learn.' },
          { name: 'environment', type: 'object', req: true, desc: 'Units, scale, gravity, walls, engine, air resistance. See below.' },
          { name: 'objects', type: 'ObjectConfig[]', desc: 'The physical bodies. 1–3 recommended. Defaults to [].' },
          { name: 'controls', type: 'ControlConfig[]', desc: 'Sliders / toggles. Include at least one for interactivity. Defaults to [].' },
          { name: 'outputs', type: 'OutputGroup[]', desc: 'Live numeric readouts, grouped by object. Defaults to [].' },
          { name: 'graphs', type: 'GraphConfig[]', desc: 'Time-series line charts. Defaults to [].' },
        ]}
      />

      <h2><code>environment</code></h2>
      <FieldTable
        rows={[
          { name: 'walls', type: "('left'|'right'|'top'|'bottom')[]", req: true, desc: 'Which canvas edges are solid. [] = objects can exit the canvas.' },
          { name: 'gravity', type: 'number', desc: 'Downward acceleration in units/s². Default 9.8 (Earth). 0 = zero-g. For cm use 980.' },
          { name: 'unit', type: "'m'|'cm'|'km'|'ft'|'in'", desc: 'Length unit for all positions, sizes, velocities. Default "m".' },
          { name: 'angleUnit', type: "'deg'|'rad'|'rot'", desc: 'Display/authoring unit for angle quantities (e.g. velocity.angle). Default "deg". Physics runs in radians internally.' },
          { name: 'pixelsPerUnit', type: 'number', desc: 'Pixels per unit. Canvas is 800×600 px, so SI size = (800/ppu)×(600/ppu). Default 10 → 80×60 m.' },
          { name: 'physicsEngine', type: "'rapier'|'planck'", desc: 'Default "rapier" (WASM, SI-native, deterministic). "planck" is the Box2D port — parity-checked but more energetic.' },
          { name: 'airResistance', type: '{ enabled, airDensity }', desc: 'Optional. enabled=true turns on per-body quadratic drag; airDensity ρ default 1.225 kg/m³ (0 = vacuum).' },
        ]}
      />

      <h2><code>objects[]</code> — the big one</h2>
      <p>
        Each object carries a position, a bounding box, and an <code>svg</code> manifest name that
        drives <strong>both</strong> its visual sprite and its collider shape (rectangle / circle /
        polygon), scaled into <code>width × height</code>. Physics fields are all optional with
        sensible downstream defaults.
      </p>
      <FieldTable
        rows={[
          { name: 'id', type: 'string', req: true, desc: 'Unique. Controls / outputs / graphs reference this object by id.' },
          { name: 'x, y', type: 'number', req: true, desc: 'Center position, in units. Y-up, origin bottom-left.' },
          { name: 'width, height', type: 'number', req: true, desc: <>Bounding box, in units. <strong>Omit only for container objects</strong> (derived). The collider from <code>svg</code> is scaled into this box.</> },
          { name: 'svg', type: 'string', req: true, desc: <>Renderable name from <code>public/renderables/manifest.json</code> (e.g. "baseball", "brick_block"). Drives sprite + collider. Omit only for container objects.</> },
          { name: 'container', type: 'ContainerConfig', desc: <>Alternative to svg/width/height: synthesize an open cup/box/wagon (U or L profile that can catch &amp; carry). See below.</> },
          { name: 'velocity', type: '{x,y} | {magnitude,angle}', desc: <>Initial velocity, authored as components <em>or</em> polar — never mix. Polar angle is in the env <code>angleUnit</code>, CCW from +X.</> },
          { name: 'acceleration', type: '{x, y}', desc: <>Constant extra acceleration in units/s², applied <strong>on top of</strong> gravity (not an override). Rocket thrust, braking, wind.</> },
          { name: 'mass', type: 'number', desc: 'kg. Default 1.' },
          { name: 'restitution', type: 'number 0–1', desc: 'Bounciness. Default 0.8.' },
          { name: 'friction', type: 'number 0–1', desc: 'Surface friction against other bodies. Default 0.1.' },
          { name: 'isStatic', type: 'boolean', desc: 'true = immovable (floors, walls, ramps). Default false.' },
          { name: 'inertia', type: 'number', desc: 'Rotational inertia. Set 1e10 to prevent rotation. Default 0. (Note: Rapier currently ignores this — pin planck if a sim depends on it.)' },
          { name: 'angle, angularVelocity', type: 'number (rad, rad/s)', desc: 'Initial orientation and spin. Default 0.' },
          { name: 'dragCoefficient, referenceArea', type: 'number', desc: 'Per-body air-resistance parameters. Active only when environment.airResistance.enabled. Shape-based defaults if omitted; Cd=0 opts the body out.' },
          { name: 'showVectors', type: 'VectorArrowEntry[]', desc: <>Vector arrows drawn on the body. See below.</> },
        ]}
      />

      <h3><code>container</code> — synthesized open cups / boxes / wagons</h3>
      <p>
        When an object carries <code>container</code>, the runtime synthesizes its sprite, concave
        collider, and bounding box from these params — <strong>omit <code>svg</code>,{' '}
        <code>width</code>, <code>height</code></strong>. All other physics fields stay top-level as
        usual.
      </p>
      <FieldTable
        rows={[
          { name: 'innerWidth', type: 'number', req: true, desc: 'Inner cavity width — the open mouth a payload falls into. Make it ≥ 1.5× the payload width.' },
          { name: 'wallHeight', type: 'number', req: true, desc: 'Inner depth, floor top to rim.' },
          { name: 'walls', type: "'both'|'left'|'right'", desc: '"both" = U profile (cup/box). "left"/"right" = L profile (e.g. a wagon with only a back wall).' },
          { name: 'mode', type: "'free'|'grounded'", desc: <>"grounded" (default) spawn-seats it on the floor — requires <code>environment.walls</code> to include "bottom"; author <code>y: 0</code>. "free" uses the authored center.</> },
          { name: 'wallThickness, floorThickness', type: 'number', desc: 'Usually omit. Default wall = 12% of innerWidth (clamped); floor = wall thickness.' },
          { name: 'fill, stroke', type: 'string (CSS color)', desc: 'Optional sprite colors.' },
        ]}
      />

      <h3><code>ramp</code> + <code>seatOn</code> — synthesized inclined planes (SO-C, 2026-08-06)</h3>
      <p>
        When an object carries <code>ramp</code>, the runtime synthesizes a static right-triangle
        sprite + collider and seats it on the floor — <strong>omit <code>svg</code>,{' '}
        <code>width</code>, <code>height</code>; author <code>y: 0</code></strong> (derived), and{' '}
        <code>environment.walls</code> must include <code>"bottom"</code>. Give <strong>exactly two</strong>{' '}
        of the four triangle params. Ramp friction defaults to 0; for friction lessons set the{' '}
        <em>same</em> µ on ramp and rider (engines take the max of the pair). A rider object declares{' '}
        <code>seatOn: "&lt;rampId&gt;"</code> and authors only <code>x</code> — y and angle derive as a
        flush pose on the surface, re-derived on every config change (drag the rider: it snaps back to
        the surface; resize the ramp: riders re-seat). <code>seatOn</code> is a <strong>start pose,
        not an attachment</strong> — at t &gt; 0 the rider moves freely.
      </p>
      <FieldTable
        rows={[
          { name: 'angle', type: 'number', desc: <>Incline angle in the environment <code>angleUnit</code> (default degrees), from horizontal. Diorama-clamped to ≈ [5°, 80°].</> },
          { name: 'rise, run, slopeLength', type: 'number', desc: 'Vertical height (the h in mgh), horizontal base, and surface length (the d in slide problems). Any two of the four params define the triangle.' },
          { name: 'highSide', type: "'left'|'right'", desc: '"left" (default): crest at left, riders slide toward +x. "right" mirrors.' },
          { name: 'fill, stroke', type: 'string (CSS color)', desc: 'Optional sprite colors.' },
        ]}
      />
      <p>
        Living exhibits: <code>/simulation/ramp-slide</code> (S0.1 friction, a = g(sinθ − µcosθ)) and{' '}
        <code>/simulation/ramp-energy</code> (frictionless GPE→KE, v = √(2gΔh)). Canonical doc:{' '}
        <code>Notes_on_Ramps_and_Tracks_Refactor.md</code>.
      </p>

      <h3><code>showVectors</code> — arrows on a body</h3>
      <p>
        An array where each entry is either a <strong>kind string</strong> for default styling, or a{' '}
        <strong>config object</strong> for per-arrow overrides. Combine freely on one body.
      </p>
      <CodeBlock>{`"showVectors": [
  "velocity",                                  // shorthand: default styling
  { "kind": "acceleration", "color": "#7e57c2" },
  { "kind": "velocity", "components": true }    // dashed vₓ / v_y legs
]`}</CodeBlock>
      <FieldTable
        rows={[
          { name: 'kind', type: "VectorKind", req: true, desc: <>"velocity", "acceleration", "force-net", "force-gravity", "force-drag" render today (drag is non-zero only in air-resistance mode). "force-normal" / "force-friction" also render since the engine contact-force seam landed (FBD step 3, 2026-08-06) — these are ENGINE-READ values (solver impulses / dt): exact in steady contact, but they read zero on a sleeping body (a body at rest long enough loses its arrows until disturbed). "force-applied" also renders since applied-forces Phase 1 (2026-08-09), but its ONLY source today is the debug panel's force dropdown — there is no schema field yet, so on an ordinary sim it reads zero and self-suppresses. Authoring it is harmless but pointless until Phase 2 lands the field. Note: the LLM prompt still discourages authoring all force kinds on generated sims (debug-first) — but hand-authored local sims may use the wired ones freely.</> },
          { name: 'components', type: 'boolean', desc: <>true → draw the two axis-aligned legs (vₓ / v_y, dashed, both from the body) instead of the resultant. To show the resultant <em>and</em> its legs, list the plain kind too. See the <a href="/docs/vector-arrows">Vector arrows</a> doc.</> },
          { name: 'color', type: 'string', desc: "Override the kind's default color." },
          { name: 'label', type: '{main,sub} | string | null', desc: 'Override the label; null suppresses it.' },
          { name: 'pixelsPerUnit', type: 'number', desc: "Override the kind's default pixels-per-SI-unit arrow scale." },
          { name: 'labelPlacement, labelFontSize', type: "'tail'|'midpoint'|'head', number", desc: 'Label position and size.' },
        ]}
      />

      <h2><code>controls[]</code> — sliders &amp; toggles</h2>
      <p>
        A discriminated union on <code>type</code>. Each control drives one object&rsquo;s property by{' '}
        <code>targetObj</code> (an object <code>id</code>) + a <strong>property path</strong>.
      </p>
      <FieldTable
        rows={[
          { name: 'type', type: "'slider'|'toggle'", req: true, desc: 'Discriminator.' },
          { name: 'label', type: 'string', req: true, desc: 'Shown to the student.' },
          { name: 'targetObj', type: 'string', req: true, desc: 'The object id to control.' },
          { name: 'property', type: 'string', req: true, desc: <>Slider: a numeric path (see below). Toggle: a boolean path, e.g. <code>"isStatic"</code>.</> },
          { name: 'min, max, step, defaultValue', type: 'number', req: true, desc: 'Slider only. defaultValue should match the object\'s initial value.' },
          { name: 'defaultValue', type: 'boolean', req: true, desc: 'Toggle only. Initial state.' },
        ]}
      />
      <Callout tone="blue" title="Property paths (shared by controls, outputs & graphs)">
        Cartesian components: <code>velocity.x</code> · <code>velocity.y</code> ·{' '}
        <code>position.x</code> · <code>position.y</code> · <code>acceleration.x</code> ·{' '}
        <code>acceleration.y</code>. Polar projections: <code>velocity.magnitude</code> (speed) ·{' '}
        <code>velocity.angle</code> (direction), same for acceleration. A <code>.magnitude</code>{' '}
        slider changes speed while preserving direction; an <code>.angle</code> slider rotates while
        preserving magnitude — the classic launch-speed + launch-angle pair. An{' '}
        <code>acceleration.*</code> slider drives the <em>additive</em> acceleration, not gravity.
        Scalars: <code>mass</code> · <code>restitution</code> · <code>friction</code> ·{' '}
        <code>angle</code> · <code>isStatic</code>. <strong>Ramp-dimension paths</strong> (sliders
        only, target must be a <code>ramp</code> object): <code>ramp.angle</code> ·{' '}
        <code>ramp.rise</code> · <code>ramp.run</code> · <code>ramp.slopeLength</code> — these
        bypass the physics body entirely and override the synthesis param ahead of the expansion
        seam, so the incline rebuilds live and seated riders re-seat. The overridden param&rsquo;s
        companion is the <em>first-authored</em> remaining param: author{' '}
        <code>{'{angle, slopeLength}'}</code> + an angle slider for a fixed-length board being
        tilted (tilt-until-slip: breakaway when tan θ exceeds µ).
      </Callout>

      <h2><code>outputs[]</code> — live readouts</h2>
      <p>Groups of numeric readouts, typically one group per object.</p>
      <FieldTable
        rows={[
          { name: 'title', type: 'string', desc: 'Optional group heading (e.g. "Ball Outputs").' },
          { name: 'values[]', type: 'OutputValue[]', req: true, desc: 'The readouts in this group.' },
          { name: 'values[].label', type: 'string', req: true, desc: 'Display label.' },
          { name: 'values[].targetObj', type: 'string', req: true, desc: 'Object id to read from.' },
          { name: 'values[].property', type: 'string', req: true, desc: 'A property path (see box above).' },
          { name: 'values[].unit', type: 'string', desc: 'Unit label, e.g. "m/s". Leave blank to auto-generate from property + env unit.' },
        ]}
      />

      <h2><code>graphs[]</code> — time-series charts</h2>
      <p>
        Currently line graphs only. X-axis is always time in seconds; each line plots one property
        path over time.
      </p>
      <FieldTable
        rows={[
          { name: 'type', type: "'line'", req: true, desc: 'Discriminator (line only for now).' },
          { name: 'title', type: 'string', req: true, desc: 'Graph title.' },
          { name: 'yAxisRange', type: '{ min, max }', req: true, desc: 'Y range in configured units. Set to encompass expected values with padding.' },
          { name: 'yAxisLabel', type: 'string', desc: 'Y-axis label with units, e.g. "Velocity (m/s)".' },
          { name: 'lines[]', type: 'LineConfig[]', req: true, desc: 'Each: { label, color (hex), targetObj, property }. Overlaying velocity.x / .y / .magnitude is a useful component-vs-resultant view.' },
        ]}
      />

      <h2>A complete worked example</h2>
      <p>
        A projectile whose velocity is shown both as a resultant and decomposed into components,
        with launch-speed and launch-angle sliders, live readouts, and a velocity-components graph.
        This is the shipped <code>projectileVelocityComponents.json</code>, trimmed.
      </p>
      <CodeBlock label="src/simulations/projectileComponents.json">{workedExample}</CodeBlock>

      <h2>Verify what you authored (debug tooling)</h2>
      <ul>
        <li>
          <strong><code>?simdebug=1</code></strong> on any sim URL opens the debug panel: timestep,
          grid, <em>Show colliders</em> (engine-truth decomposed parts + vertex counts), Tweak JSON,
          and Import Object.
        </li>
        <li>
          <strong><code>?colliders=1</code></strong> presets the collider observation overlay on —
          the fastest way to confirm your <code>svg</code>&rsquo;s collider matches the sprite and
          that concave shapes decomposed sanely.
        </li>
        <li>
          <strong>Amber ⚠ Diagnostics badge</strong> — the ingestion-seam diagnostics bus. It shows{' '}
          <em>live config-state</em> issues about the currently loaded sim (a grounded container
          with no floor, a &gt;12-vertex Planck polygon, an incomplete container that got dropped).
          It reflects the config as loaded, not past events, and clears on every re-expansion.
        </li>
      </ul>

      <Callout tone="green" title="Sanity checklist before you commit a new sim">
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>Every <code>targetObj</code> in controls/outputs/graphs matches an object <code>id</code>.</li>
          <li>Object <code>id</code>s are unique (duplicate ids are rejected at load).</li>
          <li>Container objects omit <code>svg</code>/<code>width</code>/<code>height</code>; grounded ones have <code>y: 0</code> and env <code>walls</code> includes <code>"bottom"</code>.</li>
          <li>Velocities are pure components <em>or</em> pure polar — never mixed.</li>
          <li>The <code>environment</code> block is fully specified (no reliance on schema defaults).</li>
          <li>Slider <code>defaultValue</code>s match the object&rsquo;s initial values.</li>
        </ul>
      </Callout>

      <h2>Where to go deeper</h2>
      <ul>
        <li><code>src/schemas/simulation.ts</code> — the authoritative schema, with a prose description on every field.</li>
        <li><code>Local_Sim_Workflow.md</code> — the same workflow in the repo, plus manifest/collider authoring for new shapes.</li>
        <li><a href="/docs/vector-arrows">Vector arrows</a> — the full <code>showVectors</code> catalogue and component decomposition.</li>
        <li><a href="/docs/app-overview">App overview</a> &amp; <a href="/docs/llm-pipeline">LLM pipeline</a> — how this same JSON is produced by the backend.</li>
        <li><a href="/docs/design-philosophy">Design philosophy</a> — why sims are diorama-scoped, and what that means for the numbers you pick.</li>
      </ul>
    </DocsLayout>
  );
}

export default AuthoringJson;
