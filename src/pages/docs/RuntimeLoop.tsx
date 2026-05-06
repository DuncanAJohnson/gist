import DocsLayout from './DocsLayout';
import MermaidDiagram from '../../components/MermaidDiagram';

const chart = `
flowchart TB
  RAF{{"requestAnimationFrame"}}
  RAF --> MODE{Mode?}

  MODE -->|live| LIVE
  MODE -->|precompute| PRE
  MODE -->|replay| REP

  subgraph LIVE["Live mode — 1 step / frame"]
    direction TB
    L1["onUpdate(adapter, t)"]
    L2["adapter.step(FIXED_DT)"]
    L3["paint frame"]
    L1 --> L2 --> L3
  end

  subgraph PRE["Precompute mode — ~8 substeps / frame"]
    direction TB
    P1["onUpdate(adapter, t)"]
    P2["for i in substeps:<br/>adapter.step(substepDt)"]
    P3["snapshot batch every N frames"]
    P4["yield to rAF<br/>between batches"]
    P1 --> P2 --> P3 --> P4
  end

  subgraph REP["Replay mode — read snapshots, no engine call"]
    direction TB
    R1["read snapshot[t]"]
    R2["paint frame"]
    R1 --> R2
  end

  LIVE -->|next frame| RAF
  PRE -->|next batch| RAF
  REP -->|next frame| RAF

  classDef important fill:#fef3c7,stroke:#d97706,color:#92400e;
  class L1,P1 important;
`;

const forceChart = `
flowchart LR
  subgraph FRAME["One logical frame in onUpdate"]
    direction TB
    OU["onUpdate fires once<br/>(both live and precompute)"]
    DECISION{What kind of<br/>per-frame work?}
    DRAG["Drag<br/>(air resistance refactor)"]
    FORCE["Applied force<br/>(applied-forces refactor)"]

    OU --> DECISION
    DECISION --> DRAG
    DECISION --> FORCE

    DRAG --> DRAGOK["body.setLinearDamping(<br/>(k/m)·|v|)<br/>← survives all 8 substeps ✓"]
    FORCE --> FORCEOK["body.applyImpulse(<br/>F · FIXED_DT)<br/>← velocity change persists ✓"]
    FORCE -.->|Why not applyForce?<br/>cleared after each step()| FORCEBAD["applyForce in onUpdate<br/>only reaches substep 1<br/>(under-delivers in precompute) ✗"]
  end

  classDef good fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef bad fill:#fee2e2,stroke:#dc2626,color:#991b1b;
  classDef neutral fill:#fef3c7,stroke:#d97706,color:#92400e;

  class DRAGOK,FORCEOK good;
  class FORCEBAD bad;
  class OU neutral;
`;

function RuntimeLoop() {
  return (
    <DocsLayout
      title="3. Runtime loop"
      subtitle="Three modes (live / precompute / replay), where onUpdate sits in each, and the substep gotcha that shapes how drag and applied force are formulated."
    >
      <p>
        <code>BaseSimulation.tsx</code> is the heartbeat. A <code>requestAnimationFrame</code>{' '}
        loop dispatches to one of three modes. <strong>Live</strong> steps the engine once per
        rendered frame; <strong>precompute</strong> substeps for integration accuracy and
        snapshots every N frames; <strong>replay</strong> reads snapshots without touching the
        engine.
      </p>

      <MermaidDiagram chart={chart} caption="Three modes share the same rAF loop. Yellow = onUpdate hook." />

      <h2>The substep clearing gotcha</h2>
      <p>
        Both engines clear accumulated forces after <code>world.step()</code>. Precompute runs ~8
        substeps per logical frame, but <code>onUpdate</code> fires only once per logical frame
        (at the substep boundary). So a <code>applyForce</code> call in <code>onUpdate</code>{' '}
        reaches only the first substep — the remaining 7 see no force. This shaped the design of
        both physics refactors:
      </p>

      <MermaidDiagram chart={forceChart} caption="Why drag is set as damping and applied force is delivered as impulse." />

      <ul>
        <li>
          <strong>Drag (air resistance)</strong> — set as a body property (<code>linearDamping</code>),
          so the engine's substep integrator applies it consistently across all 8 substeps. Per-frame
          formula: <code>damping = (k/m)·|v|</code>.
        </li>
        <li>
          <strong>Applied force (PhET Forces and Motion)</strong> — delivered as an{' '}
          <strong>impulse</strong>{' '}
          (<code>J = F · FIXED_DT_SECONDS</code>) once per logical frame. Impulse changes velocity
          once; the new velocity persists across all substeps. No under-delivery.
        </li>
        <li>
          A per-substep <code>onPreStep(body, dt)</code> hook was considered and deferred — both
          refactors found a substep-invariant formulation that doesn't need it.
        </li>
      </ul>

      <h2>Replay sidesteps the engine entirely</h2>
      <p>
        Anything dynamic in <code>onUpdate</code> (force arrows reading <code>userData</code>,
        applied-force visualization, etc.) needs to either bake into the snapshot or compute purely
        from snapshot fields — the engine isn't running during replay.
      </p>

      <h2>Source files</h2>
      <ul>
        <li>
          <code>Notes_on_Air_Resistance_Refactor.md</code> — the damping-not-force formulation;
          analysis of the substep gotcha
        </li>
        <li>
          <code>Notes_on_Applied_Forces_Refactor.md</code> — the impulse-not-force formulation;
          static-friction demo mode lives here too
        </li>
        <li>
          <code>GIST_Physics_System_Topics.md</code> — &quot;loop-mode semantics&quot; section
          documents the live / precompute / replay invariants
        </li>
      </ul>
    </DocsLayout>
  );
}

export default RuntimeLoop;
