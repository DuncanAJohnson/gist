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
    BASE["BaseSimulation.tsx<br/>(rAF loop, modes)"]
    RENDERERS["ObjectRenderer<br/>controls / graphs / outputs"]
    SCHEMA["src/schemas/simulation.ts<br/>(Zod source of truth)"]
    ADAPTER["PhysicsAdapter interface<br/>src/physics/types.ts"]
    ENGINES["Matter (legacy) ·<br/>Planck · Rapier (default)"]
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

  HOME --> DYN
  HOME --> CREATE
  CREATE -->|prompt + edit requests| GEN
  GEN --> PIPE --> LLM
  LLM -.->|streamed JSON| CREATE
  CREATE -->|validated config| DYN
  DYN --> BASE
  BASE --> RENDERERS
  BASE --> ADAPTER
  ADAPTER --> ENGINES
  RENDERERS --> ASSETS
  SCHEMA -->|npm run generate:schema| GENJSON
  GENJSON -->|bundled into Modal image| PIPE
  DYN -.->|saved sims| SUPA

  classDef refactor fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef llm fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  classDef done fill:#dcfce7,stroke:#16a34a,color:#166534;

  class BASE,ADAPTER,ENGINES refactor;
  class PIPE,SCHEMA,GENJSON llm;
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

      <MermaidDiagram chart={chart} caption="App architecture. Yellow = physics-runtime layer; blue = LLM/schema layer." />

      <h2>What each refactor touches</h2>
      <ul>
        <li>
          <strong>Air resistance</strong> — adds <code>setLinearDamping</code> at the
          PhysicsAdapter boundary; <code>BaseSimulation.onUpdate</code> drives the per-frame value.
        </li>
        <li>
          <strong>Applied forces</strong> — adds <code>applyImpulse</code> and{' '}
          <code>setFriction</code> on PhysicsBody; also schema additions and force-arrow
          renderables.
        </li>
        <li>
          <strong>Vector representation</strong> — pure binding-layer change in the controls /
          outputs / graphs path; no engine work.
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
