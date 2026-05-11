import DocsLayout from './DocsLayout';
import MermaidDiagram from '../../components/MermaidDiagram';

const chart = `
flowchart TB
  subgraph RESEARCH["Research / reference"]
    PHYSCH["Physics_Chapters_with_<br/>Physics_Engines.md<br/>engine ↔ curriculum unit map"]
    DIORAMA["Diorama model<br/>curriculum vertical slices:<br/>floor + 2 walls"]
  end

  subgraph TRACKERS["Trackers / index docs"]
    TOPICS["GIST_Physics_System_Topics.md<br/>known issues, status-tracked"]
    WISH["GIST_Physics_Wishlist.md<br/>forward features, 14 sections"]
    LLM["GIST_LLM_Context_and_<br/>Prompting.md<br/>prompt audit + improvements"]
  end

  subgraph PHYSICS["Physics refactor proposals"]
    AIR["Air Resistance<br/>quadratic, mass-dependent drag"]
    APP["Applied Forces<br/>PhET Forces and Motion"]
    VEC["Vector Representation<br/>magnitude/angle paths"]
  end

  subgraph VIS["Visualization & runtime proposals"]
    VA["Vector Arrows / doc 6<br/>7 kinds + theme<br/><b>Phase 1a/b SHIPPED</b>"]
    REC["Recordings & Cameras / doc 7<br/>rich precompute, lean replay<br/>+ saved sims + camera frames"]
  end

  subgraph CODE["Codebase touchpoints"]
    ADAPTER["src/physics/<br/>adapter + engines"]
    BASESIM["BaseSimulation.tsx<br/>runtime loop"]
    JSONSIM["JsonSimulation.tsx<br/>handleUpdate + frame cache"]
    SCHEMA["schemas/simulation.ts<br/>Zod source of truth"]
    THEME["renderables/vectorTheme.ts<br/>colors, labels, scales"]
    CONTROLS["controls / graphs / outputs<br/>binding layer"]
    PROMPT["modal_functions/<br/>gist_instructions.py"]
  end

  PHYSCH -.->|research feeds| AIR
  PHYSCH -.->|research feeds| APP
  PHYSCH -.->|research feeds| VEC
  DIORAMA -.->|organizes work by| VA
  DIORAMA -.->|organizes work by| REC

  AIR -->|setLinearDamping<br/>+ Rapier mass setter fix| ADAPTER
  AIR --> JSONSIM
  AIR --> SCHEMA

  APP -->|applyImpulse + setFriction| ADAPTER
  APP --> JSONSIM
  APP --> SCHEMA
  APP -.->|composes with| VEC

  VEC -->|magnitude / angle paths| CONTROLS
  VEC --> SCHEMA
  VEC -.->|composes with| APP

  VA --> THEME
  VA --> JSONSIM
  VA --> SCHEMA
  VA -.->|reads forces from| APP
  VA -.->|reads drag from| AIR
  VA -.->|polar transforms align with| VEC

  REC --> JSONSIM
  REC --> BASESIM
  REC --> SCHEMA
  REC -.->|"R0 = VA Phase 1c-rev"| VA
  REC -.->|"engine-read = APP Phase 4"| APP
  REC -.->|cameras unify with| VEC

  WISH -.->|tracks future of| AIR
  WISH -.->|tracks future of| APP
  WISH -.->|tracks future of| VEC
  WISH -.->|tracks future of| VA
  WISH -.->|tracks future of| REC

  TOPICS -.->|system concerns| ADAPTER
  TOPICS -.->|system concerns| BASESIM
  TOPICS -.->|system concerns| SCHEMA

  LLM -->|describe-string updates| SCHEMA
  LLM --> PROMPT
  LLM -.->|flags 3 bugs in| SCHEMA
  LLM -.->|flags 3 bugs in| PROMPT

  classDef research fill:#f3e8ff,stroke:#7c3aed,color:#5b21b6;
  classDef tracker fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef phys fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  classDef vis fill:#fce7f3,stroke:#db2777,color:#9d174d;
  classDef code fill:#dcfce7,stroke:#16a34a,color:#166534;

  class PHYSCH,DIORAMA research;
  class TOPICS,WISH,LLM tracker;
  class AIR,APP,VEC phys;
  class VA,REC vis;
  class ADAPTER,BASESIM,JSONSIM,SCHEMA,THEME,CONTROLS,PROMPT code;
`;

