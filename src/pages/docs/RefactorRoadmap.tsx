import DocsLayout from './DocsLayout';
import MermaidDiagram from '../../components/MermaidDiagram';

const chart = `
flowchart TB
  subgraph RESEARCH["Research / reference"]
    PHYSCH["Physics_Chapters_with_<br/>Physics_Engines.md<br/>(engine ↔ curriculum unit map)"]
  end

  subgraph TRACKERS["Trackers / index docs"]
    TOPICS["GIST_Physics_System_Topics.md<br/>(known issues, status-tracked)"]
    WISH["GIST_Physics_Wishlist.md<br/>(forward features, 14 sections)"]
    LLM["GIST_LLM_Context_and_<br/>Prompting.md<br/>(prompt audit + improvements)"]
  end

  subgraph REFACTORS["Active refactor proposals"]
    AIR["Notes_on_Air_Resistance_<br/>Refactor.md<br/>(quadratic drag, mass-dependent)"]
    APP["Notes_on_Applied_Forces_<br/>Refactor.md<br/>(PhET Forces and Motion)"]
    VEC["Notes_on_Vector_<br/>Representation_Refactor.md<br/>(magnitude/angle as polar paths)"]
  end

  subgraph CODE["Codebase touchpoints"]
    ADAPTER["src/physics/<br/>(adapter + engines)"]
    BASESIM["BaseSimulation.tsx<br/>(runtime loop)"]
    SCHEMA["schemas/simulation.ts<br/>(Zod source of truth)"]
    CONTROLS["controls / graphs / outputs<br/>(binding layer)"]
    PROMPT["modal_functions/<br/>gist_instructions.py"]
  end

  PHYSCH -.->|research feeds| AIR
  PHYSCH -.->|research feeds| APP
  PHYSCH -.->|research feeds| VEC

  AIR -->|setLinearDamping<br/>+ Rapier mass setter fix| ADAPTER
  AIR --> BASESIM
  AIR --> SCHEMA

  APP -->|applyImpulse + setFriction| ADAPTER
  APP --> BASESIM
  APP --> SCHEMA
  APP -.->|composes with| VEC

  VEC -->|magnitude / angle paths| CONTROLS
  VEC --> SCHEMA
  VEC -.->|composes with| APP

  WISH -.->|tracks future of| AIR
  WISH -.->|tracks future of| APP
  WISH -.->|tracks future of| VEC

  TOPICS -.->|system-level concerns| ADAPTER
  TOPICS -.->|system-level concerns| BASESIM
  TOPICS -.->|system-level concerns| SCHEMA

  LLM -->|describe-string updates| SCHEMA
  LLM --> PROMPT
  LLM -.->|flags 3 bugs in| SCHEMA
  LLM -.->|flags 3 bugs in| PROMPT

  classDef research fill:#f3e8ff,stroke:#7c3aed,color:#5b21b6;
  classDef tracker fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef refactor fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  classDef code fill:#dcfce7,stroke:#16a34a,color:#166534;

  class PHYSCH research;
  class TOPICS,WISH,LLM tracker;
  class AIR,APP,VEC refactor;
  class ADAPTER,BASESIM,SCHEMA,CONTROLS,PROMPT code;
`;

