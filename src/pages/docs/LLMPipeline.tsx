import DocsLayout from './DocsLayout';
import MermaidDiagram from '../../components/MermaidDiagram';

const chart = `
flowchart TB
  USER["User: 'Make a projectile sim'"]
  CREATE["CreateSimulation.tsx<br/>(modal)"]
  USER --> CREATE
  CREATE -->|POST + SSE| MODAL

  subgraph MODAL["Modal: generate_simulation.py"]
    direction TB
    PIPE["sim_pipeline/"]

    subgraph STAGES["Stages"]
      direction TB
      SK["1. skeleton<br/>picks svgs, scene_dimension,<br/>control / graph / output INTENTS"]
      OB["2. objects_fill<br/>fills width/height + physics"]
      CT["3. controls_fill<br/>full ControlConfig array"]
      GR["4. graphs_fill<br/>full GraphConfig array"]
      OU["5. outputs_fill<br/>full OutputGroupConfig array"]
      AS["6. assemble<br/>combine + validate"]
      SK --> OB --> CT --> GR --> OU --> AS
    end

    PIPE --> STAGES
  end

  AS -.->|SSE content event| CREATE
  CREATE --> RUN["Validated SimulationConfig<br/>→ DynamicSimulation page"]

  SCHEMA[("simulation_schema.json<br/>generated from Zod")]
  MANIFEST[("renderables manifest")]
  INSTR[("gist_instructions.py<br/>per-stage prompt fragments")]

  SCHEMA -.->|bundled per stage| STAGES
  MANIFEST -.->|bundled per stage| STAGES
  INSTR -.->|bundled per stage| STAGES

  classDef stage fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  classDef asset fill:#f3f4f6,stroke:#6b7280,color:#374151;
  class SK,OB,CT,GR,OU,AS stage;
  class SCHEMA,MANIFEST,INSTR asset;
`;

const remixChart = `
flowchart LR
  USER["User edits sim:<br/>'Make the ball heavier'"]
  USER --> ROUTER

  subgraph REMIX["sim_pipeline_remix/"]
    direction TB
    ROUTER["router stage<br/>classifies which slices<br/>need regeneration"]
    DECIDE{needs_skeleton?}
    SLICES["fills: subset of<br/>{objects, controls, graphs, outputs}"]
    OBR["objects_remix"]
    CTR["controls_remix"]
    GRR["graphs_remix"]
    OUR["outputs_remix"]
    ASR["assemble"]

    ROUTER --> DECIDE
    DECIDE -->|false| SLICES
    DECIDE -->|true| FALLBACK["fall back to full<br/>sim_pipeline"]
    SLICES --> OBR
    SLICES --> CTR
    SLICES --> GRR
    SLICES --> OUR
    OBR --> ASR
    CTR --> ASR
    GRR --> ASR
    OUR --> ASR
  end

  classDef stage fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  classDef warning fill:#fef3c7,stroke:#d97706,color:#92400e;
  class ROUTER,OBR,CTR,GRR,OUR,ASR stage;
  class FALLBACK warning;
`;

const issuesChart = `
flowchart LR
  subgraph BUGS["Three concrete prompt bugs"]
    direction TB
    B1["🟢 Vector2DSchema.y description<br/>positive = upward (FIXED 2026-05-11)<br/>simulation.ts:27"]
    B2["🟢 frictionStatic removed from<br/>schema + prompt (FIXED 2026-05-11);<br/>μs/μk story moves to frictionDemo"]
    B3["🟢 frictionAir removed end-to-end<br/>(FIXED 2026-06-17); quadratic drag<br/>via airResistance is the only path"]
  end

  subgraph IMPROVES["Top-5 priorities (LLM doc §8)"]
    direction TB
    I1["1. Fix the three bugs"]
    I2["2. Validation feedback loop<br/>(retry on schema error)"]
    I3["3. Per-stage context tailoring<br/>+ prompt caching"]
    I4["4. Retrieval-augmented examples<br/>(small library, pick 2-3 closest)"]
    I5["5. Telemetry + regression suite"]
  end

  classDef bug fill:#fee2e2,stroke:#dc2626,color:#991b1b;
  classDef done fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef priority fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  class B1,B2,B3 done;
  class I1,I2,I3,I4,I5 priority;
`;

function LLMPipeline() {
  return (
    <DocsLayout
      title="4. LLM pipeline"
      subtitle="Two pipelines, both running on Modal as SSE-streaming FastAPI handlers. Six stages for full generation, a router-based variant for slice-targeted edits."
    >
      <p>
        The full <code>sim_pipeline</code> decomposes generation into a sequence of focused stages
        — the LLM never has to write the whole config in one breath. The skeleton stage commits to
        the physics concept and scene scale; downstream stages fill in their slice mechanically.
      </p>

      <MermaidDiagram chart={chart} caption="Full generation. Each stage gets the schema, manifest, and a focused prompt fragment." />

      <h2>Slice-targeted remixes</h2>
      <p>
        For edits, a router stage classifies which slices (<code>objects</code> /{' '}
        <code>controls</code> / <code>graphs</code> / <code>outputs</code>) the edit touches. Only
        those run. If the edit touches the scene itself, it falls back to the full pipeline. The
        router is told to be conservative — when in doubt, include the slice.
      </p>

      <MermaidDiagram chart={remixChart} caption="Remix variant. The router never writes content; it only routes." />

      <h2>Schema is the source of truth</h2>
      <p>
        <code>src/schemas/simulation.ts</code> defines every config type as a Zod schema. The{' '}
        <code>npm run generate:schema</code> script converts it to{' '}
        <code>modal_functions/simulation_schema.json</code>, which the Modal image bundles into
        the LLM prompt. <strong>The Zod <code>.describe()</code> strings are the prompt prose</strong>{' '}
        — every field's description matters as much as its type.
      </p>

      <h2>Three concrete prompt bugs found in code review</h2>
      <p>
        Each is a prompt-content edit (no architecture change). See{' '}
        <code>GIST_LLM_Context_and_Prompting.md</code> §3 for full detail.
      </p>

      <MermaidDiagram chart={issuesChart} caption="The three code-review bugs (all now fixed) and the top-5 prioritized improvements." />

      <h2>Source files</h2>
      <ul>
        <li>
          <code>GIST_LLM_Context_and_Prompting.md</code> — full audit of current wiring + improvements
        </li>
        <li>
          <code>modal_functions/gist_instructions.py</code> — per-stage prompt fragments
        </li>
        <li>
          <code>modal_functions/sim_pipeline/</code>, <code>sim_pipeline_remix/</code> — stage implementations
        </li>
        <li>
          <code>src/schemas/simulation.ts</code> — Zod source of truth (describe-strings are prompt prose)
        </li>
      </ul>
    </DocsLayout>
  );
}

export default LLMPipeline;