const phaseChart = `
flowchart LR
  subgraph RECPHASES["5. Recordings / doc 7"]
    direction TB
    RP0["R0: kinematics-tier Frame<br/>= VA Phase 1c-rev<br/><b>PROPOSED</b>"]
    RP1["R1: Recording type<br/>+ local autosave"]
    RP2["R2: Library UI"]
    RP3["R3: Compare mode"]
    RP4["R4: Cloud persist + share"]
    RP5["R5: Dynamics tier<br/>= APP Phase 4"]
    RP6["R6: Momentum tier"]
    RP0 --> RP1 --> RP2 --> RP3 --> RP4 --> RP5 --> RP6
  end

  subgraph APPPHASES["4. Applied forces"]
    direction TB
    APPP1["Phase 1: applyImpulse adapter<br/>+ debug-panel slider"]
    APPP2["Phase 2: appliedForce schema<br/>+ force-arrow renderable"]
    APPP25["Phase 2.5: frictionDemo<br/>opt-in μs ≠ μk"]
    APPP3["Phase 3: appliedForces array<br/>multi-puller, sum arrow"]
    APPP4["Phase 4: engine-read<br/>contact forces<br/>now load-bearing for REC"]
    APPP1 --> APPP2 --> APPP3 --> APPP4
    APPP1 -.parallel track.-> APPP25
  end

  subgraph VECPHASES["3. Vector representation (magnitude / angle)"]
    direction TB
    VECP1["Phase 1: path-resolver<br/>.magnitude / .angle"]
    VECP2["Phase 2: polar input form<br/>magnitude + angle init"]
    VECP3["Phase 3: polarSlider variant<br/>+ shared VectorArrow"]
    VECP1 --> VECP2 --> VECP3
  end

  subgraph VAPHASES["2. Vector arrows / doc 6"]
    direction TB
    VAP1A["Phase 1a: rename + theme<br/>+ kind field<br/><b>SHIPPED</b>"]
    VAP1B["Phase 1b: drop gravity<br/>double-count in F_net<br/><b>SHIPPED</b>"]
    VAP1C["Phase 1c-rev:<br/>kinematics in Frame<br/><b>PROPOSED</b>"]
    VAP2["Phase 2: velocity + accel"]
    VAP3["Phase 3: applied / friction /<br/>drag / gravity kinds"]
    VAP4["Phase 4: legend + presets"]
    VAP5["Phase 5: auto-scale calib"]
    VAP1A --> VAP1B --> VAP1C --> VAP2 --> VAP3 --> VAP4 --> VAP5
  end

  subgraph AIRPHASES["1. Air resistance"]
    direction TB
    AIRP1["Phase 1: debug-panel toggle<br/>+ Rapier mass-setter fix<br/><b>SHIPPED</b>"]
    AIRP2["Phase 2: schema additions<br/>airResistance + dragCoefficient"]
    AIRP3["Phase 3: deprecate frictionAir"]
    AIRP1 --> AIRP2 --> AIRP3
  end

  classDef done fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef proposed fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef pending fill:#dbeafe,stroke:#2563eb,color:#1e40af;

  class AIRP1,VAP1A,VAP1B done;
  class VAP1C,RP0 proposed;
  class AIRP2,AIRP3,APPP1,APPP2,APPP25,APPP3,APPP4,VECP1,VECP2,VECP3,VAP2,VAP3,VAP4,VAP5,RP1,RP2,RP3,RP4,RP5,RP6 pending;
`;

const cameraChart = `
flowchart LR
  R0REF["depends on:<br/>R0 kinematics-tier Frame<br/>= VA Phase 1c-rev<br/><b>PROPOSED</b>"]
  CP0["C0: lab-frame camera<br/>formalize abstraction"]
  CP1["C1: attached-to-body<br/>relative motion in kinematics"]
  CP2["C2: tilt-with-surface<br/>inclined-plane decomposition"]
  CP3["C3: contact-pair<br/>Newton's 3rd Law visualization"]
  CFUT["C-future:<br/>non-inertial frames<br/>(Coriolis, free-fall)"]
  R0REF --> CP0 --> CP1 --> CP2 --> CP3 --> CFUT

  classDef proposed fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef pending fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  class R0REF proposed;
  class CP0,CP1,CP2,CP3,CFUT pending;
`;