const phaseChart = `
flowchart LR
  subgraph AIRPHASES["Air resistance phases"]
    direction TB
    AIRP1["Phase 1: debug-panel toggle<br/>+ Rapier mass-setter fix<br/><b>SHIPPED</b>"]
    AIRP2["Phase 2: schema additions<br/>airResistance + dragCoefficient"]
    AIRP3["Phase 3: deprecate frictionAir"]
    AIRP1 --> AIRP2 --> AIRP3
  end

  subgraph APPPHASES["Applied forces phases"]
    direction TB
    APPP1["Phase 1: applyImpulse adapter<br/>+ debug-panel slider"]
    APPP2["Phase 2: appliedForce schema<br/>+ force-arrow renderable"]
    APPP25["Phase 2.5: frictionDemo<br/>(opt-in μs ≠ μk)"]
    APPP3["Phase 3: appliedForces[]<br/>(multi-puller, sum arrow)"]
    APPP4["Phase 4: engine-read<br/>contact forces (optional)"]
    APPP1 --> APPP2 --> APPP3 --> APPP4
    APPP1 -.parallel track.-> APPP25
  end

  subgraph VECPHASES["Vector representation phases"]
    direction TB
    VECP1["Phase 1: path-resolver<br/>(.magnitude / .angle)"]
    VECP2["Phase 2: polar input form<br/>{ magnitude, angle } init"]
    VECP3["Phase 3: polarSlider variant<br/>+ shared VectorArrow renderable"]
    VECP1 --> VECP2 --> VECP3
  end

  classDef done fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef inprog fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef pending fill:#dbeafe,stroke:#2563eb,color:#1e40af;

  class AIRP1 done;
  class AIRP2,AIRP3,APPP1,APPP2,APPP25,APPP3,APPP4,VECP1,VECP2,VECP3 pending;
`;

function RefactorRoadmap() {
  return (
    <DocsLayout
      title="5. Refactor roadmap"
      subtitle="A docs map: how the seven .md files relate to each other and which slice of the codebase each touches."
    >
      <p>
        Three categories of doc: <strong>research</strong> (engine affordances per curriculum
        unit), <strong>trackers</strong> (system topics, wishlist, LLM audit — none of these
        propose code, they index it), and <strong>refactor proposals</strong> (concrete change
        plans with phased rollouts).
      </p>

      <MermaidDiagram chart={chart} caption="Doc → doc and doc → codebase relationships. Color codes the doc kind." />

      <h2>Phase status across the three active refactors</h2>
      <p>
        Each refactor follows the same pattern: a debug-panel-only Phase 1 to validate wiring,
        then schema + LLM updates in Phase 2, then polish/extension. The Rapier mass-setter fix
        from the air-resistance refactor is the only thing shipped so far (commit{' '}
        <code>c5efe35</code>).
      </p>

      <MermaidDiagram chart={phaseChart} caption="Per-refactor phase rollout. Green = shipped, blue = pending." />

      <h2>How the refactors compose</h2>
      <ul>
        <li>
          <strong>Applied forces + vector representation</strong> — together unlock force-magnitude
          + force-angle sliders. The polar layer's held-angle / held-magnitude state is what makes
          &quot;set force magnitude while preserving direction&quot; work correctly. Worth landing
          applied-forces Phase 1 first (so the field exists), then vector Phase 1 immediately on
          top.
        </li>
        <li>
          <strong>Applied forces + air resistance</strong> — both rely on the substep-invariant
          formulation pattern. Drag uses damping; force uses impulse. Same{' '}
          <code>onUpdate</code> hook, no per-substep callback needed.
        </li>
        <li>
          <strong>Vector representation + LLM prompting</strong> — the schema description prose
          for polar fields needs to teach the LLM when to use Cartesian vs. polar. Belongs in the
          schema description-strings, which the LLM doc already flags as load-bearing.
        </li>
        <li>
          <strong>Wishlist §10 (Expressions) + everything</strong> — once expressions land, KE,
          GPE, momentum, and conservation-check outputs become one-liner schema entries.
          Composes with applied forces (force-magnitude expressions), vector representation
          (named-computed inverse writes), and LLM prompting (curated computed registry).
        </li>
      </ul>

      <h2>Source files</h2>
      <ul>
        <li>
          <code>Notes_on_Air_Resistance_Refactor.md</code>
        </li>
        <li>
          <code>Notes_on_Applied_Forces_Refactor.md</code>
        </li>
        <li>
          <code>Notes_on_Vector_Representation_Refactor.md</code>
        </li>
        <li>
          <code>Physics_Chapters_with_Physics_Engines.md</code>
        </li>
        <li>
          <code>GIST_Physics_System_Topics.md</code>
        </li>
        <li>
          <code>GIST_Physics_Wishlist.md</code>
        </li>
        <li>
          <code>GIST_LLM_Context_and_Prompting.md</code>
        </li>
      </ul>
    </DocsLayout>
  );
}

export default RefactorRoadmap;
