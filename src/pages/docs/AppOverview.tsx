import DocsLayout from './DocsLayout';
import MermaidDiagram from '../../components/MermaidDiagram';

const chart = `
flowchart LR
  subgraph BROWSER["User browser"]
    direction TB
    HOME["Home / Library<br/>pages"]
    DYN["DynamicSimulation<br/>page"]
    CREATE["CreateSimulation<br/>modal"]
  end

  subgraph FRONTEND["React frontend (Vite + Tailwind + react-router)"]
    direction TB
    SEAM["config→SI ingestion seam<br/>scaleObjectToSI: unit scaling +<br/>polar→x,y normalization<br/>⚠ no runtime Zod parse"]
    BASE["BaseSimulation.tsx<br/>(rAF loop, modes)"]
    RENDERERS["ObjectRenderer<br/>controls / graphs / outputs"]
    SCHEMA["src/schemas/simulation.ts<br/>(Zod source of truth)"]
    ADAPTER["PhysicsAdapter interface<br/>src/physics/types.ts"]
    ENGINES["Planck · Rapier (default)"]
  end

  subgraph BACKEND["Modal serverless backend"]
    direction TB
    GEN["generate_simulation.py<br/>FastAPI + SSE"]
    PIPE["sim_pipeline /<br/>sim_pipeline_remix"]
    LLM["LLM provider<br/>(OpenAI / SkoleGPT)"]
  end

  ASSETS[(public/renderables/<br/>manifest.json)]
  SUPA[("Supabase")]
  GENJSON[("modal_functions/<br/>simulation_schema.json")]
  STATIC[("src/simulations/*.json<br/>(hand-authored dev sims)")]

  HOME --> DYN
  HOME --> CREATE
  CREATE -->|prompt + edit requests| GEN
  GEN --> PIPE --> LLM
  LLM -.->|streamed JSON| CREATE
  CREATE -->|config, validated backend-side only| DYN
  DYN -->|unparsed| SEAM
  STATIC -->|unparsed, type-cast| SEAM
  SEAM --> BASE
  BASE --> RENDERERS
  BASE --> ADAPTER
  ADAPTER --> ENGINES
  RENDERERS --> ASSETS
  SCHEMA -->|npm run generate:schema| GENJSON
  SCHEMA -.->|import type ONLY — never runtime-parsed| SEAM
  GENJSON -->|bundled into Modal image| PIPE
  DYN -.->|save| SUPA
  SUPA -.->|load, unparsed| DYN

  classDef refactor fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef llm fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  classDef done fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef seam fill:#f3e8ff,stroke:#9333ea,color:#6b21a8;

  class BASE,ADAPTER,ENGINES refactor;
  class PIPE,SCHEMA,GENJSON llm;
  class SEAM seam;
`;

function AppOverview() {
  return (
    <DocsLayout
      title="1. App overview"
      subtitle="Where each piece lives and which refactor doc covers which slice."
    >
      <p>
        Three big surfaces: the React frontend (left), the LLM backend running on Modal (right),
        and the schema sitting between them as the single source of truth. Saved sims live in
        Supabase. The renderables manifest drives both visual sprites and collider shapes — the
        same file that feeds the LLM also feeds the runtime.
      </p>
      <p>
        The purple node is the <strong>config→SI ingestion seam</strong>: all three config
        sources (LLM output, Supabase loads, hand-authored dev sims) converge on{' '}
        <code>scaleObjectToSI</code> <em>unparsed</em> — the Zod schema is consumed as{' '}
        <code>import type</code> plus schema generation only, and never runs at runtime. Unit
        scaling and polar→cartesian normalization (vector-rep Phase 2) live at this seam today;
        the full &ldquo;runtime ingestion boundary (parse, don&rsquo;t validate)&rdquo; — one
        parse/migrate/default/normalize step all three paths share — is a parked architectural
        item (see <code>parking_lot.md</code> → &ldquo;Saved sims bypass schema validation&rdquo;,
        update 2026-07-04, with its two motivating exhibits: the dead matter→rapier preprocess
        and the tolerated wrapper cast errors).
      </p>

      <MermaidDiagram chart={chart} caption="App architecture. Yellow = physics-runtime layer; blue = LLM/schema layer; purple = config ingestion seam (no runtime parse — see parking lot)." />

      <h2>What each refactor touches</h2>
      <ul>
        <li>
          <strong>Air resistance</strong> — adds <code>setLinearDamping</code> at the
          PhysicsAdapter boundary; <code>BaseSimulation.onUpdate</code> drives the per-frame value.
        </li>
        <li>
          <strong>Applied forces</strong> — adds <code>applyImpulse</code> and{' '}
          <code>setFriction</code> on PhysicsBody, plus a <code>BaseSimulation.onPreStep</code>{' '}
          hook that delivers the impulse on the engine's own step cadence. Authorable since
          Phase 2 (2026-08-13) as <code>ObjectConfig.appliedForce</code>, with force-family
          property paths for controls, outputs and graphs.
        </li>
        <li>
          <strong>Vector representation</strong> — binding-layer change in the controls /
          outputs / graphs path (Phase 1), plus polar→cartesian normalization of authored
          initial conditions at the ingestion seam (Phase 2); no engine work.
        </li>
        <li>
          <strong>LLM prompting</strong> — touches <code>simulation.ts</code> Zod descriptions
          (the prose flows directly into the LLM prompt) and the per-stage fragments in{' '}
          <code>modal_functions/gist_instructions.py</code>.
        </li>
        <li>
          <strong>Wishlist items (events, sensors, joints, expressions)</strong> — most land at the
          PhysicsAdapter or in the controls/graphs binding layer, with corresponding schema
          additions.
        </li>
      </ul>

      <h2>Source files</h2>
      <ul>
        <li>
          <code>Physics_Chapters_with_Physics_Engines.md</code> — engine affordances mapped to
          curriculum units
        </li>
        <li>
          <code>GIST_Physics_System_Topics.md</code> — system-level concerns
        </li>
        <li>
          <code>GIST_LLM_Context_and_Prompting.md</code> — current LLM wiring + improvements
        </li>
      </ul>
    </DocsLayout>
  );
}

export default AppOverview;
