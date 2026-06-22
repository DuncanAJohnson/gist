import DocsLayout from './DocsLayout';
import MermaidDiagram from '../../components/MermaidDiagram';

const layersChart = `
flowchart TB
  subgraph REAL["Reality (SI, textbook values)"]
    direction TB
    RP["Real physics<br/>F = ½·ρ·Cd·A·v² (3D, A in m²)<br/>Cd from drag tables, A from geometry"]
  end

  subgraph SCOPING["Diorama scoping layer ← THE TUNING LIVES HERE"]
    direction TB
    SCH["Schema defaults &amp; descriptions<br/>(coefficients, shape-defaults, prose)"]
    PROMPT["LLM prompt prose<br/>(what values to pick)"]
    RUNTIME["Runtime computations<br/>(e.g., A = widest horizontal extent;<br/>k = ½·ρ·Cd·A as length, not area)"]
  end

  subgraph ENGINE["Engines (SI, deterministic, unaware)"]
    direction TB
    AD["PhysicsAdapter<br/>(Rapier / Planck)<br/>SI in, SI out — would behave identically<br/>in any other codebase given the same inputs"]
  end

  subgraph RENDER["Renderer (Y-flip, pixelsPerUnit)"]
    direction TB
    R["Per-frame state → canvas<br/>SI (Y-up) → canvas (Y-down)<br/>physics units → pixels at configured zoom"]
  end

  STUDENT["Student-visible motion<br/>(mass matters · shape matters ·<br/>terminal velocity exists)"]

  RP -.->|reference| SCH
  SCH --> PROMPT
  SCH --> RUNTIME
  RUNTIME --> AD
  AD --> R
  R --> STUDENT

  classDef real fill:#f3f4f6,stroke:#6b7280,color:#374151;
  classDef scope fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef engine fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef render fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  classDef student fill:#fce7f3,stroke:#db2777,color:#9d174d;

  class RP real;
  class SCH,PROMPT,RUNTIME scope;
  class AD engine;
  class R render;
  class STUDENT student;
`;

const decisionChart = `
flowchart TB
  START["New physics affordance proposed<br/>(drag, restitution, gravity, time, etc.)"]
  Q1{"Is the SI / textbook formulation<br/>visible at our canvas scale<br/>(tens of meters, tens of seconds)?"}
  USE_SI["Use SI defaults.<br/>Schema describes physical reality."]
  Q2{"What's the simplest dimensional<br/>or coefficient swap that makes<br/>the qualitative claim visible?"}
  DOC["Document:<br/>1. The decision (what we changed)<br/>2. Why (what becomes visible)<br/>3. The trade (what's no longer Wikipedia-correct)<br/>4. The override path (explicit fields)"]
  PROMPT["Update LLM prompt prose<br/>so the model authors values<br/>that respect the scoping."]
  COMMUNICATE["Future: communicate the choice<br/>to users (HUGE To Do — deferred)"]

  START --> Q1
  Q1 -->|"yes"| USE_SI
  Q1 -->|"no"| Q2
  Q2 --> DOC
  DOC --> PROMPT
  PROMPT --> COMMUNICATE

  classDef question fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef result fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef todo fill:#fee2e2,stroke:#dc2626,color:#991b1b;

  class Q1,Q2 question;
  class USE_SI,DOC,PROMPT result;
  class COMMUNICATE todo;
`;

