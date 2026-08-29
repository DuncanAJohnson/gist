import DocsLayout from './DocsLayout';
import MermaidDiagram from '../../components/MermaidDiagram';

// ============================================================================
// Mermaid charts
// ============================================================================

const recordingLifecycleChart = `
flowchart LR
  CONFIG["SimulationConfig<br/>(authored JSON)"]
  CONTROLS["Control values<br/>(slider positions<br/>at run time)"]
  CONFIG --> RUN
  CONTROLS --> RUN
  RUN["Precompute + replay<br/>(physics runs once)"]
  RUN --> FRAMES["Frame[] — physics movie<br/>(rich per-tier schema)"]
  FRAMES --> REC
  CONFIG --> REC
  CONTROLS --> REC
  META["metadata<br/>(label, timestamp,<br/>tier, runId)"] --> REC
  REC["Recording<br/>(sealed artifact)"]
  REC -->|save| STORE["Supabase /<br/>IndexedDB /<br/>JSON file"]
  STORE -->|load| LIB["Recording library<br/>(student's lab notebook)"]
  LIB -->|select 1 or N| RPLAY["Sealed replay<br/>(no physics re-run)"]

  classDef src fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  classDef proc fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef store fill:#dcfce7,stroke:#16a34a,color:#166534;
  class CONFIG,CONTROLS,META src;
  class RUN,FRAMES,RPLAY proc;
  class REC,STORE,LIB store;
`;

const compareModeChart = `
flowchart TB
  R1["Recording 1<br/>(m_ball = 5 kg)"]
  R2["Recording 2<br/>(m_ball = 1 kg)"]
  R3["Recording 3<br/>(m_ball = 10 kg)"]
  R1 --> CAM
  R2 --> CAM
  R3 --> CAM
  CAM["Active camera<br/>(default: lab frame)"]
  CAM --> MODE{"Compare display"}
  MODE -->|"ghost overlay"| GO["One canvas:<br/>run 1 opaque,<br/>runs 2-3 translucent"]
  MODE -->|"split screen"| SS["N canvases,<br/>sync-scrubbed time"]
  MODE -->|"graph overlay"| GR["One canvas (focus run);<br/>graphs overlay all runs"]

  classDef rec fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  classDef cam fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef out fill:#dcfce7,stroke:#16a34a,color:#166534;
  class R1,R2,R3 rec;
  class CAM,MODE cam;
  class GO,SS,GR out;
`;

const cameraTransformChart = `
flowchart LR
  FRAME["Frame i<br/>(lab-frame data:<br/>pos, vel, accel, ...)"]
  FRAME --> CAM["Active camera"]
  CAM --> KIND{Camera kind}
  KIND -->|"lab (default)"| IDENT["Identity:<br/>p' = p<br/>v' = v"]
  KIND -->|"attached-to-body"| ATT["Galilean:<br/>p' = p − p_body<br/>v' = v − v_body"]
  KIND -->|"tilt-with-surface"| ROT["Rotation:<br/>p' = R#40;θ#41; · p<br/>v' = R#40;θ#41; · v"]
  KIND -->|"contact-pair"| CON["Center on contact;<br/>align with normal;<br/>zero CoM motion"]
  IDENT --> OUT["Transformed data →<br/>VectorArrow + sprite"]
  ATT --> OUT
  ROT --> OUT
  CON --> OUT

  classDef in fill:#dbeafe,stroke:#2563eb,color:#1e40af;
  classDef trans fill:#fef3c7,stroke:#d97706,color:#92400e;
  classDef out fill:#dcfce7,stroke:#16a34a,color:#166534;
  class FRAME in;
  class CAM,KIND,IDENT,ATT,ROT,CON trans;
  class OUT out;
`;

// ============================================================================
// Page
// ============================================================================

