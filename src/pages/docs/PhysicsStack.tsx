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
    PLANCK["PlanckAdapter<br/>(Box2D port, JS)"]
    RAPIER["RapierAdapter<br/>(WASM, default)"]
  end

  subgraph LIBS["Engine libraries"]
    direction LR
    LPLANCK["planck"]
    LRAPIER["@dimforge/rapier2d-compat"]
  end

  CALLERS --> IFACE
  IFACE --> BODY
  IFACE --> DEF
  IFACE --> PLANCK
  IFACE --> RAPIER
  PLANCK --> LPLANCK
  RAPIER --> LRAPIER

  classDef done fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef inprog fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef open fill:#fee2e2,stroke:#dc2626,color:#991b1b;

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
  end

  classDef done fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef inprog fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef open fill:#fee2e2,stroke:#dc2626,color:#991b1b;

  class P,M,R,D done;
  class AI,SF,APAT inprog;
  class JOINTS,SENSORS,EVENTS,CCD open;
  class Q1 done;
  class Q2 open;
`;

function PhysicsStack() {
  return (
    <DocsLayout
      title="2. Physics stack"
      subtitle="The PhysicsAdapter interface, three engines behind it, and where each refactor plugs in."
    >
      <p>
        All physics code above the adapter boundary is engine-agnostic. The interface lives in{' '}
        <code>src/physics/types.ts</code>; two concrete adapters implement it (Planck and Rapier),
        with Rapier as the default.
      </p>
      <p className="bg-gray-50 border-l-4 border-gray-300 pl-4 py-2 text-sm text-gray-600">
        <strong>Historical note:</strong> a third adapter, <code>MatterAdapter</code> (matter-js),
        was the project's original physics engine and remained in-tree as a fallback through 2026
        while Planck and Rapier were brought up. It was an early exploration — its Y-down
        convention, per-step <code>frictionAir</code> formula (<code>v *= (1 − f)</code> rather
        than <code>v / (1 + d·dt)</code>), and a few solver gaps cost more than they bought.
        Removed 2026-05-11; saved configs with <code>physicsEngine: "matter"</code> are silently
        normalized to <code>"rapier"</code> at schema load.
      </p>

      <MermaidDiagram chart={chart} caption="Layers: callers → boundary → adapters → engine libraries. Matter (matter-js) was a third adapter, removed 2026-05-11." />

      <h2>What's wired vs. what each refactor adds</h2>
      <p>
        Today the adapter exposes the basics: position, velocity, mass, restitution, and (since
        the air-resistance refactor) <code>setLinearDamping</code>. The applied-forces refactor
        adds force application; sensors, joints, and contact events remain feature gaps. Both
        remaining engines are Y-up and SI-native, so the cross-engine-convention bugs that
        existed while Matter was in-tree are gone.
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
          <strong>Y-up convention</strong> — uniform across both adapters; SI-native throughout.
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
