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
    VEC["Vector Representation<br/>magnitude/angle paths<br/><b>P1+P2 SHIPPED — CLOSED 2026-07-04</b>"]
  end

  subgraph VIS["Visualization & runtime proposals"]
    VA["Vector Arrows / doc 6<br/>7 kinds + theme<br/><b>Phase 1a/b/c-rev SHIPPED</b>"]
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
    RP0["R0: kinematics-tier Frame<br/>= VA Phase 1c-rev<br/><b>SHIPPED</b>"]
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

  subgraph VECPHASES["3. Vector representation — CLOSED 2026-07-04"]
    direction TB
    VECP1["Phase 1: path-resolver<br/>.magnitude / .angle<br/>+ angleUnit family<br/><b>SHIPPED</b>"]
    VECP2["Phase 2: polar initial conditions<br/>velocity only; normalized at the<br/>config→SI ingestion seam<br/><b>SHIPPED</b>"]
    VECP3["Dispositions at close-out:<br/>all-vectors sweep → end of applied-forces<br/>polarSlider → future UI track (parking lot)<br/>VectorArrow → applied-forces / vector-arrows<br/>angle-wrap (P4) → parking lot"]
    VECP1 --> VECP2 --> VECP3
  end

  subgraph VAPHASES["2. Vector arrows / doc 6"]
    direction TB
    VAP1A["Phase 1a: rename + theme<br/>+ kind field<br/><b>SHIPPED</b>"]
    VAP1B["Phase 1b: drop gravity<br/>double-count in F_net<br/><b>SHIPPED</b>"]
    VAP1C["Phase 1c-rev:<br/>kinematics in Frame<br/><b>SHIPPED</b>"]
    VAP2["Phase 2: velocity + accel<br/>+ showVectors schema<br/><b>SHIPPED</b>"]
    VAP3["Phase 3: applied / friction /<br/>drag / gravity kinds"]
    VAP4["Phase 4: legend + presets"]
    VAP5["Phase 5: auto-scale calib"]
    VAP1A --> VAP1B --> VAP1C --> VAP2 --> VAP3 --> VAP4 --> VAP5
  end

  subgraph AIRPHASES["1. Air resistance"]
    direction TB
    AIRP1["Phase 1: debug-panel toggle<br/>+ Rapier mass-setter fix<br/><b>SHIPPED</b>"]
    AIRP2["Phase 2: schema additions<br/>airResistance + dragCoefficient<br/>+ referenceArea + airDensity<br/><b>SHIPPED</b>"]
    AIRP3["Phase 3: remove frictionAir<br/>end-to-end<br/><b>SHIPPED</b>"]
    AIRP1 --> AIRP2 --> AIRP3
  end

  subgraph CONCAVEPHASES["6. Concave colliders + collider tooling"]
    direction TB
    CCP0["Phase 0 — dynamic compound proven<br/>cup catch + tip · <b>SHIPPED</b>"]
    subgraph CCNOW["actionable / in progress"]
      direction TB
      CC3["3 · open-container factory ⭐<br/>cup / box / wagon (makeOpenContainer)<br/>+ one-sided walls · <b>SHIPPED 2026-07-15</b>"]
      CC1["1 · collider debug / observation overlay<br/>BodyOutline; shows decomposition + Planck-12"]
      CC2["2 · post-decompose Planck guard<br/>dev-warn on any part over 12 verts"]
      CC6["6 · Option B — manifest declares<br/>its collider coord-space"]
      CC7["7 · decomposition sanity<br/>part-count cap + winding / self-intersect"]
    end
    subgraph CCGATED["gated"]
      direction TB
      CC4["4 · inertia override — hoop<br/>collide circle, set I = mr²"]
      CC5["5 · convex → polygon rename<br/>Phase-4 three-places landing"]
      CC8["8 · CCD + catch detection<br/>sensors / events · lower priority"]
    end
    CCP0 --> CC1
    CCP0 --> CC3
  end

  classDef done fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef proposed fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef pending fill:#dbeafe,stroke:#2563eb,color:#1e40af;

  class AIRP1,AIRP2,AIRP3,VAP1A,VAP1B,VAP1C,VAP2,CCP0,CC3,RP0,VECP1 done;
  class APPP1,APPP2,APPP25,APPP3,APPP4,VECP2,VECP3,VAP3,VAP4,VAP5,CC4,CC5,CC8,RP1,RP2,RP3,RP4,RP5,RP6 pending;
  class CC1,CC2,CC6,CC7 proposed;