function RecordingsAndCameras() {
  return (
    <DocsLayout
      title="7. Recordings & cameras"
      subtitle="What becomes possible when replay is a sealed artifact: saved experimental runs, side-by-side comparison, and reference-frame cameras as a single composable abstraction."
    >
      <p>
        This doc lives downstream of an architectural shift introduced in{' '}
        <a href="/docs/vector-arrows">6. Vector arrows</a> (Phase 1c): all derived
        physics quantities are computed during precompute and stored in the per-frame
        recording, never re-derived during replay. Replay does no physics — only
        geometric transformations on pre-computed data. That separation of concerns
        unlocks two capabilities that are this doc's subject.
      </p>

      <h2>The architectural foundation</h2>
      <p>
        The runtime loop ({' '}
        <a href="/docs/runtime-loop">3. Runtime loop</a>) used to put derived state
        — finite-differenced acceleration, applied force, contact normal — onto a
        body's <code>userData</code> field, which the visual layer then read. The
        bug class that surfaced (Phase 1b → 1c diagnosis): <code>userData</code>{' '}
        doesn't ride the snapshot. So during replay, whatever was last written to
        userData persisted unchanged across every visible frame. F<sub>net</sub>{' '}
        arrows blinked during precompute and vanished during replay.
      </p>
      <p>
        The fix is to move derived state into the <code>Frame</code> schema itself,
        captured at the same instant the physics-engine snapshot is taken. Replay
        becomes: <em>"read frame i, write its contents back to body and metadata,
          paint."</em> No physics, no engine call, no live calculations of anything
        a vector kind cares about.
      </p>
      <p>
        Once that's true, the contents of <code>Frame[]</code> are a sealed
        deterministic artifact. Same recording in → same visualization out. That
        invariant is what makes everything below possible.
      </p>

      <h2>Recordings — sealed experimental runs</h2>

      <h3>The Recording type</h3>
      <p>
        A run of a sim becomes a self-contained artifact:
      </p>
      <pre className="bg-gray-100 rounded p-4 text-xs overflow-x-auto">{`type Recording = {
  version: 1,
  config: SimulationConfig,          // the original authored JSON
  controlValues: Record<string, number>,  // student's slider settings at run time
  frames: Frame[],                   // the physics movie
  metadata: {
    runId: string,
    label?: string,                  // student-supplied ("Run 1: light feather")
    timestamp: number,
    duration: number,
    tier: 'kinematics' | 'dynamics' | 'momentum',
    // Physics provenance — which engine build actually produced these frames.
    // Frames are sealed away from the engine, so without this a run is not
    // self-describing. Added at R1 by design: see "Physics provenance" below.
    engine: 'rapier' | 'planck',
    engineVersion: string,           // e.g. '0.19.3' — the npm package version
  },
}`}</pre>
      <p>
        Three observations on the design:
      </p>
      <ul>
        <li>
          <strong>controlValues are part of the artifact, not the config.</strong>{' '}
          The authored config carries default slider values; the recording captures
          the dialed-in values the student actually used. Same config, different
          values, different recording. That's the whole experimental-run notion.
        </li>
        <li>
          <strong>tier determines the Frame schema.</strong> Kinematics tier saves
          position + velocity + acceleration (linear and rotational). Dynamics adds
          force components. Momentum adds linear + angular momentum. Each tier is
          a strict superset of the previous so a momentum-tier recording can render
          any kinematics-tier visualization for free. See{' '}
          <a href="/docs/vector-arrows">vector arrows</a> for the per-kind dependency
          table.
        </li>
        <li>
          <strong>Plain JSON throughout.</strong> A 60-second / 2-body / kinematics-tier
          recording is roughly 30–50 KB. Dynamics tier maybe doubles that. Send a
          file, paste a string, save a row in Supabase. The recording is its own
          provenance.
        </li>
      </ul>

      <h3>Lifecycle</h3>
      <MermaidDiagram
        chart={recordingLifecycleChart}
        caption="Config + controls + recorded frames + metadata bundle into one Recording. From there it's plain data — save, load, share, replay."
      />

      <h3>The lab-notebook UX</h3>
      <p>
        This is the pedagogical payoff. A student running the bowling-ball-and-feather
        sim today gets one run, period. With recordings:
      </p>
      <ol>
        <li>Set mass slider to 1 kg, press play → <em>Run 1 captured.</em></li>
        <li>Set mass slider to 5 kg, press play → <em>Run 2 captured.</em></li>
        <li>Set mass slider to 10 kg, press play → <em>Run 3 captured.</em></li>
        <li>Open the recording library. Label runs, organize, annotate.</li>
        <li>
          Pick three runs, hit "Compare." Watch the family of outcomes side-by-side
          or overlaid as ghosts.
        </li>
      </ol>
      <p>
        That's how physics is actually taught — vary one parameter, observe the
        family of behaviors, infer the law. The recording infrastructure makes the
        sim a virtual lab apparatus instead of a one-shot demo.
      </p>

      <h3>Save: auto vs. explicit</h3>
      <p>
        Two reasonable defaults, both worth considering:
      </p>
      <ul>
        <li>
          <strong>Auto-save every run.</strong> Every press-play creates a recording,
          time-stamped, in the student's library. Pro: nothing is lost, no friction.
          Con: library fills with throwaway runs; needs a cleanup/pin/delete UX.
        </li>
        <li>
          <strong>Explicit save button.</strong> Student presses play → run replays
          → they decide to "Save this run" with a label. Pro: clean library; students
          curate. Con: lose interesting runs they didn't realize were interesting
          until they tried the next thing.
        </li>
      </ul>
      <p>
        Probably the right answer is auto-save with a "Pin" affordance, plus a
        soft auto-delete of unpinned recordings after some threshold (a session,
        a day, a count). Like Strava activities + favorites.
      </p>

      <h3>Compare mode</h3>
      <MermaidDiagram
        chart={compareModeChart}
        caption="Three runs selected from the library, fed through the active camera, surfaced in one of three display modes. Same data; the display mode is purely UI."
      />
      <p>
        Three display modes, each suited to a different question:
      </p>
      <ul>
        <li>
          <strong>Ghost overlay</strong> — all selected runs in one canvas. Focus
          run opaque, others translucent. Best when bodies start at the same
          position and the question is "how does the trajectory differ?" (Mass
          dropped from same height, varying drag.)
        </li>
        <li>
          <strong>Split-screen</strong> — N canvases, time-synced. Best when bodies
          start at <em>different</em> positions across runs (e.g., comparing three
          different ramp angles) — overlay would visually collide.
        </li>
        <li>
          <strong>Graph overlay only</strong> — single canvas plays one focus run;
          graphs at the bottom overlay all selected runs' data lines. Best for
          quantitative comparison without visual clutter.
        </li>
      </ul>
      <p>
        Same Recording[] array drives all three modes. Switching is a UI control,
        not a re-render of physics. The compare-mode prototype could ship with one
        mode and add the others incrementally.
      </p>

      <h2>Cameras — viewer reference frames</h2>

      <h3>The math</h3>
      <p>
        A reference frame is defined by an origin (a point or another body),
        a velocity (the frame's motion in the lab frame), and an orientation
        (a rotation). Transforming lab-frame data into the frame is straightforward
        linear algebra:
      </p>
      <pre className="bg-gray-100 rounded p-4 text-xs overflow-x-auto">{`p' = R · (p - p_origin)        // position in frame
v' = R · (v - v_origin)        // velocity in frame
a' = R · (a - a_origin)        // acceleration in frame (inertial frames only)

For non-inertial (e.g., rotating) frames, pseudo-force terms enter the
acceleration transform: centrifugal, Coriolis, Euler. Out of scope for
the initial camera set.`}</pre>
      <p>
        Because recordings carry lab-frame pos, vel, accel as raw data, a camera
        is just a function from (recording, frame index) → transformed display
        data. Pure geometry, no physics. Lives entirely in the replay/render layer.
      </p>
      <MermaidDiagram
        chart={cameraTransformChart}
        caption="The camera abstraction. Each kind is a different transform applied to lab-frame frame data; the output drives the same VectorArrow and sprite-rendering code. Adding new cameras = adding new transforms."
      />

      <h3>Three pedagogical unlocks</h3>
      <p>
        Reference-frame physics is half the intro mechanics curriculum, and almost
        none of it is expressible in current sims without changing the simulation.
        Cameras change that — the sim runs once in the lab frame; pedagogy is in
        the view.
      </p>
      <ol>
        <li>
          <strong>Relative motion in kinematics.</strong> Camera "attached to car A"
          → car B's velocity displays as <code>v_B − v_A</code>. The boats-in-rivers,
          person-on-train, two-trains-approaching family of problems. Currently
          inexpressible; with cameras it's a UI dropdown over the same recording.
        </li>
        <li>
          <strong>Inclined-plane decomposition.</strong> Camera "tilt with the ramp"
          → gravity decomposes naturally into along-ramp and perpendicular components.
          Same data, rotated view. The whole "ramp-aware analytical force decomposition"
          question we wrestled with in the applied-forces refactor goes away —
          engine-read forces in lab frame + ramp rotation in the camera = correct
          arrows on any geometry. Could even show two cameras side-by-side: lab
          frame (gravity straight down) and ramp frame (gravity decomposed). Both
          correct; both teach.
        </li>
        <li>
          <strong>Newton's 3rd Law contact pairs.</strong> Camera "center on contact
          point, align with contact normal, zero center-of-mass motion" → the
          reaction and action arrows on the two bodies become collinear,
          equal-magnitude, opposite-direction. Without this camera, lab-frame
          rendering shows two arrows that happen to satisfy <em>F_AB = −F_BA</em>{' '}
          but visually drift apart as the bodies move. The contact camera makes
          the symmetry impossible to miss.
        </li>
      </ol>

      <h3>Possible future cameras</h3>
      <ul>
        <li>
          <strong>Orbital camera</strong> (attached to planet, looking at moon).
          Two-body problems become visual instantly.
        </li>
        <li>
          <strong>Rotating reference frame</strong> (spinning carousel, Earth's
          rotation). Introduces Coriolis pseudo-force — needs the non-inertial
          transform terms above.
        </li>
        <li>
          <strong>Free-fall camera</strong> (attached to a freely-falling body).
          Einstein's elevator. Gravity "disappears" in this frame — equivalence
          principle made literal.
        </li>
      </ul>

      <h2>How they compose</h2>
      <p>
        Recordings and cameras are orthogonal. A camera is a transform; a recording
        is data. They compose without ceremony:
      </p>
      <ul>
        <li>
          <strong>Compare three recordings in one camera.</strong> "Drop the bowling
          ball from three different heights, viewed in the lab frame, overlaid as
          ghosts." Useful for parameter-sweep studies.
        </li>
        <li>
          <strong>One recording, two cameras side-by-side.</strong> "Watch the
          ramp-tilt block in both the lab frame and the ramp frame." Different
          views of the same physics, simultaneously.
        </li>
        <li>
          <strong>Compose cameras.</strong> "Camera attached to body A, then rotated
          to body A's contact normal." Free-body diagrams on a moving inclined
          plane. Stacks of transforms commute or not depending on the order; the
          math is well-understood but worth thinking through carefully.
        </li>
      </ul>
      <p>
        Cross-recording caveat: a camera that depends on a specific body (e.g.,
        "attached to bowling_ball") only works on recordings whose config includes
        that body. The library UI should disable incompatible camera options when
        comparing recordings with different object sets.
      </p>

      <h2>Phasing</h2>
      <p>
        Two independent tracks. The Recording track has the simpler kickoff;
        cameras can wait.
      </p>

      <h3>Recording track</h3>
      <ul>
        <li>
          <strong>R0 — kinematics-tier Frame schema. <em>SHIPPED 2026-05-15.</em></strong>{' '}
          Extended <code>FrameBodySnap</code> to include linear and rotational velocity
          and acceleration. Same code change as Phase 1c-rev in the vector-arrows doc —
          one landing unblocked both tracks. Recordings can now carry the derived
          state every downstream tier extension and visualization mode depends on.
        </li>
        <li>
          <strong>R1 — Recording type + local autosave.</strong> Define the type,
          wrap precompute completion in a "create Recording" step, persist to
          IndexedDB. UX: a tiny "Run 1 saved" toast after replay finishes.{' '}
          <strong>Stamp physics provenance here</strong> (<code>engine</code> +{' '}
          <code>engineVersion</code> in <code>metadata</code>) — not later. Once
          recordings are on disk, adding provenance is a migration over artifacts
          that can never be back-filled, because the build that made them is gone.
        </li>
        <li>
          <strong>R2 — Library UI.</strong> Sidebar or modal listing recordings
          for the current sim. Label, pin, delete. Load one to replay.
        </li>
        <li>
          <strong>R3 — Compare mode (one display style).</strong> Pick ghost
          overlay or graph overlay first; the other modes follow. Multi-select
          in the library, "Compare" button, time-synced playback. Compare must
          check <code>engine</code> and <code>engineVersion</code> agreement and{' '}
          <em>label</em> a mismatch — never refuse it. Overlaying two physics
          builds <em>unknowingly</em> is the failure provenance prevents; doing it{' '}
          <em>knowingly</em> is a deliberate instrument (see below), so the UI
          annotates rather than blocks.
        </li>
        <li>
          <strong>R4 — Cloud persistence + sharing.</strong> Save recordings to
          Supabase. Share a URL → recipient loads it. Teacher-grade pedagogy:
          assign a sim, students submit their best recording, teacher compares
          submissions in compare-mode.
        </li>
        <li>
          <strong>R5 — Dynamics tier.</strong> Extend Frame schema with force
          components. Light up the dynamics-tier force kinds in vector arrows.
        </li>
        <li>
          <strong>R6 — Momentum tier.</strong> Add linear + angular momentum.
        </li>
        <li>
          <strong>R-future — Energy tier.</strong> Work integrals and frame-dependent
          PE make this thornier than the others. Defer until the use case forces it.
        </li>
      </ul>

      <h3>Camera track</h3>
      <ul>
        <li>
          <strong>C0 — formalize the lab-frame camera.</strong> Define the camera
          abstraction (a transform function), implement identity, route all
          vector-arrow and sprite rendering through it. No visible change; sets
          the architecture.
        </li>
        <li>
          <strong>C1 — attached-to-body camera.</strong> First non-trivial camera.
          Unlocks relative-motion kinematics. Simple Galilean subtraction.
        </li>
        <li>
          <strong>C2 — tilt-with-surface camera.</strong> Rotation-only transform.
          Unlocks inclined-plane decomposition. Pairs naturally with the dynamics
          tier (R5).
        </li>
        <li>
          <strong>C3 — contact-pair camera.</strong> Most complex of the initial
          set. Needs contact data in the dynamics-tier frame (engine-read normal
          + tangent). Unlocks Newton's 3rd Law visualization.
        </li>
        <li>
          <strong>C-future — non-inertial cameras.</strong> Rotating reference
          frames with pseudo-force visualization. Free-fall (equivalence principle).
          Significant math investment; high pedagogical payoff if pursued.
        </li>
      </ul>

      <h2>Open questions</h2>
      <ul>
        <li>
          <strong>Autosave vs explicit save.</strong> Lean: auto-save with pin/delete
          affordances. The friction of "did you save?" is the wrong friction for
          a virtual lab.
        </li>
        <li>
          <strong>Where do recordings live by default?</strong> IndexedDB (local,
          private, no network) is the right default for student-facing runs. Supabase
          for sharing/submission. Both can coexist with sync.
        </li>
        <li>
          <strong>Recording schema versioning.</strong> Add <code>version: 1</code>{' '}
          from day one. Migrations for added fields are usually trivial (default
          new fields to null). Migrations for changed semantics need a real plan.
        </li>
        <li>
          <strong>Physics provenance — what to do on a version mismatch?</strong>{' '}
          The fields land at R1; the <em>policy</em> is open. A recording replays
          frames without touching the engine, so a run captured under one engine
          build and reloaded under another is silently a different experiment —
          and the frame cache cannot help, since it is in-memory and dies with the
          component (invariant #13 is correctly scoped to runtime-mutable inputs,
          so engine version deliberately does <em>not</em> join its key). Options
          on mismatch: annotate the run quietly, warn on load, warn only when
          comparing, or refuse to overlay. <strong>Lean: annotate always, warn on
          compare, never refuse</strong> — a stale recording is still a real
          observation, and hiding it teaches worse than labelling it.{' '}
          <strong>"Never refuse" is now load-bearing, not just a preference.</strong>{' '}
          A pre-upgrade and a post-upgrade recording of the same config and the
          same <code>controlValues</code> differ <em>only</em> by the engine build,
          which makes a cross-version overlay the sharpest available measurement of
          what an engine upgrade actually changed — CCD trajectory shifts, solver
          differences, sleeping behaviour. Recordings are therefore not merely{' '}
          <em>exposed</em> to engine upgrades; they are how we <em>assess</em> them,
          and a policy that blocked mismatched overlays would destroy that
          instrument. Sequencing agreed 2026-08-26: R1 ships before the Rapier
          bump, so the upgrade lands as a legible discontinuity in the recording
          history. See{' '}
          <code>Notes_on_Engine_Upgrades_Refactor.md</code> → "Sequencing
          dependency".
        </li>
        <li>
          <strong>Compare-mode time alignment.</strong> Different control values
          can produce different sim durations. Pad shorter runs with their final
          state, or stop early, or scale-warp? Lean: pad with final state (the body
          sits where it ended), with a visual indicator that the run has finished.
        </li>
        <li>
          <strong>Cross-config comparison.</strong> Two recordings of <em>different</em>{' '}
          configs (different objects, different gravity, different units) — can
          they meaningfully compare? Probably not in ghost overlay, possibly in
          graph overlay if axes match. Lean: gate compare mode behind "same config
          ID"; cross-config is a future power-user feature.
        </li>
        <li>
          <strong>Recording size on long sims.</strong> An hour at 60 fps × 4 bodies
          × dynamics tier is maybe 30 MB. Mostly fine; flag for compression
          (delta-encoding, downsampling) if it becomes a problem.
        </li>
        <li>
          <strong>Camera UI.</strong> Persistent toolbar? Modal selector? Per-canvas
          dropdown? Lean: dropdown above each canvas; default is lab; explicit
          switch action. The camera is a property of the view, not the recording —
          worth making that distinction visible.
        </li>
        <li>
          <strong>Composing transforms.</strong> "Camera B then rotation by θ" —
          the math is fine but the UX is non-obvious. Lean: don't expose composition
          in v1; pick from a flat list of named cameras. Composition is a future
          power-user affordance.
        </li>
      </ul>

      <h2>What this reorganizes</h2>
      <ul>
        <li>
          <strong>The "ramp-aware analytical decomposition" question from the
            applied-forces refactor</strong> dissolves: engine-read forces in lab
          frame + a ramp-tilt camera = correct decomposition on any geometry. The
          applied-forces refactor's Phase 4 (engine-read contact forces) is no
          longer "optional future" — it's the natural data source for the dynamics
          tier.
        </li>
        <li>
          <strong>The seek-during-replay caveat in vector arrows Phase 1c</strong>{' '}
          disappears: seek reads frame[N] directly; no finite differences across
          non-sequential frames.
        </li>
        <li>
          <strong>The vector-rep refactor's polar projections</strong> become a
          pure replay-time transform — already aligned with this architecture.
        </li>
        <li>
          <strong>The diorama model's "left wall" (standard UI)</strong> gets a
          new occupant: the recording library and compare-mode controls. The "back
          wall" gets a new occupant too: the per-diorama tier schema. The diorama
          is now a triple — floor (unit) + walls (UI / engine) + the tier definition
          that connects them.
        </li>
      </ul>
    </DocsLayout>
  );
}

export default RecordingsAndCameras;