function DesignPhilosophy() {
  return (
    <DocsLayout
      title="8. Design philosophy"
      subtitle="Diorama-scoped physics — the principle behind every coefficient, default, and schema choice."
    >
      <p className="bg-amber-50 border-l-4 border-amber-400 pl-4 py-2 text-sm text-amber-900">
        <strong>Register:</strong> this page is written for the internal team
        (Duncan, Ethan, Bill, Claude). When the user-facing communication
        infrastructure is built out (see "Known follow-ons" at the bottom), a
        separate teacher-audience rewrite of this material will be needed —
        same principle, different vocabulary, different examples.
      </p>

      <h2>The principle</h2>
      <p>
        <strong>GIST simulations are not physics oracles; they are teaching
          dioramas.</strong> Each curriculum unit lives inside a bounded scene
        with affordances scoped to what students can see, manipulate, and learn
        from at that scene's spatial and temporal scale (tens of meters wide,
        tens of seconds long).
      </p>
      <p>
        Real-world classroom-lab physics is often invisible at those scales —
        air resistance is negligible for a 1-meter drop; the elasticity of a
        real basketball on hardwood gives an unwatchable single bounce; the
        gravitational interaction of two desk-scale masses is unmeasurable in a
        human lifetime. A sim that simulates reality faithfully would make the
        very lessons we want to teach imperceptible.
      </p>
      <p>
        GIST instead tunes its physics to make the <em>qualitative claims</em>{' '}
        visible within the diorama: <em>mass matters; shape matters; terminal
        velocity exists; heavier-thing-falls-faster-with-air; collisions
        conserve momentum; etc.</em> The qualitative lessons land within the
        canvas. The absolute numbers don't always match Wikipedia. That's the
        trade, and it's the right one for a teaching tool.
      </p>

      <h2>Where the tuning lives</h2>
      <p>
        Critically: the scoping is <strong>not</strong> in the physics engines.
        Rapier and Planck stay SI, deterministic, and unaware of the diorama
        framing. Tuning happens at the layer above — schema defaults, schema
        prose (which becomes LLM prompt prose), and the runtime computations
        that translate from "what the LLM wrote" to "what the engine receives."
      </p>
      <MermaidDiagram
        chart={layersChart}
        caption="Five layers. The diorama scoping is the yellow layer — schema defaults, prompt prose, and runtime helpers. Engines below it are pristine SI. Renderers below that handle the canvas-coordinate concerns."
      />
      <p>
        This separation matters because it means the scoping decisions are{' '}
        <em>visible and tunable</em>. They live in <code>simulation.ts</code>{' '}
        descriptions, in <code>ObjectRenderer</code> shape-default
        computations, in <code>gist_instructions.py</code> prompt prose. A
        future contributor (or a teacher who wants to fork the system for a
        different curriculum) can find them, read why, and change them. They're
        not buried in C++ inside Rapier.
      </p>

      <h2>The first concrete scoping: air resistance</h2>
      <p>
        Air resistance is the first physics affordance where we've articulated
        the scoping in writing. The full rationale lives in{' '}
        <code>Notes_on_Air_Resistance_Refactor.md</code> under "Design
        rationale: diorama scoping (why linear-in-A, not squared-in-A)." In
        brief:
      </p>
      <ul>
        <li>
          The textbook 3D formula <code>F = ½·ρ·Cd·A·v²</code> uses{' '}
          <code>A</code> as a 2D area (m²). At classroom scales with physically
          accurate <code>Cd</code> values, drag is invisible — the bowling ball
          and the feather both fall at ~g.
        </li>
        <li>
          GIST uses <code>A</code> as a <strong>linear</strong> stand-in (the
          widest horizontal extent of the body), treating the 2D world as a 1m-deep
          slice of a 3D world. This gives drag enough authority over motion to
          be visible at canvas-scale drops (10–30 m, 1–5 s).
        </li>
        <li>
          Qualitative behavior is preserved: feather falls slower than a
          baseball falls slower than a bowling ball, and a heavier-version of
          any object falls faster than the lighter version. Absolute terminal
          velocities are off by a factor of a few from real-world values.
        </li>
        <li>
          Schema's <code>referenceArea</code> field stays optional and
          explicit. When a sim author needs different physics (horizontal
          motion, a flat-plate broadside, an SI-calibrated demo), they set it
          directly.
        </li>
      </ul>

      <h2>The second concrete scoping: diorama composition (stage and actors)</h2>
      <p>
        The second affordance we've articulated in writing. <em>Landed
        2026-05-21.</em> Same pattern as air resistance — qualitative claim
        preserved, absolute physical fidelity traded for visibility.
      </p>
      <p>
        <strong>The pathology.</strong> Before this landed, the LLM picked
        scene dimensions by reasoning about real-world spans ("a runway is
        1000 m wide; a tabletop scene is 5 m wide") and object widths/heights
        from real bounding boxes ("a soccer ball is 0.22 m"). The two
        together routinely produced sims where a real-sized soccer ball
        occupied 0.4% of a 60 m canvas — a barely-visible dot in a stage
        too big for the action it contained. Hand-authored sims that read
        well (e.g., <code>tossBall</code>) had quietly broken the
        real-world rule: the ball was 6 m wide on a 60 m canvas, ~10% of
        the smaller dimension. Inspecting the sample showed the implicit
        "good" composition was 10× the absolute size of the realistic one.
      </p>
      <p>
        <strong>The principle.</strong> A GIST diorama is a stage
        composition, not a scale model. Like theatre: actors aren't built
        to scale with the set. The set is sized so the play resolves at a
        readable pace; the actors are sized so the audience can see them
        from the back row. The qualitative claims —{' '}
        <em>which object is bigger, what direction motion goes, how long
        the event takes</em> — are preserved. Absolute spatial scale is
        not.
      </p>
      <p>
        <strong>The two formulas.</strong> The LLM now picks scene scale
        from the action's time budget and object sizes from a fraction of
        the resulting scene dimension:
      </p>
      <ul>
        <li>
          <strong>Scene scale</strong> ← target action time <code>t</code>{' '}
          in 2–6 seconds. Then <code>span = </code>(dominant motion
          equation):
          <ul>
            <li>Free fall from rest: <code>span ≈ ½·g·t²</code>.</li>
            <li>Vertical toss: <code>span ≈ v₀²/(2·g)</code>.</li>
            <li>Horizontal projectile: <code>span ≈ v₀·t</code>.</li>
            <li>Collision / push: <code>span ≈ 2·v_avg·t</code>.</li>
          </ul>
          Add 20% padding. Clamp to [10, 80] configured-units. Most
          well-tuned dioramas land in 20–60.
        </li>
        <li>
          <strong>Object size</strong> ← <code>D = min(scene_width, scene_height)</code>{' '}
          in configured units.
          <ul>
            <li>Largest object: <code>width ≈ 0.10 · D</code>.</li>
            <li>Smallest object: <code>width ≥ 0.04 · D</code>.</li>
            <li>
              Relative ratio: preserve ordering (heavy &gt; light), compress
              range to ~2–3:1 even when reality demands 5:1+.
            </li>
            <li>
              Aspect ratio: match the svg's natural shape (boat wider than
              tall, person taller than wide).
            </li>
          </ul>
        </li>
      </ul>
      <p>
        <strong>What stays real.</strong> Gravity (9.8 m/s²), masses,
        restitution coefficients, drag coefficients, velocities — all
        textbook. The only diorama-scoped quantities are{' '}
        <code>scene_dimension.size</code> and per-object{' '}
        <code>width</code> / <code>height</code>. Physics integration is
        unaffected: a 5-meter "feather" with mass 0.05 kg still falls
        through air resistance at the right qualitative pace because the
        non-spatial inputs (mass, Cd, density) are honest. The visual is
        what changed, not the physics.
      </p>
      <p>
        <strong>What breaks.</strong> Anything that would have read the
        bounding-box width as if it were a real physical size. In practice,
        this affects only one current field:{' '}
        <code>referenceArea</code> for drag (the air-resistance refactor
        already noted this and gave authors an explicit override). Mass,
        inertia, restitution, and friction are all independent fields, so
        scaling visual sizes leaves them untouched. The override path
        absorbs the trade.
      </p>
      <p>
        <strong>Where the scoping lives</strong> (per the three-places
        rule):
      </p>
      <ul>
        <li>
          <strong>Schema describe</strong>: <code>ObjectConfig.width</code>
          {' '}/ <code>.height</code> describe text now reads
          "DIORAMA-SIZED, not real-world." Top-level{' '}
          <code>SimulationConfig</code> docstring gained a "DIORAMA
          SCOPING" section that states the principle plus the scene-scale
          and object-size formulas.
        </li>
        <li>
          <strong>LLM prompt</strong>:{' '}
          <code>shared_preamble</code> dropped its "use real-world
          bounding-box sizes" line.{' '}
          <code>skeleton_fragment</code>'s scene-scale section was
          replaced with action-time-first reasoning (target <code>t</code>{' '}
          → motion equation → span × 1.2 → clamp).{' '}
          <code>objects_fill_fragment</code> step 1 swapped the
          real-world reference list (soccer ball 0.22 m, person 1.8 m) for
          the 10%-of-D rule plus a worked example.
        </li>
        <li>
          <strong>Design philosophy doc</strong>: this section.
        </li>
      </ul>

      <h2>Future scoping decisions</h2>
      <p>
        Air resistance is the first one, not the last. Other affordances will
        need the same treatment as we get to them. A rough enumeration of
        places where we'll likely need to make scoping decisions:
      </p>
      <ul>
        <li>
          <strong>Restitution defaults.</strong> Current default{' '}
          <code>0.8</code> makes bouncing visible; real basketballs on hardwood
          are <code>~0.5</code>. The <code>0.8</code> is already a
          diorama-scoped value — worth making that explicit in the schema
          description and on this page when we revisit collisions.
        </li>
        <li>
          <strong>Gravity scaling.</strong> Earth gravity (9.8 m/s²) is fine
          for terrestrial drops. Orbital-mechanics demos at planetary scale
          would need either real <code>G·M/r²</code> with planetary masses
          (orders of magnitude beyond our coordinate range) or a scaled-down
          analogue. Will need a decision.
        </li>
        <li>
          <strong>Time scaling.</strong> Some demonstrations only make sense
          slowed-down (oscillating springs at high frequency, fast collisions).
          We have <code>playbackSpeed</code> as a viewing-time knob; we may
          eventually need a sim-authored "this sim runs at 0.5× real time"
          field for didactic clarity.
        </li>
        <li>
          <strong>Friction coefficients.</strong> Schema currently uses generic
          ranges. Whether the defaults make sliding-versus-rolling visibly
          distinguishable at canvas scale is an open question; if not, we'll
          tune them and document.
        </li>
        <li>
          <strong>Spring stiffness / damping.</strong> When the joints work
          lands, picking defaults for <code>k</code> and <code>c</code> that
          produce visible oscillation in a 60-meter canvas without numerical
          instability will be a scoping decision.
        </li>
      </ul>
      <p>
        The pattern for each: <em>can the SI default be used, and is the
        physics visible at our scale?</em> If yes, use SI. If no, find the
        simplest swap that preserves the qualitative claim, document the trade,
        and provide an explicit override.
      </p>

      <h2>A decision template for new scoping</h2>
      <MermaidDiagram
        chart={decisionChart}
        caption="Walk new physics affordances through this template before locking the schema and prompt. Documenting in this order keeps the decisions visible and overridable."
      />

      <h2>What this design philosophy is NOT</h2>
      <ul>
        <li>
          <strong>Not a license to fudge.</strong> Each scoping decision is
          explicitly documented with its trade-offs. We don't quietly change
          coefficients; we change them, write down why, and provide an
          override.
        </li>
        <li>
          <strong>Not an engine modification.</strong> Rapier and Planck stay
          SI and pristine. The scoping is at the schema/runtime layer above
          them. Anyone could lift the engines into a non-GIST project and get
          textbook physics.
        </li>
        <li>
          <strong>Not a permanent compromise.</strong> The override path is
          first-class. A sim that needs realism for a specific lesson can set
          explicit values and get it. The scoped defaults exist to make the
          common case (a teaching diorama at canvas scale) work without
          authoring overhead.
        </li>
        <li>
          <strong>Not hidden from the system.</strong> Every scoping decision
          should be reflected in (a) the schema <code>.describe()</code> string
          for the field, (b) the LLM prompt prose, and (c) a section on this
          doc page. If a decision isn't in all three places, it isn't fully
          landed.
        </li>
      </ul>

      <h2>Known follow-ons (deferred)</h2>
      <p>
        The internal team-facing version of this principle is what this page
        articulates. There's a parallel, much larger piece of work that lives
        ahead of us:
      </p>
      <ol>
        <li>
          <strong>User-facing communication of scoping decisions.</strong> The
          teacher running the sim with their class currently has no way to
          know that air resistance is scoped, that restitution defaults
          privilege visibility, that <code>v_t</code> in this sim differs from
          Wikipedia. The system needs an "about the physics in this
          simulation" affordance — either in-sim (info button), in a separate{' '}
          <code>/about</code> page, or as a schema-level{' '}
          <code>pedagogicalNotes</code> field rendered prominently. Deferred
          while the test user community is small.
        </li>
        <li>
          <strong>A teacher's guide.</strong> A single document a teacher can
          read before using GIST in a classroom that explains the diorama
          framing, lists the specific scoping decisions, and gives talking
          points for "why don't the numbers match my textbook?" Deferred for
          the same reason.
        </li>
        <li>
          <strong>Schema-description audit through the diorama lens.</strong>{' '}
          Many <code>.describe()</code> strings still read as "physics is
          realistic." A review pass should reword them so they're honest about
          which defaults are scoped — without making the LLM prompt verbose or
          confusing.
        </li>
        <li>
          <strong>Per-sim pedagogical notes.</strong> A schema-level{' '}
          <code>pedagogicalNotes</code> field on{' '}
          <code>SimulationConfig</code> so the LLM (and hand-authors) can
          articulate what a specific sim teaches and which scoping decisions
          are load-bearing for that lesson. Renders somewhere prominent in the
          sim UI.
        </li>
      </ol>

      <h2>Source documents</h2>
      <ul>
        <li>
          <code>Notes_on_Air_Resistance_Refactor.md</code> — first worked
          example of a scoping decision. The "Design rationale: diorama
          scoping" section is the model.
        </li>
        <li>
          <code>Physics_Chapters_with_Physics_Engines.md</code> — preamble
          stating the principle at the system level, before the per-chapter
          affordance maps.
        </li>
        <li>
          <a href="/docs/refactor-roadmap">5. Refactor roadmap</a> — touches
          the diorama framing in its "How the refactors compose" section.
        </li>
        <li>
          <a href="/docs/physics-stack">2. Physics stack</a> — confirms the
          engines stay SI; the scoping is at the schema/runtime layer above
          the adapter boundary.
        </li>
      </ul>
    </DocsLayout>
  );
}

export default DesignPhilosophy;
