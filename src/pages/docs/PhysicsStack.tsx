import DocsLayout from './DocsLayout';
import MermaidDiagram from '../../components/MermaidDiagram';

const chart = `
flowchart TB
  subgraph CALLERS["Callers (engine-agnostic)"]
    BASE["BaseSimulation.tsx"]
    RENDER["ObjectRenderer + controls"]
  end

  subgraph BOUNDARY["Adapter boundary (src/physics/types.ts)"]
    IFACE["PhysicsAdapter interface"]
    BODY["PhysicsBody interface"]
    DEF["BodyDef / WorldSnapshot"]
  end

  subgraph ADAPTERS["Engine adapters"]
    direction LR
    MATTER["MatterAdapter<br/><i>legacy / deprioritized</i>"]
    PLANCK["PlanckAdapter<br/>(Box2D port, JS)"]
    RAPIER["RapierAdapter<br/>(WASM, default)"]
  end

  subgraph LIBS["Engine libraries"]
    direction LR
    LMATTER["matter-js"]
    LPLANCK["planck"]
    LRAPIER["@dimforge/rapier2d-compat"]
  end

  CALLERS --> IFACE
  IFACE --> BODY
  IFACE --> DEF
  IFACE --> MATTER
  IFACE --> PLANCK
  IFACE --> RAPIER
  MATTER --> LMATTER
  PLANCK --> LPLANCK
  RAPIER --> LRAPIER

  classDef done fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef inprog fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef open fill:#fee2e2,stroke:#dc2626,color:#991b1b;
  classDef legacy fill:#f3f4f6,stroke:#6b7280,color:#374151;

  class MATTER legacy;
  class RAPIER,PLANCK done;
`;

const refactorChart = `
flowchart LR
  subgraph EXISTING["Already wired on PhysicsBody"]
    direction TB
    P["position · velocity"]
    M["mass · isStatic"]
    R["restitution"]
    D["setLinearDamping"]
  end

  subgraph PROPOSED["Adapter additions (proposed)"]
    direction TB
    AI["applyImpulse (Vec2)<br/>← Applied Forces refactor"]
    SF["setFriction(μ)<br/>← Applied Forces / frictionDemo"]
    APAT["applyImpulseAtPoint (optional)<br/>← Applied Forces"]
  end

  subgraph GAPS["Adapter feature gaps (not started)"]
    direction TB
    JOINTS["Joints (spring, revolute,<br/>prismatic, rope, pulley)"]
    SENSORS["Sensors (non-colliding<br/>trigger fixtures)"]
    EVENTS["Contact events with<br/>impulse readout"]
    CCD["enableCcd per body"]
  end

  subgraph QUIRKS["Cross-engine quirks (system-level)"]
    direction TB
    Q1["Rapier setAdditionalMass<br/>replaces, not adds<br/><b>FIXED 2026-04-29</b>"]
    Q2["Planck friction caches<br/>per-contact at creation<br/><b>OPEN — affects frictionDemo</b>"]
    Q3["Matter Y-down vs<br/>Planck/Rapier Y-up<br/>(adapter normalizes)"]
    Q4["frictionAir formula differs<br/>Matter: v *= (1−f)<br/>Planck/Rapier: v / (1+d·dt)"]
  end

  classDef done fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef inprog fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef open fill:#fee2e2,stroke:#dc2626,color:#991b1b;

  class P,M,R,D done;
  class AI,SF,APAT inprog;
  class JOINTS,SENSORS,EVENTS,CCD open;
  class Q1 done;
  class Q2,Q4 open;
`;

function PhysicsStack() {
  return (
    <DocsLayout
      title="2. Physics stack"
      subtitle="The PhysicsAdapter interface, three engines behind it, and where each refactor plugs in."
    >
      <p>
        All physics code above the adapter boundary is engine-agnostic. The interface lives in{' '}
        <code>src/physics/types.ts</code>; three concrete adapters implement it. Matter is in
        legacy / maintenance mode (per project memory); new work targets Planck and Rapier with
        Rapier as the default.
      </p>

      <MermaidDiagram chart={chart} caption="Layers: callers → boundary → adapters → engine libraries." />

      <h2>What's wired vs. what each refactor adds</h2>
      <p>
        Today the adapter exposes the basics: position, velocity, mass, restitution, and (since
        the air-resistance refactor) <code>setLinearDamping</code>. The applied-forces refactor
        adds force application; sensors, joints, and contact events remain feature gaps.
      </p>

      <MermaidDiagram chart={refactorChart} caption="Green = wired today; yellow = proposed; red = open gap or hazard." />

      <h2>Cross-engine quirks worth knowing</h2>
      <ul>
        <li>
          <strong>Rapier mass setter</strong> — fixed in commit <code>c5efe35</code>. The wrapper
          captures <code>baseMass</code> at construction so repeated <code>body.mass = X</code>{' '}
          calls are idempotent. See the bug writeup in{' '}
          <code>Notes_on_Air_Resistance_Refactor.md</code>.
        </li>
        <li>
          <strong>Planck friction caching</strong> — open hazard for the upcoming{' '}
          <code>frictionDemo</code> mode. Planck caches friction per-contact at contact creation;
          the adapter's <code>setFriction</code> implementation must call{' '}
          <code>contact.resetFriction()</code> on each active contact to make per-frame changes
          take effect.
        </li>
        <li>
          <strong>Y-up convention</strong> — uniform across all three adapters. Matter's
          internal Y-down is normalized by the Matter adapter so callers always see Y-up.
        </li>
      </ul>

      <h2>Source files</h2>
      <ul>
        <li>
          <code>Notes_on_Air_Resistance_Refactor.md</code> — adds <code>setLinearDamping</code>,
          documents the mass-setter fix
        </li>
        <li>
          <code>Notes_on_Applied_Forces_Refactor.md</code> — adds{' '}
          <code>applyImpulse</code>, <code>setFriction</code>, opt-in <code>frictionDemo</code>{' '}
          mode
        </li>
        <li>
          <code>GIST_Physics_System_Topics.md</code> — the cross-engine quirks above
        </li>
        <li>
          <code>Physics_Chapters_with_Physics_Engines.md</code> — engine affordances mapped to
          curriculum units
        </li>
      </ul>
    </DocsLayout>
  );
}

export default PhysicsStack;