function RefactorRoadmap() {
  return (
    <DocsLayout
      title="5. Refactor roadmap"
      subtitle="A docs map: how five in-flight refactors relate to each other, which slice of the codebase each touches, and what's shipped vs proposed."
    >
      <p>
        Four kinds of doc on this map: <strong>research</strong> (engine
        affordances and the diorama-model framing for organizing work),{' '}
        <strong>trackers</strong> (system topics, wishlist, LLM audit — none of
        these propose code, they index it), <strong>physics refactors</strong>{' '}
        (air resistance, applied forces, vector representation — change the engine
        and schema), and <strong>visualization/runtime refactors</strong> (vector
        arrows, recordings &amp; cameras — change what the visual layer reads
        and how replay carries data).
      </p>

      <MermaidDiagram chart={chart} caption="Doc → doc and doc → codebase relationships. Pink (visualization/runtime) is the newer family; some of its work is already shipped." />

      <h2>Phase status across the five active refactors</h2>
      <p>
        The chart below reorders the refactor tracks by{' '}
        <strong>chronological-priority</strong> — the order they entered the
        conversation crossed with the order we expect to land them:
      </p>
      <ol>
        <li>
          <strong>Air resistance</strong> — first physics refactor; Phase 1
          already shipped. Quadratic-drag schema field is the natural next move
          when free-fall + terminal-velocity dioramas are next.
        </li>
        <li>
          <strong>Vector arrows (doc 6)</strong> — emerged from "let's start with
          how we show vectors." Phase 1a + 1b shipped during this conversation;
          1c-rev is the immediate next code change (and is the foundation for
          the Recordings track too).
        </li>
        <li>
          <strong>Vector representation (magnitude / angle)</strong> — the polar
          binding layer. Composes with Applied Forces and with the camera system.
          Cleanest to land after VA Phase 2 so the rendered output for polar
          bindings is the new <code>VectorArrow</code> component.
        </li>
        <li>
          <strong>Applied forces</strong> — the most invasive physics refactor;{' '}
          <code>applyImpulse</code> on PhysicsBody plus schema additions plus
          force-arrow visualization. Phase 4 (engine-read contact forces) becomes
          load-bearing for the dynamics-tier Frame schema in Recordings.
        </li>
        <li>
          <strong>Recordings (doc 7)</strong> — the architectural shift that
          turns replay into a sealed artifact. R0 = VA Phase 1c-rev (literally
          the same code change). Everything beyond R0 is library/compare UX and
          tier extensions.
        </li>
      </ol>
      <p>
        Vector arrows broke the standard "Phase 1 / 2 / 3" mold during testing —
        Phase 1 bisected into 1a (rename, shipped), 1b (drop F<sub>net</sub>'s
        gravity double-count, shipped), and 1c-rev (move kinematic derived state
        into the Frame schema, proposed). That last item is literally Phase R0
        of Recordings — landing one lands both.
      </p>

      <MermaidDiagram chart={phaseChart} caption="Per-refactor phase rollout, ordered by chronological priority. Green = shipped, yellow = proposed, blue = pending. VA 1c-rev and REC R0 are the same work — landing one lands both." />

      <h3>Camera track — separate, future, depends on R0</h3>
      <p>
        Cameras are pulled into their own diagram for two reasons. First, they
        share no code with anything in the chart above — once R0 lands, cameras
        are a pure replay-layer concern (geometric transforms on lab-frame
        recording data). Second, they're farther out: no immediate diorama
        depends on a non-default camera, so they ship when there's appetite for
        the pedagogical unlocks (relative motion, inclined-plane decomposition,
        Newton's 3rd Law visualization) and not before. See{' '}
        <a href="/docs/recordings-and-cameras">doc 7</a> for the camera math and
        the three pedagogical wins.
      </p>

      <MermaidDiagram chart={cameraChart} caption="Camera track. Depends on R0 (kinematic-tier Frame); otherwise independent of the in-flight refactors. Each step adds one camera kind and the pedagogy it unlocks." />

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
          <strong>Vector arrows + applied forces + air resistance</strong> — the
          vector-arrows refactor provides the unified renderable; applied forces
          and air resistance populate the per-frame userData fields the dynamics-tier
          kinds (<code>force-applied</code>, <code>force-friction</code>,{' '}
          <code>force-drag</code>) read from. The "Newton's 2nd Law diorama" needs
          all three to ship.
        </li>
        <li>
          <strong>Recordings &amp; cameras + vector arrows</strong> — they share
          a foundation: kinematic state in the per-frame schema. VA Phase 1c-rev
          and REC Phase R0 are the same code change. Lands once, unblocks both.
        </li>
        <li>
          <strong>Recordings &amp; cameras + vector representation</strong> —
          cameras are reference-frame transforms; polar projections are
          coordinate-system transforms. Same machinery, applied at view time.
          The vector-rep refactor's <code>VectorArrow</code> renderable becomes
          the natural rendering target for any transformed view.
        </li>
        <li>
          <strong>Recordings &amp; cameras + applied forces</strong> — the
          applied-forces refactor's Phase 4 (engine-read contact forces) was
          previously "optional later." Under the rich-precompute architecture it
          becomes load-bearing: it's the natural data source for the dynamics-tier
          Frame schema (REC Phase R5). The "ramp-aware analytical decomposition"
          open question from applied forces dissolves — engine-read forces in lab
          frame + ramp-tilt camera in replay gives correct decomposition on any
          geometry.
        </li>
        <li>
          <strong>Diorama model + everything</strong> — the diorama framing (each
          curriculum unit as a floor + UI wall + engine wall) reorganizes
          priority. Vector arrows is "left-wall standard UI." Air resistance and
          applied forces add back-wall standards. Recordings &amp; cameras
          formalizes the per-tier frame schema each diorama needs. Feature
          promotion (unique → standard) happens when ≥ 2 dioramas reach for the
          same affordance.
        </li>
        <li>
          <strong>Wishlist §10 (Expressions) + everything</strong> — once
          expressions land, KE, GPE, momentum, and conservation-check outputs
          become one-liner schema entries. Composes with applied forces (force-magnitude
          expressions), vector representation (named-computed inverse writes),
          recordings (expressions as derived-data fields in the Frame schema),
          and LLM prompting (curated computed registry).
        </li>
      </ul>

      <h2>Source documents</h2>

      <h3>Physics refactor proposals (.md, repo root)</h3>
      <ul>
        <li><code>Notes_on_Air_Resistance_Refactor.md</code></li>
        <li><code>Notes_on_Applied_Forces_Refactor.md</code></li>
        <li><code>Notes_on_Vector_Representation_Refactor.md</code></li>
      </ul>

      <h3>Visualization &amp; runtime refactor proposals (in-app docs)</h3>
      <ul>
        <li>
          <a href="/docs/vector-arrows">6. Vector arrows</a> — 7 arrow kinds,
          theme module, 8 SVG test scenes, Phase 1a/b shipped, 1c-rev proposed.
        </li>
        <li>
          <a href="/docs/recordings-and-cameras">7. Recordings &amp; cameras</a> —
          rich precompute architecture, saved experimental runs, reference-frame
          cameras. Design phase; foundational for visualization refactor track.
        </li>
      </ul>

      <h3>Research &amp; trackers (.md, repo root)</h3>
      <ul>
        <li><code>Physics_Chapters_with_Physics_Engines.md</code> — engine ↔ curriculum mapping</li>
        <li><code>GIST_Physics_System_Topics.md</code> — known issues, status-tracked</li>
        <li><code>GIST_Physics_Wishlist.md</code> — forward features, 14 sections</li>
        <li><code>GIST_LLM_Context_and_Prompting.md</code> — prompt audit, three concrete bugs</li>
      </ul>

      <h3>Cross-cutting framing (in-conversation, not yet a doc)</h3>
      <ul>
        <li>
          <strong>Diorama model</strong> — curriculum-unit vertical slices
          (floor = unit; left wall = UI; back wall = engine). Organizes
          refactor priority by "how many planned dioramas need this
          affordance?" Worth a doc once the first 4–6 dioramas are sketched.
        </li>
      </ul>
    </DocsLayout>
  );
}

export default RefactorRoadmap;
