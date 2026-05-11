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
    FORCE -.->|"Why not applyForce?<br/>cleared after each step#40;#41;"| FORCEBAD["applyForce in onUpdate<br/>only reaches substep 1<br/>#40;under-delivers in precompute#41; ✗"]
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

      <h2>Replay sidesteps the engine — and that forced a data-pipeline reframe</h2>
      <p>
        Two snapshot formats are at play in this codebase, and the distinction
        matters:
      </p>
      <ul>
        <li>
          <strong>Engine-level <code>WorldSnapshot</code></strong> (<code>src/physics/types.ts</code>)
          — <em>position, velocity, angle, angular velocity</em> per body.
          Used inside <code>BaseSimulation.precompute</code> for batch yielding;
          gets clobbered each batch. Not consumed by replay rendering directly.
        </li>
        <li>
          <strong>JsonSimulation-level <code>Frame[]</code></strong>{' '}
          (<code>frameCacheRef.current.frames</code>) — the actual replay storage.
          Today its <code>FrameBodySnap</code> carries only{' '}
          <code>{`{ id, x, y, angle }`}</code>. <strong>No velocity, no
            acceleration, no forces.</strong> Whatever <code>handleUpdate</code>{' '}
          last wrote to <code>body.userData</code> persists unchanged through
          every replay frame.
        </li>
      </ul>
      <p>
        That bit us as soon as the vector-arrow refactor fixed{' '}
        <code>F_net</code>'s gravity double-count (Phase 1b). The legacy formula
        <code>m · (a_derived + g)</code> had been accidentally serving as a
        replay safety net — the <code>+ g</code> term pulled gravity from{' '}
        <code>drawCtx.gravity</code> (a direct world-level read, not userData), so
        the arrow always rendered something during replay even when{' '}
        <code>a_derived</code> was stale. With the correct{' '}
        <code>F_net = m · a_derived</code>, that safety net is gone: derived
        state must actually exist per replay frame.
      </p>
      <p>
        The first-pass fix was "call <code>onUpdate</code> after replay snapshot
        restore, run the finite-diff there." That doesn't work — the replay path
        doesn't restore velocity to the body either, so the finite-diff would
        compare two stale values. The real fix is architectural:
      </p>
      <p>
        <strong>Phase 1c-rev:</strong> extend <code>FrameBodySnap</code> with the
        kinematic fields (<code>vx, vy, omega, ax, ay, alpha</code>). Populate
        them during precompute. Restore them to the body during replay. Vector
        arrow source resolvers read from the body in any mode and see fresh state
        — because either the engine just stepped it (live) or the replay loop
        just restored it from the recorded Frame (replay). Same code path; the
        body abstraction is mode-agnostic.
      </p>
      <p>
        This generalizes. Every derived quantity a visual layer wants to display
        — kinematic, dynamic (forces), momentum, energy — gets a place in a tiered
        Frame schema, computed during precompute, restored during replay. The
        Frame becomes the sealed deterministic artifact that drives all
        visualization. Replay does no physics calculation, only geometric
        transforms. The full design is in{' '}
        <a href="/docs/recordings-and-cameras">7. Recordings &amp; cameras</a> —
        same architectural shift, plus the recording-library and reference-frame
        camera capabilities it unlocks.
      </p>
      <p>
        <strong>Invariant for anything new the visual layer wants to display:</strong>{' '}
        if it has to be visible in replay, it belongs in the Frame schema for the
        relevant diorama tier. Putting it on <code>userData</code> alone — even
        with a write inside the pre-<code>isReplay</code>-return block — is the
        same bug class. Frames carry; userData doesn't.
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