`;

const cameraChart = `
flowchart LR
  R0REF["depends on:<br/>R0 kinematics-tier Frame<br/>= VA Phase 1c-rev<br/><b>SHIPPED</b>"]
  CP0["C0: lab-frame camera<br/>formalize abstraction"]
  CP1["C1: attached-to-body<br/>relative motion in kinematics"]
  CP2["C2: tilt-with-surface<br/>inclined-plane decomposition"]
  CP3["C3: contact-pair<br/>Newton's 3rd Law visualization"]
  CFUT["C-future:<br/>non-inertial frames<br/>(Coriolis, free-fall)"]
  R0REF --> CP0 --> CP1 --> CP2 --> CP3 --> CFUT

  classDef done fill:#dcfce7,stroke:#16a34a,color:#166534;
  classDef pending fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  class R0REF done;
  class CP0,CP1,CP2,CP3,CFUT pending;
`;

function RefactorRoadmap() {
  return (
    <DocsLayout
      title="5. Refactor roadmap"
      subtitle="A docs map: how the in-flight refactors relate to each other, which slice of the codebase each touches, and what's shipped vs proposed."
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
          <strong>Air resistance</strong> — first physics refactor;{' '}
          <strong>all three phases shipped</strong>. The quadratic,
          mass-dependent drag model is live end-to-end: the{' '}
          <code>environment.airResistance</code> block (<code>enabled</code>,{' '}
          <code>airDensity</code>) plus per-object <code>dragCoefficient</code> /{' '}
          <code>referenceArea</code>, wired into the runtime
          (<code>setLinearDamping((k/m)·|v|)</code>), the generated JSON schema,
          and the LLM prompt. Phase 3 removed the legacy{' '}
          <code>frictionAir</code> field end-to-end (schema, <code>BodyDef</code>,
          both adapters, <code>ObjectRenderer</code>, <code>JsonSimulation</code>,
          example sims, and the prompt); the quadratic model is now the only
          damping path, and the air-resistance debug "Off" mode simply clears
          damping (<code>setLinearDamping(0)</code>).
        </li>
        <li>
          <strong>Vector arrows (doc 6)</strong> — emerged from "let's start with
          how we show vectors." Phases 1a + 1b + 1c-rev + 2 all shipped. 1c-rev was
          also the foundation for the Recordings track (= R0). Phase 2 added the{' '}
          <code>velocity</code> and <code>acceleration</code> kinds plus the{' '}
          <code>showVectors</code> schema (replacing the boolean{' '}
          <code>showForceArrows</code> with a discriminated array that accepts
          shorthand strings or full per-arrow override configs; legacy{' '}
          <code>showForceArrows: true</code> auto-translates via a{' '}
          <code>z.preprocess</code> shim plus a synthesize-time runtime fallback).
          A small parallel change opened acceleration sliders to the LLM (the
          runtime was already wired; the schema's describe text was the only gap).
          Phase 3 (the decomposed force kinds — applied, friction, drag, gravity)
          is the natural next step, gated on the applied-forces refactor landing{' '}
          its <code>userData.appliedForce</code> writes.
        </li>
        <li>
          <strong>Vector representation (magnitude / angle)</strong> — the polar
          binding layer. <b>CLOSED 2026-07-04; Phases 1 + 2 shipped and verified.</b>{' '}
          Phase 1 (2026-06-23): the path-resolver reads/writes <code>.magnitude</code> /{' '}
          <code>.angle</code> as a derived projection over canonical{' '}
          <code>{'{x,y}'}</code>, with held-angle state keyed per vector, plus the{' '}
          <strong>angle-unit family</strong> (<code>environment.angleUnit</code>:{' '}
          deg / rad / rot, canonical radians) that dissolved a latent bug silently
          mis-scaling <code>velocity.angle</code> by the length factor on non-meter
          sims. Phase 2 (2026-07-04): polar-authored initial conditions
          (<code>velocity: {'{magnitude, angle}'}</code>, velocity only), normalized
          at the config→SI ingestion seam (<code>scaleObjectToSI</code>) — see the
          seam node on <a href="/docs/app-overview">the app overview</a>. Close-out
          dispositions: the all-vectors polar-authoring sweep (acceleration, gravity,
          appliedForce) is pinned to the <em>end of applied-forces</em>; the paired{' '}
          <code>polarSlider</code> seeds a future UI-refactor track (parking lot);{' '}
          <code>VectorArrow</code> transferred to the vector-arrows / applied-forces
          tracks; the angle-wrap graph toggle is parked. Canonical rationale:{' '}
          <code>Notes_on_Vector_Representation_Refactor.md</code> Findings
          2026-07-04.
        </li>
        <li>
          <strong>Applied forces</strong> — the most invasive physics refactor;{' '}
          <code>applyImpulse</code> on PhysicsBody plus schema additions plus
          force-arrow visualization. Phase 4 (engine-read contact forces) becomes
          load-bearing for the dynamics-tier Frame schema in Recordings.
        </li>
        <li>
          <strong>Recordings (doc 7)</strong> — the architectural shift that
          turns replay into a sealed artifact. R0 shipped with VA Phase 1c-rev
          (literally the same code change). Everything beyond R0 is library/compare
          UX and tier extensions, all unblocked.
        </li>
        <li>
          <strong>Concave colliders</strong> — open containers (cup/bucket) and
          open-top vehicles (wagon) for the "catch the marble" and ball-in-wagon
          (Newton's 1st law) sims. The engine path already existed
          (<code>decomposePolygonShape</code> → <code>compound</code>, consumed by
          both adapters); Phase 0 <b>SHIPPED</b> proved a dynamic compound both
          catches and tips. Remaining work is content, CCD robustness, catch
          detection, and the three-places landing (schema + prompt) so the LLM can
          author concave shapes. <b>Agent-side dev is paused (2026-06-22)</b>:
          both Phase 1/4 prereqs are resolved, so the next driver is curriculum —
          the author is hand-building sims to define the Tier 1 priority shape list
          that will unblock the resumed dev. <b>Tier 1 gate resolved (2026-07-02)</b>{' '}
          — the priority list arrived as the topics-driven curriculum roadmap (see
          below); the concave Tier 1 is now the <b>Rung 2 open-container factory</b>{' '}
          (cup / box / wagon as one <code>makeOpenContainer</code> build). The scope also broadened beyond content: a{' '}
          <b>collider debug / observation overlay</b> (renders the actual decomposed
          geometry + a per-part Planck-vertex readout — the pinned Planck silently
          truncates polygons over 12 verts, so a decomposed part that big builds a wrong
          collider with no error) is scoped as an <em>observation instrument</em>,
          alongside a post-decompose guard, the <code>convex → polygon</code> rename, an
          inertia-override path for the rolling hoop, and the manifest self-describing
          its coordinate space. The phase chart above renumbers these <b>1–8</b> and
          colors which are actionable/in-progress (amber) vs gated (blue).{' '}
          <b>Factory SHIPPED (2026-07-15)</b> — go confirmed 2026-07-10, built and
          headless-verified the same day, ship-gate checklist passed on Bill&rsquo;s
          fresh-session re-drive 2026-07-15 (three factory sims + friction-fix
          regressions, both engines): it lives in gist (factory code +
          hand-authored local sims at <code>/simulation/cup-catch</code>,{' '}
          <code>box-catch</code>, <code>wagon-stop</code>; the schema/prompt landing
          stays Phase 4), synthesizes the concave U outline from parameters and
          feeds the proven <code>decomposePolygonShape</code> path (parts ≤4 verts,
          Planck-safe by construction), draws a flat-fill visual for v1 (SVG skins
          later), and supports <code>mode: free | grounded</code> — both{' '}
          <em>dynamic</em> (grounded = spawn-seated on the floor + friction preset,
          the wagon regime; static remains the orthogonal <code>isStatic</code>{' '}
          flag) — with <code>prismatic</code> deferred to the joints workstream (the
          adapter layer has no joint support yet). Drive feedback grew the factory
          same-week: <code>walls: 'both' | 'left' | 'right'</code> — one-sided
          containers (a 6-vertex L, 2 decomposed quads) for the clean
          Newton&rsquo;s-first-law wagon with an open front. The external generator change set is
          superseded for Tier 1 (parametric containers need no SVG assets) and
          becomes the Tier-2 route; the generator itself gains a broader future
          charter (custom compounds + environment/background shapes).{' '}
          <b>Debug-tool set completed (2026-07-03)</b>: an{' '}
          <b>Import Object</b> debug-panel button loads an SVG-generator export (zip
          or .svg + manifest .json) into a live sim as a session-only test object,
          with optional slider-control presets at import (speed / launch angle /
          accel); <b>select + Delete</b> removes any object (with full
          control/output/graph cleanup); and the <b>observation overlay is built</b> —{' '}
          <code>?colliders=1</code> renders each body&rsquo;s decomposed collider parts
          in distinct colors with vertex counts flagged red above Planck&rsquo;s silent
          12-vert cap (engine-actual fixture readback deferred). Together: generator
          export → live sim → visible engine-truth colliders, before anything lands
          in <code>public/renderables/</code>. See{' '}
          <code>Notes_on_Concave_Colliders_Refactor.md</code>,{' '}
          <code>PHYSICS_SHAPES.md</code>, and <code>Local_Sim_Workflow.md</code>.
        </li>
      </ol>
      <p>
        Vector arrows broke the standard "Phase 1 / 2 / 3" mold during testing —
        Phase 1 bisected into 1a (rename), 1b (drop F<sub>net</sub>'s gravity
        double-count), and 1c-rev (move kinematic derived state into the Frame
        schema). All three shipped. 1c-rev is also Phase R0 of Recordings — one
        code change unblocked both tracks.
      </p>

      <MermaidDiagram chart={phaseChart} caption="Per-refactor phase rollout, ordered by chronological priority. Green = shipped, blue = pending/gated, amber = actionable now (concave column's not-gated tooling). VA 1c-rev and REC R0 were the same work — one landing unblocked both." />

      <h3>Camera track — separate, future, depends on R0</h3>
      <p>
        Cameras are pulled into their own diagram for two reasons. First, they
        share no code with anything in the chart above — with R0 shipped, cameras
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
          &quot;set force magnitude while preserving direction&quot; work correctly. The polar
          layer shipped first (vector-rep closed 2026-07-04), so when{' '}
          <code>appliedForce</code> lands, its polar projections come free — and the
          closing phase of applied-forces sweeps polar <em>authoring</em> across all
          remaining vector fields (acceleration, gravity, appliedForce), pinned there
          at vector-rep close-out.
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
          and REC Phase R0 were the same code change. Shipped once, unblocked both.
        </li>
        <li>
          <strong>Recordings &amp; cameras + vector representation</strong> —
          cameras are reference-frame transforms; polar projections are
          coordinate-system transforms. Same machinery, applied at view time.
          The shared <code>VectorArrow</code> renderable (owned by the
          vector-arrows / applied-forces tracks since vector-rep&apos;s close-out)
          becomes the natural rendering target for any transformed view.
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

      <h2>Topics-driven curriculum roadmap (new layer, 2026-07-02)</h2>
      <p>
        A new family of docs sits <em>above</em> the per-refactor notes on this
        map. Where the refactor notes are organized by <strong>capability</strong>{' '}
        (air resistance, applied forces, colliders…), the curriculum roadmap is
        organized by <strong>what to teach</strong>: each archetype names the
        physics, the collider/joint technique it needs, the closed-form solution
        that anchors the analytical↔numerical↔experimental triangle, and the graph
        where that overlay happens on screen. Four cross-referenced files, keyed by
        stable IDs:
      </p>
      <ul>
        <li>
          <strong>PHYSICS_SHAPES.md (v2)</strong> — collider archetypes{' '}
          (<code>S0.1…S4.1</code>) in five rungs of climbing concavity. The{' '}
          <strong>concave-colliders</strong> refactor above is Rung 2+ of this file;
          its Tier 1 is the <strong>open-container factory</strong> (cup/box/wagon).
          v2 also resolves the rolling hoop via <em>mass-property override</em>{' '}
          (convex contact shape, overridden inertia) — no concave annulus collider.
        </li>
        <li>
          <strong>PHYSICS_JOINTS_CONSTRAINTS.md (v1)</strong> — joint archetypes{' '}
          (<code>J1…J9</code>): pendulum, spring-mass, lever, prismatic rail,
          ball-on-string, path-constraint, Atwood, double pendulum. This is a{' '}
          <strong>new workstream</strong> — previously only a wishlist/feature-gap
          line — that buys large curriculum coverage at low contact risk, since both
          engines ship joints natively. <strong>To verify first:</strong> Rapier has
          no native pulley (Atwood needs a shim) and rope/spring joints are version-
          gated. Not yet a phased refactor; no schema/prompt landing.
        </li>
        <li>
          <strong>PHYSICS_GRAPHS.md (v1)</strong> — the canonical graph observables{' '}
          (<code>G1…G11</code>) every archetype's definition-of-done points at, built
          on five reading moves (slope / area / intercept / flatness / linearization)
          and two harness modes (time-series + parameter-sweep).
        </li>
        <li>
          <strong>BENCHMARK_SIMS.md (v1)</strong> — the acceptance suite{' '}
          (<code>B1…B17</code>): external reference sims (PhET, Physics Classroom,
          Algodoo…) each with a <em>frozen natural-language prompt</em> and an A–E
          rubric. Meta-metric: time-to-working-sim from the teacher prompt.
        </li>
      </ul>
      <p>
        All four state they <strong>&ldquo;Feed CLAUDE.md&rdquo;</strong> — which
        the repo still lacks; the intent is to synthesize them into one. These are
        the <em>what &amp; why</em> layer; the refactor notes remain the{' '}
        <em>how it lands</em> layer (schema + prompt + adapter — the three-places
        rule). Nothing in the roadmap is LLM-authorable yet. <em>This map does not
        yet render these as Mermaid tracks — a follow-up once a joints phase plan and
        the first benchmark runs exist.</em>
      </p>

      <h2>Source documents</h2>

      <h3>Curriculum &amp; benchmark roadmap (.md, repo root — topics-driven)</h3>
      <ul>
        <li><code>PHYSICS_SHAPES.md</code> — collider archetypes (S-IDs), 5 concavity rungs</li>
        <li><code>PHYSICS_JOINTS_CONSTRAINTS.md</code> — joint archetypes (J-IDs), the new joints workstream</li>
        <li><code>PHYSICS_GRAPHS.md</code> — canonical graph observables (G-IDs) + 5 reading moves</li>
        <li><code>BENCHMARK_SIMS.md</code> — external acceptance suite (B-IDs), frozen prompts, A–E rubric</li>
      </ul>

      <h3>Physics refactor proposals (.md, repo root)</h3>
      <ul>
        <li><code>Notes_on_Air_Resistance_Refactor.md</code></li>
        <li><code>Notes_on_Applied_Forces_Refactor.md</code></li>
        <li><code>Notes_on_Vector_Representation_Refactor.md</code></li>
        <li><code>Notes_on_Concave_Colliders_Refactor.md</code></li>
      </ul>

      <h3>Visualization &amp; runtime refactor proposals (in-app docs)</h3>
      <ul>
        <li>
          <a href="/docs/vector-arrows">6. Vector arrows</a> — 7 arrow kinds,
          theme module, 8 SVG test scenes, Phase 1a/b/c-rev shipped (1c-rev also = REC R0).
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
