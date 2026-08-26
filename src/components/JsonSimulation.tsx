import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import BaseSimulation, { type SimulationControls as BaseSimulationControls, CANVAS_HEIGHT, WALL_THICKNESS, SIMULATION_WIDTH, SIMULATION_HEIGHT } from './BaseSimulation';
import type { PhysicsAdapter, PhysicsBody, Vec2 } from '../physics/types';
import SimulationControls, { type PrecomputeState, type PrecomputeProgress } from './simulation_components/SimulationControls';
import Environment from './simulation_components/Environment';
import Panel from './simulation_components/Panel';
import ScaleSlider from './simulation_components/ScaleSlider';
import SimulationHeader from './simulation_components/SimulationHeader';
import JsonEditor from './JsonEditor';
import AdvancedDebugPanel from './simulation_components/AdvancedDebugPanel';
import type { PhysicsEngineKind } from '../physics';
import { resolveEngine } from '../config/engines';
import { createSimulation, updateChangesMade } from '../lib/simulationService';
import type { UnitType, AngleUnit } from '../lib/unitConversion';
import { UNIT_ABBREV, unitToMeters, scaleObjectToSI, unitScaleFor, angleUnitToRadians, isPolarVector } from '../lib/unitConversion';
import { WorldToCanvas } from '../lib/worldToCanvas';
import { resolveVectorKind } from '../lib/vectorSources';
import { VECTOR_KINDS, type VectorKind } from './simulation_components/renderables/vectorTheme';
// Controls
import ControlRenderer from './simulation_components/controls/ControlRenderer';
import type { ControlConfig, ToggleConfig, SliderConfig } from './simulation_components/controls/types';
// Graphs
import GraphRenderer from './simulation_components/graphs/GraphRenderer';
import type { GraphConfig, LineConfig, DataPoint } from './simulation_components/graphs/types';
// Objects
import ObjectRenderer from './simulation_components/objects/ObjectRenderer';
import type { ObjectConfig } from './simulation_components/objects/types';
// Outputs
import { OutputGroup } from './simulation_components/Output';
import type { OutputGroupConfig } from '../schemas/simulation';
// Data Download
import DataDownload from './simulation_components/DataDownload';
// Experimental Data
import ExperimentalDataModal, { type ExperimentalDataConfig, type ModalFormState, DEFAULT_MODAL_FORM_STATE } from './simulation_components/ExperimentalDataModal';
// Debug "Import Object" (test SVG-generator exports in a live sim)
import ImportObjectModal, { type ImportCandidate, type ImportControlPreset } from './simulation_components/ImportObjectModal';
import { registerImportedRenderable, MANIFEST_VIEWBOX } from '../lib/renderableManifest';
import {
  expandObjects,
  applyEditCommitToObject,
  applyRampControlOverrides,
  checkFrictionSliderMasking,
  checkForceControlTarget,
  type RampControlParam,
} from '../lib/objectExpansion';
import { clearDiagnostics } from '../lib/diagnosticsBus';
import { dedupeObjectIds } from '../lib/objectIdGuard';
// Render Layer
import RenderLayer from './simulation_components/renderables/RenderLayer';
// Edit overlay + unsaved-changes indicator
import EditOverlay from './simulation_components/EditOverlay';
import InfoBoxes from './simulation_components/InfoBoxes';
import { sameInfoTarget, type InfoAnchor, type InfoTarget } from '../lib/infoTargets';
import UnsavedChangesIndicator from './simulation_components/UnsavedChangesIndicator';
import type { ObjectEditCommit } from '../lib/editGeometry';
import {
  synthesizeWallRenderables,
  synthesizeBodyRenderable,
  synthesizeColliderDebugRenderable,
  synthesizeVectorArrowRenderables,
  synthesizeForceDebugRenderables,
  synthesizeForceLoupeRenderable,
  synthesizeExperimentalRenderable,
  synthesizeGridRenderable,
  buildExperimentalDataResolver,
} from './simulation_components/renderables/synthesize';
import type { PixelRenderable, DataPositionResolver } from './simulation_components/renderables/types';

// Collider observation overlay: draws every body's engine-truth collider
// geometry — the decomposed compound, for concave manifest colliders — with
// per-part colors and vertex counts, so SVG + manifest data from the generator
// can be vetted by eye before dev decisions. Scoped in
// Notes_on_Concave_Colliders_Refactor.md (2026-07-02). Toggled live via the
// debug-panel checkbox; `?colliders=1` (same pattern as `?simdebug=1`) sets
// the initial state so a link can open straight into observation mode.
const COLLIDER_DEBUG_INITIAL =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('colliders');

// Force-vector observation overlay (Goal-1 FBD step 2). Draws the data-ready
// FBD force kinds (gravity, drag, net) on every dynamic body, independent of
// authored showVectors — the debug instrument for eyeballing forces on any sim.
// Toggled live via the debug panel; `?forces=1` (same pattern as `?colliders=1`)
// sets the initial state.
const FORCE_DEBUG_INITIAL =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('forces');

// Force loupe (PROTOTYPE, Goal-1 FBD). A disclosed per-body force rescale for
// bodies whose WHOLE free-body diagram is under the render floor (the feather
// in bowlingBallAndFeather: 0.098 N → 0.2 px at the shared 2 px/N). Drawn only
// while PAUSED — playing is the qualitative read (stubs say "a force is here"),
// paused is the quantitative one — and live under scrub, since the draw reads
// body.userData which handleReplayFrame rewrites per frame. The draw function
// self-gates on the trigger. Scoped in Notes_on_Applied_Forces_Refactor.md
// (Findings 2026-08-08); design views in /docs/vector-arrows.
const LOUPE_DEBUG_INITIAL =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('loupe');

export interface SimulationConfig {
  title?: string;
  description?: string;
  environment: {
    walls: string[];
    gravity?: number;
    unit?: UnitType;
    angleUnit?: AngleUnit;
    pixelsPerUnit?: number;
    physicsEngine?: 'rapier' | 'planck';
    airResistance?: {
      enabled?: boolean;
      airDensity?: number;
    };
  };
  objects?: Array<ObjectConfig>;
  controls?: Array<ControlConfig>;
  outputs?: Array<OutputGroupConfig>;
  graphs?: Array<GraphConfig>;
}

interface JsonSimulationProps {
  config: SimulationConfig;
  simulationId?: number;
  /**
   * When true (and there's no `simulationId`), surface the "Tweak Simulation
   * JSON" button and apply edits to the live config locally — re-initializing
   * the sim in place — instead of persisting to the backend. Used by local
   * example sims for fast in-browser iteration (e.g. Phase-0 cup tests).
   */
  localJsonEdit?: boolean;
}

type SimulationControls = BaseSimulationControls;

// Per-body kinematic state captured each precompute frame and restored each
// replay frame. The kinematic fields (vx, vy, omega, ax, ay, alpha) ride the
// Frame so derived visuals (vector arrows, graphs bound to acceleration) see
// fresh state during replay without re-deriving from stale userData. Phase
// 1c-rev of the vector-arrows refactor; see /docs/vector-arrows.
type FrameBodySnap = {
  id: string;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  omega: number;
  ax: number;
  ay: number;
  alpha: number;
  // Per-frame drag force (−k·|v|·v), captured so the `force-drag` arrow renders
  // in REPLAY. Like ax/ay, this lives on userData (not engine state), so it must
  // ride along in the Frame or replay reads a stale/zero value (Goal-1 FBD
  // step 2, 2026-07-24). Zero when air resistance is off.
  dragFx: number;
  dragFy: number;
  // Per-frame engine-read contact forces (Goal-1 FBD step 3, 2026-08-06):
  // adapter getContactForces() readback stashed on userData each frame. Same
  // standing gotcha as drag — userData-sourced arrows MUST ride the Frame or
  // they vanish in replay. Zero when the body is free (or asleep).
  normalFx: number;
  normalFy: number;
  fricFx: number;
  fricFy: number;
  // Per-frame DEBUG applied force in Newtons (Goal-2 Phase 1, 2026-08-09).
  // Same standing rule again: userData-sourced arrows must ride the Frame or
  // `force-applied` is invisible in replay. Zero unless the debug-panel force
  // dropdown is set and this is its target body.
  appFx: number;
  appFy: number;
};

type Frame = {
  bodies: FrameBodySnap[];
  outputValues: Record<string, number>;
  graphPoints: DataPoint[];
};

// Resolve the {x, y} of a vector base path for reading. Acceleration is the
// finite-difference on userData, not a body field.
const getVectorComponents = (
  obj: any,
  base: string,
  gravity: Vec2,
): { x: number; y: number } | undefined => {
  let v: any;
  // FORCE KINDS are readable by the same name they are drawn by — `force-net`,
  // `force-friction`, `force-normal`, `force-drag`, `force-gravity`,
  // `force-applied` — and route through the SAME resolver the arrows use, so a
  // readout and its arrow cannot disagree (see src/lib/vectorSources.ts).
  // READ-ONLY: setNestedValue rejects writes to these paths.
  //
  // Wired 2026-08-14 because the LLM emitted `force-net.x` in four of four sims
  // on the applied-forces drive. It was not disobeying the enumerated path list;
  // it generalized from a capability surface where force kinds were drawable but
  // silently unreadable. Closing the asymmetry was cheaper — and far more
  // reliable at the small-model tier — than adding a prohibition.
  if (VECTOR_KINDS.includes(base as any)) {
    if (!obj) return undefined;
    v = resolveVectorKind(obj as PhysicsBody, base as VectorKind, gravity);
  } else if (base === 'acceleration') {
    v = obj?.userData?.derivedAcceleration;
  } else if (base === 'appliedForce') {
    // Read the RESOLVED force (authored + control + debug), which is what the
    // physics consumed and what the `force-applied` arrow draws — so a numeric
    // readout and its arrow can never disagree. Writes go to
    // `configuredAppliedForce` instead; see setNestedValue. Kept alongside the
    // `force-applied` alias above: this is the AUTHORED field's name, and the
    // only one of the two that a slider may write.
    v = obj?.userData?.appliedForce;
  } else {
    v = base.split('.').reduce((current: any, key) => current?.[key], obj);
  }
  return v && typeof v.x === 'number' && typeof v.y === 'number' ? { x: v.x, y: v.y } : undefined;
};

const getNestedValue = (obj: any, path: string, gravity: Vec2): any => {
  // Polar projections of any vector base: "<base>.magnitude" / "<base>.angle".
  // Magnitude is SI (e.g. m/s); angle is returned in RADIANS (SI), measured
  // counter-clockwise from +X. The display boundary (readDisplayValue) then
  // converts angle to the env angleUnit — no degree math lives here.
  if (path.endsWith('.magnitude') || path.endsWith('.angle')) {
    const base = path.slice(0, path.lastIndexOf('.'));
    const vec = getVectorComponents(obj, base, gravity);
    if (!vec) return undefined;
    return path.endsWith('.magnitude')
      ? Math.hypot(vec.x, vec.y)
      : Math.atan2(vec.y, vec.x);
  }
  // Force kinds by component: "force-net.x", "force-friction.y", … The polar
  // projections above already route here via getVectorComponents.
  const dot = path.indexOf('.');
  if (dot > 0 && VECTOR_KINDS.includes(path.slice(0, dot) as any)) {
    const vec = getVectorComponents(obj, path.slice(0, dot), gravity);
    const axis = path.slice(dot + 1);
    return axis === 'x' || axis === 'y' ? vec?.[axis] : undefined;
  }
  // Redirect acceleration.* to the finite-difference stored on userData.
  if (path.startsWith('acceleration.')) {
    const axis = path.slice('acceleration.'.length);
    const derived = obj?.userData?.derivedAcceleration;
    return derived?.[axis];
  }
  // Redirect appliedForce.* to the resolved per-frame force (see
  // getVectorComponents for why reads and writes target different fields).
  if (path.startsWith('appliedForce.')) {
    const axis = path.slice('appliedForce.'.length);
    return (obj?.userData?.appliedForce as any)?.[axis];
  }
  return path.split('.').reduce((current, key) => current?.[key], obj);
};

/**
 * Fold the configured applied force (+ the debug-panel force, superposed) into
 * userData.appliedForce — the ONE value the solver (handlePreStep), the
 * force-applied arrow and the appliedForce.* / force-applied.* readouts all read
 * (invariant #14's one-site rule). handleUpdate calls this every step; the
 * slider write paths call it too, so the arrow tracks a force slider LIVE
 * before play, the way a velocity arrow tracks a velocity slider (2026-08-26,
 * Bill). Static bodies carry no force, matching handlePreStep's skip.
 * Module-level and ref-fed so the slider writers stay dependency-free.
 */
function resolveAppliedForce(body: PhysicsBody, debugForceN: number, debugTargetId: string | null): void {
  const cfgForce = body.userData.configuredAppliedForce as Vec2 | undefined;
  const debugFx = !body.isStatic && body.id === debugTargetId ? debugForceN : 0;
  body.userData.appliedForce = body.isStatic
    ? { x: 0, y: 0 }
    : { x: (cfgForce?.x ?? 0) + debugFx, y: cfgForce?.y ?? 0 };
}

function JsonSimulation({ config, simulationId, localJsonEdit }: JsonSimulationProps) {
  const navigate = useNavigate();

  // editedConfig is the source of truth for everything downstream — direct
  // manipulation edits (move/resize via EditOverlay) write to this state.
  // Resync from `config` only when simulationId changes (i.e. after navigation
  // to a different simulation), not on every prop change, so in-flight edits
  // aren't clobbered by upstream re-renders.
  const [editedConfig, setEditedConfig] = useState<SimulationConfig>(config);
  useEffect(() => {
    setEditedConfig(config);
    setSelectedObjectId(null);
    setHasUnsavedChanges(false);
    setSimAtInitialConditions(true);
    // Air-resistance mode is JSON-authoritative per sim: navigating to a new
    // sim resets the toggle to whatever the new sim's environment declares.
    // Within a single sim, the user's debug-panel override persists until
    // they navigate away or reset.
    setAirResistanceMode(config.environment.airResistance?.enabled ? 'quadratic' : 'off');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationId]);

  const {
    title,
    description,
    environment,
    objects = [],
    controls = [],
    outputs = [],
    graphs = [],
  } = editedConfig;

  // Config-declared zoom. The slider's session-local state initializes from
  // here on mount and resets back to it on "Reset". Mutating the slider does
  // NOT write back to the JSON — saved sims keep their authored zoom.
  const configPixelsPerUnit = environment.pixelsPerUnit ?? 10;
  const [pixelsPerUnit, setPixelsPerUnit] = useState<number>(configPixelsPerUnit);
  const gravityMagnitude = environment.gravity ?? 9.8;

  // SI cutover: config values are declared in `environment.unit`. Convert all
  // dimensional values (lengths, velocities, accelerations, gravity) to SI
  // meters at this boundary — everything below runs pure SI. The render layer
  // uses `pixelsPerMeter` so user-set `pixelsPerUnit` still behaves as
  // "pixels per user unit" for the scale slider, the grid, and overlays.
  const unitScale = useMemo(() => unitToMeters(environment.unit ?? 'm'), [environment.unit]);
  // Angle-family display scale (radians per env.angleUnit), the angular
  // counterpart of `unitScale`. Used by `unitScaleFor` so polar ".angle"
  // bindings convert with the angle unit, never the length unit.
  const angleScale = useMemo(() => angleUnitToRadians(environment.angleUnit ?? 'deg'), [environment.angleUnit]);
  const pixelsPerMeter = pixelsPerUnit / unitScale;
  // Physics walls and the visual wall renderables are anchored to the JSON-
  // declared scale, NOT the slider. Otherwise zooming would silently move
  // collision boundaries. The slider only changes how SI projects to canvas
  // pixels (via the live pixelsPerMeter in WorldToCanvas), so at higher zoom
  // the walls render off-canvas and objects can travel beyond the visible
  // edge while still being inside the simulated play area.
  const configPixelsPerMeter = configPixelsPerUnit / unitScale;
  // Pure render-side factor: how much bigger the visible canvas is than the
  // JSON-declared canvas. zoomFactor = 1 at default zoom, > 1 when zoomed in.
  // Drives the scaled canvas dimensions in BaseSimulation/RenderLayer so the
  // wider play area is reachable via scrollbars.
  const zoomFactor = pixelsPerUnit / configPixelsPerUnit;
  const siGravityMagnitude = gravityMagnitude * unitScale;
  const gravityVec: Vec2 = useMemo(() => ({ x: 0, y: -siGravityMagnitude }), [siGravityMagnitude]);

  // Container expansion — the JSON-authoring seam for open containers
  // (concave-colliders Phase 4). Objects carrying a `container` field get
  // their sprite + concave collider synthesized (session-side registration)
  // and width/height/svg (+ grounded y) derived here; ordinary objects pass
  // through. Pure derived layer: NEVER written back to editedConfig, so
  // saves round-trip the compact `container` field and reload re-expands.
  // Must precede scaleObjectToSI (which requires width/height/svg). Render-
  // time on purpose — registration must precede ObjectRenderer mount; the
  // module's signature cache makes re-renders and StrictMode no-ops.
  // Control values (declared ahead of the expansion memo — ramp-dimension
  // sliders feed the seam as param overrides, so expansion depends on them).
  const [controlValues, setControlValues] = useState<Record<string, number>>(() => {
    const initialValues: Record<string, number> = {};
    controls.forEach((control) => {
      if (control.type === 'slider') {
        initialValues[control.label] = (control as SliderConfig).defaultValue;
      } else if (control.type === 'toggle') {
        initialValues[control.label] = (control as ToggleConfig).defaultValue ? 1 : 0;
      }
    });
    return initialValues;
  });

  // Ramp-dimension slider overrides ("ramp.angle" / ".rise" / ".run" /
  // ".slopeLength" property paths): collected here and applied to the
  // authored params AHEAD of expansion — these sliders never touch a physics
  // body; re-expansion re-synthesizes the triangle and re-seats riders. The
  // slider value is in config units / env angleUnit, exactly like the
  // authored param it replaces.
  const rampOverrides = useMemo(() => {
    const out: Record<string, Partial<Record<RampControlParam, number>>> = {};
    controls.forEach((c) => {
      if (c.type !== 'slider' || !c.property?.startsWith('ramp.')) return;
      const param = c.property.slice('ramp.'.length) as RampControlParam;
      if (!['angle', 'rise', 'run', 'slopeLength'].includes(param)) return;
      const v = controlValues[c.label];
      if (typeof v !== 'number') return;
      (out[c.targetObj] ??= {})[param] = v;
    });
    return out;
  }, [controls, controlValues]);

  const expandedObjects = useMemo(() => {
    // Re-expansion = a new config generation: clear the seam diagnostics bus
    // so the debug-panel badge reflects THIS config, not a fixed (or newly
    // broken) predecessor — first live specimen: baseball swapped to
    // cannonball via Tweak JSON kept its stale over-cap pill until reload
    // (2026-07-20). Every load-time producer downstream re-reports: the
    // container checks run per-call (see containerExpansion), and the CC2
    // over-cap warn re-fires when the body rebuild re-decomposes colliders
    // after this render.
    clearDiagnostics();
    // Duplicate-id BACKSTOP before expansion: the commit boundaries
    // (JsonEditor save, CreateSimulation paste) reject duplicate ids
    // outright, so this only fires for configs that arrive broken from
    // elsewhere (legacy DB rows, pre-guard saves). Later duplicates are
    // renamed (first wins, bus-badged — live truth: THIS loaded config
    // carries duplicates) so such sims render best-effort instead of
    // white-paging on the adapter's (correct) duplicate-id throw. Derived-
    // only, like the expansion itself — never written back to editedConfig.
    const expanded = expandObjects(
      applyRampControlOverrides(dedupeObjectIds(objects), rampOverrides),
      {
        sceneMin: Math.min(SIMULATION_WIDTH, SIMULATION_HEIGHT) / configPixelsPerUnit,
        hasBottomWall: (environment.walls ?? []).includes('bottom'),
        angleScale,
        airResistanceEnabled: environment.airResistance?.enabled === true,
      },
    );
    // Controls-aware authoring check — lives here rather than inside the seam
    // because expandObjects takes objects, not controls. Runs INSIDE the
    // cleared window above so it re-reports on every re-expansion, like every
    // other producer.
    checkFrictionSliderMasking(expanded, controls);
    checkForceControlTarget(expanded, controls);
    return expanded;
  }, [
    objects,
    controls,
    configPixelsPerUnit,
    environment.walls,
    angleScale,
    rampOverrides,
    environment.airResistance?.enabled,
  ]);

  // Dynamic bodies eligible as debug-force targets. Derived from the expanded
  // config (not objRefs) so the dropdown is populated before the first run.
  const forceTargetOptions = useMemo(
    () => expandedObjects.filter((o) => !o.isStatic).map((o) => o.id),
    [expandedObjects],
  );

  const siObjects = useMemo(
    () => expandedObjects.map((obj) => scaleObjectToSI(obj, unitScale, angleScale)),
    [expandedObjects, unitScale, angleScale],
  );

  const [showJsonEditor, setShowJsonEditor] = useState(false);

  // Cosmetic graph-paper grid behind the simulation. Session-local; on by
  // default. Doesn't affect the bake cache, so toggling mid-replay is safe.
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // Debug "Import Object" modal (SVG-generator export testing)
  const [showImportObjectModal, setShowImportObjectModal] = useState(false);

  // Collider observation overlay. Session-local like showGrid; doesn't affect
  // the bake cache, so toggling mid-replay is safe.
  const [showColliders, setShowColliders] = useState<boolean>(COLLIDER_DEBUG_INITIAL);

  // Force-vector observation overlay. Session-local like showColliders; doesn't
  // affect the bake cache, so toggling mid-replay is safe.
  const [showForces, setShowForces] = useState<boolean>(FORCE_DEBUG_INITIAL);

  // Force loupe. Session-local like showForces; drawn only when paused.
  const [showLoupe, setShowLoupe] = useState<boolean>(LOUPE_DEBUG_INITIAL);

  // Experimental data overlay state
  const [showExperimentalModal, setShowExperimentalModal] = useState(false);
  const [experimentalData, setExperimentalData] = useState<ExperimentalDataConfig | null>(null);
  const [pickingPosition, setPickingPosition] = useState(false);
  const [pickedPosition, setPickedPosition] = useState<{ x: number; y: number } | null>(null);
  const [modalFormState, setModalFormState] = useState<ModalFormState>(DEFAULT_MODAL_FORM_STATE);
  const simulationTimeRef = useRef(0);
  const [canvasContainer, setCanvasContainer] = useState<HTMLDivElement | null>(null);

  // Compose renderables in SI — every object emits one SVG renderable from
  // its `svg` field, plus walls, vector arrows, and any experimental overlay.
  // Declared above pixelRenderables because the force-loupe renderable is
  // paused-only and therefore reads isRunning inside that memo.
  const [isRunning, setIsRunning] = useState(false);

  const pixelRenderables = useMemo<PixelRenderable[]>(() => {
    // Sprites take SI dimensions: the drawer scales visual.width/height via
    // WorldToCanvas.dimension (m → px), so config-unit values would render
    // wrong for any unit but meters.
    const sprites = siObjects.map(synthesizeBodyRenderable);
    const vectorArrows = expandedObjects.flatMap(synthesizeVectorArrowRenderables);
    const walls = synthesizeWallRenderables(environment.walls ?? [], configPixelsPerMeter);
    const experimental = experimentalData
      ? [synthesizeExperimentalRenderable(experimentalData)]
      : [];
    // Grid uses the user-unit pixelsPerUnit (not pixelsPerMeter) so labels
    // read in the sim's configured unit. zIndex (-20) sorts it under walls.
    const grid = showGrid
      ? [synthesizeGridRenderable(pixelsPerUnit, UNIT_ABBREV[environment.unit ?? 'm'], zoomFactor)]
      : [];
    const colliderOutlines = showColliders
      ? expandedObjects.map(synthesizeColliderDebugRenderable)
      : [];
    const forceArrows = showForces
      ? expandedObjects.flatMap(synthesizeForceDebugRenderables)
      : [];
    // Paused-only: an FBD is inherently a single-instant object, and while
    // playing the sub-floor stubs already carry the qualitative signal.
    const loupes = showLoupe && !isRunning
      ? expandedObjects.flatMap(synthesizeForceLoupeRenderable)
      : [];
    return [...grid, ...walls, ...sprites, ...vectorArrows, ...forceArrows, ...experimental, ...colliderOutlines, ...loupes].sort(
      (a, b) => a.zIndex - b.zIndex
    );
  }, [expandedObjects, siObjects, environment.walls, environment.unit, experimentalData, configPixelsPerMeter, pixelsPerUnit, showGrid, showColliders, showForces, showLoupe, isRunning, zoomFactor]);

  const dataSources = useMemo<Record<string, DataPositionResolver>>(() => {
    const sources: Record<string, DataPositionResolver> = {};
    const resolver = experimentalData
      ? buildExperimentalDataResolver(experimentalData, unitScale)
      : null;
    if (resolver) sources.experimental = resolver;
    return sources;
  }, [experimentalData, unitScale]);

  // Refs to all physics bodies by config id (SI PhysicsBody).
  const objRefs = useRef<Record<string, PhysicsBody>>({});

  // Finite-difference state for derivedAcceleration.
  const prevVelocitiesRef = useRef<Record<string, { x: number; y: number }>>({});
  // Property paths already warned about, so a misconfigured output doesn't log
  // on every frame. Per-sim (a ref, not a module Set) so switching sims gives
  // the next one's problems a fresh voice.
  const warnedPathsRef = useRef<Set<string>>(new Set());
  const prevAngularVelocitiesRef = useRef<Record<string, number>>({});
  const prevTimeRef = useRef<number>(0);

  // Deferred initial-snapshot recapture flag — armed by any path whose
  // seam-derived result differs from its raw input (edit commits, ramp
  // sliders, object add/remove); fired by the [siObjects] effect after the
  // ObjectRenderers rebuild bodies. Declared up here because both
  // handleControlChange and commitObjectEdit arm it.
  const pendingRecaptureRef = useRef(false);

  // State for output values
  const [outputValues, setOutputValues] = useState<Record<string, number>>({});

  // State for simulation controls
  const [simulationControls, setSimulationControls] = useState<SimulationControls | null>(null);
  const simulationControlsRef = useRef<SimulationControls | null>(null);

  // Click-to-edit state. Edits are drafts: they update editedConfig and physics
  // bodies, but don't persist until the user clicks Save now in the indicator.
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // True while every body still sits where the JSON put it — i.e. the sim has
  // not been advanced since it was last returned to its authored start pose.
  // Three ways in (load, Reset, navigating to another sim), exactly one way
  // out: pressing Play. Pausing and scrubbing do NOT restore it — the bodies
  // are still displaced, they just aren't moving. While false we lock object
  // editing, so edits always apply to the authored initial state rather than
  // to wherever physics happened to leave a body.
  //
  // NOT to be confused with `hasUnsavedChanges` above: that tracks edits to
  // the CONFIG awaiting a save; this tracks displacement of the BODIES.
  // (Renamed from `simIsDirty` 2026-08-09 — "dirty" read as the save sense.)
  const [simAtInitialConditions, setSimAtInitialConditions] = useState(true);

  // Popup shown when the user clicks an object while editing is locked. Stores
  // viewport coords so the bubble can be positioned next to the click.
  const [resetPromptAt, setResetPromptAt] = useState<{ x: number; y: number } | null>(null);
  // ⇧-click object info (InfoBoxes, 2026-08-26). Pins are the boxes the user
  // has clicked (max 2 — a pair); infoHover is the transient second target
  // while ⇧ is held; infoHint is the ⇧ⓘ affordance on plain hover.
  const [infoPins, setInfoPins] = useState<InfoAnchor[]>([]);
  const [infoHover, setInfoHover] = useState<InfoAnchor | null>(null);
  const [infoHint, setInfoHint] = useState<{ x: number; y: number } | null>(null);
  const infoPinsRef = useRef(infoPins);
  infoPinsRef.current = infoPins;
  const handleInfoHover = useCallback(
    (target: InfoTarget | null, x: number, y: number, shiftHeld: boolean) => {
      const pins = infoPinsRef.current;
      if (!target) {
        setInfoHint(null);
        setInfoHover(null);
      } else if (pins.length === 0) {
        setInfoHint({ x, y });
        setInfoHover(null);
      } else if (pins.length === 1 && shiftHeld && !sameInfoTarget(pins[0].target, target)) {
        setInfoHint(null);
        setInfoHover({ target, x, y });
      } else {
        setInfoHint(null);
        setInfoHover(null);
      }
    },
    [],
  );
  const handleInfoPin = useCallback((target: InfoTarget, x: number, y: number) => {
    setInfoHover(null);
    setInfoHint(null);
    setInfoPins((pins) => {
      if (pins.length === 0) return [{ target, x, y }];
      if (pins.length === 1 && !sameInfoTarget(pins[0].target, target)) return [pins[0], { target, x, y }];
      // Re-clicking the pinned body, or a third target: start over from here.
      return [{ target, x, y }];
    });
  }, []);
  const handleInfoClear = useCallback(() => {
    setInfoPins((pins) => (pins.length === 0 ? pins : []));
    setInfoHover(null);
  }, []);
  // Esc dismisses; releasing ⇧ drops the transient hover box (a pin survives).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleInfoClear();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setInfoHover(null);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleInfoClear]);
  // Drop pins that point at objects that no longer exist.
  useEffect(() => {
    setInfoPins((pins) =>
      pins.every((p) => {
        const t = p.target;
        return t.kind === 'wall' || expandedObjects.some((o) => o.id === t.id);
      })
        ? pins
        : [],
    );
  }, [expandedObjects]);

  // Session-local engine override. Resets on reload — the config's
  // environment.physicsEngine is always the starting point. Both the override
  // and the config value are routed through resolveEngine so a disabled engine
  // (per src/config/engines.ts) falls back to DEFAULT_ENGINE.
  const [engineOverride, setEngineOverride] = useState<PhysicsEngineKind | null>(null);
  const activeEngine: PhysicsEngineKind = resolveEngine(
    engineOverride ?? environment.physicsEngine,
  );

  const [precomputeTimestepHz, setPrecomputeTimestepHz] = useState<number>(480);
  // DEBUG applied force (Goal-2 Phase 1, 2026-08-09) — debug-panel only, no
  // schema, no prompt. Discrete signed values (a dropdown, like solver iters)
  // rather than a slider: a continuous control rewrites the frame-cache key on
  // every drag tick, and the two-engine acceptance test needs the SAME force on
  // both engines, not approximately-the-same-slider-position.
  const [debugForceN, setDebugForceN] = useState<number>(0);
  const [debugForceTargetId, setDebugForceTargetId] = useState<string>('');

  // Constraint-solver iteration count; mapped per-engine in the adapters.
  // 8 matches Planck's velocityIterations default and is a reasonable bump
  // over Rapier's default of 4 for the high-restitution scenes Gist tends
  // to render.
  const [solverIterations, setSolverIterations] = useState<number>(8);
  // Planck-only second knob; Rapier ignores it. 3 matches Planck's default.
  const [positionIterations, setPositionIterations] = useState<number>(3);

  // Air-resistance debug toggle. 'off' leaves bodies undamped
  // (setLinearDamping(0)); 'quadratic' drives `setLinearDamping((k/m)·|v|)`
  // per frame to mimic mass-dependent quadratic drag, where
  // k = ½·airDensity·(Cd·A) per body. Seeded from environment.airResistance
  // at config load; user can override via the debug panel for A/B testing.
  // See Notes_on_Air_Resistance_Refactor.md "Design rationale" for the
  // diorama-scoped linear-A formulation.
  type AirResistanceMode = 'off' | 'quadratic';
  const [airResistanceMode, setAirResistanceMode] = useState<AirResistanceMode>(
    () => (environment.airResistance?.enabled ? 'quadratic' : 'off'),
  );
  // Ref so handleUpdate (useCallback) reads the current mode without rebinding
  // on every toggle — same pattern as isRunningRef.
  const debugForceRef = useRef(debugForceN);
  const debugForceTargetRef = useRef(debugForceTargetId);
  const airResistanceModeRef = useRef<AirResistanceMode>(airResistanceMode);
  useEffect(() => { airResistanceModeRef.current = airResistanceMode; }, [airResistanceMode]);
  useEffect(() => { debugForceRef.current = debugForceN; }, [debugForceN]);
  useEffect(() => { debugForceTargetRef.current = debugForceTargetId; }, [debugForceTargetId]);

  // Air density (kg/m³) for the per-frame compute. Default Earth sea level.
  // Held as a ref so handleUpdate doesn't rebind when the JSON's density
  // changes (rare, but future-proof).
  const airDensityRef = useRef<number>(environment.airResistance?.airDensity ?? 1.225);
  useEffect(() => {
    airDensityRef.current = environment.airResistance?.airDensity ?? 1.225;
  }, [environment.airResistance?.airDensity]);

  const [maxDuration, setMaxDuration] = useState<number>(10);

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [replayFrameIndex, setReplayFrameIndex] = useState<number>(0);
  const [replayTotalFrames, setReplayTotalFrames] = useState<number>(0);

  const [graphData, setGraphData] = useState<DataPoint[][]>(() => graphs.map(() => []));
  const isRunningRef = useRef(isRunning);

  // Pre-compute / replay state
  const [precomputeState, setPrecomputeState] = useState<PrecomputeState>('idle');
  const [precomputeProgress, setPrecomputeProgress] = useState<PrecomputeProgress | null>(null);
  const jsonModeRef = useRef<'idle' | 'precomputing' | 'replay'>('idle');
  const frameCacheRef = useRef<{ key: string; frames: Frame[] } | null>(null);
  const recordingBufferRef = useRef<Frame[] | null>(null);
  const replayCursorRef = useRef<number>(0);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  const handleControlsReady = useCallback((controls: SimulationControls) => {
    setSimulationControls(controls);
    simulationControlsRef.current = controls;
  }, []);

  // Replay callback: apply a recorded frame to bodies/outputs/graphs.
  // When `options.seek` is true, rebuild the graph history from frames[0..frameIndex]
  // so scrubbing backward doesn't leave stale trailing points.
  const handleReplayFrame = useCallback((frameIndex: number, options?: { seek?: boolean }) => {
    const cache = frameCacheRef.current;
    if (!cache || frameIndex >= cache.frames.length) return;
    const frames = cache.frames;
    const frame = frames[frameIndex];

    frame.bodies.forEach((snap) => {
      const body = objRefs.current[snap.id];
      if (body) {
        // position/velocity are Vec2Accessors over engine state — mutate .x/.y
        // rather than reassigning, so writes propagate to the underlying engine.
        body.position.x = snap.x;
        body.position.y = snap.y;
        body.angle = snap.angle;
        body.velocity.x = snap.vx;
        body.velocity.y = snap.vy;
        body.angularVelocity = snap.omega;
        body.userData.derivedAcceleration = { x: snap.ax, y: snap.ay };
        body.userData.derivedAngularAcceleration = snap.alpha;
        // Restore per-frame drag so the force-drag arrow animates in replay
        // (see FrameBodySnap.dragFx note).
        body.userData.dragForce = { x: snap.dragFx, y: snap.dragFy };
        // Same for the engine-read contact forces (FrameBodySnap.normalFx note).
        body.userData.normalForce = { x: snap.normalFx, y: snap.normalFy };
        body.userData.frictionForce = { x: snap.fricFx, y: snap.fricFy };
        body.userData.appliedForce = { x: snap.appFx, y: snap.appFy };
      }
    });

    setOutputValues(frame.outputValues);
    setReplayFrameIndex(frameIndex);
    if (options?.seek || frameIndex === 0) {
      setGraphData(
        graphs.map((_, gi) =>
          frames.slice(0, frameIndex + 1).map((f) => f.graphPoints[gi])
        )
      );
    } else {
      setGraphData((prev) =>
        prev.map((arr, i) => [...arr, frame.graphPoints[i]])
      );
    }
    simulationTimeRef.current = (frameIndex + 1) / 60;
    replayCursorRef.current = frameIndex + 1;

    if (frameIndex + 1 >= frames.length) {
      setIsRunning(false);
    }
  }, [graphs]);

  // Per-vector "held" polar state (angle in radians, magnitude in SI), keyed by
  // `${targetObj}.${base}` (e.g. "ball.velocity"). Lets a magnitude slider keep
  // direction when dialed to zero, and lets a paired magnitude+angle slider on
  // the same vector share one direction. UI-state, not physics-state.
  const heldVectorStateRef = useRef<Record<string, { angle: number; magnitude: number }>>({});
  // Below this magnitude a vector has no usable direction (atan2(0,0) is
  // undefined), so we fall back to held state instead of reading it.
  const POLAR_EPS = 1e-9;

  // Seed held polar state from polar-AUTHORED vectors, so an authored direction
  // with zero magnitude ({magnitude: 0, angle: 60}) isn't lost when
  // normalization produces {x: 0, y: 0}: the first magnitude-slider drag
  // launches along the authored angle. Non-degenerate vectors refresh held
  // state on every polar write, so this seed only decides the degenerate case.
  //
  // Covers EVERY polar-authorable vector (2026-08-13): velocity, acceleration,
  // and appliedForce. Missing one is a live bug, not a nicety — author
  // `appliedForce: {magnitude: 0, angle: 30}` with a strength slider at 0 and
  // the first drag would push HORIZONTALLY instead of along the authored 30°.
  // All three scale their magnitude by the length unit (force carries a length
  // dimension too), so one loop serves them.
  useEffect(() => {
    const POLAR_BASES = ['velocity', 'acceleration', 'appliedForce'] as const;
    expandedObjects.forEach((obj) => {
      for (const base of POLAR_BASES) {
        const v = obj[base];
        if (v && isPolarVector(v)) {
          heldVectorStateRef.current[`${obj.id}.${base}`] = {
            angle: v.angle * angleScale,
            magnitude: Math.max(0, v.magnitude) * unitScale,
          };
        }
      }
    });
  }, [expandedObjects, unitScale, angleScale]);

  // Load-time authoring check (a seed of the future ingestion boundary — see
  // parking_lot.md): a ".magnitude" slider authored with min < 0 can't behave
  // as authored, because magnitude writes clamp at 0.
  useEffect(() => {
    controls.forEach((c) => {
      if (c.type === 'slider' && c.property?.endsWith('.magnitude') && c.min < 0) {
        console.warn(
          `Slider "${c.label}" binds "${c.property}" with min ${c.min} < 0 — ` +
          'magnitude is ≥ 0 by definition, so the negative part of the range clamps to 0. Author min ≥ 0.',
        );
      }
    });
  }, [controls]);

  // Read a property for display (outputs/graphs). Physics bodies store SI
  // values — divide by unitScale for dimensional properties so UI labels in
  // the config's `unit` stay consistent.
  //
  // Returns NaN for paths that don't resolve to a number — e.g. a config with
  // `property: "velocity"` (no axis) would otherwise hand back a Vec2Accessor
  // instance, which crashes React when rendered. Callers should treat NaN as
  // missing data.
  const readDisplayValue = useCallback((obj: any, path: string): number => {
    const raw = getNestedValue(obj, path, gravityVec);
    if (typeof raw !== 'number') {
      // Warn for EVERY unresolved path, including the undefined case — which is
      // the common one (a property name that simply does not exist) and was the
      // one this guard used to skip. That silence is how four sims shipped
      // `force-net.x` readouts nobody noticed (2026-08-14).
      //
      // The dedupe the old comment promised but never implemented: warn once per
      // unique path, or a bad property logs on every frame of every run.
      if (!warnedPathsRef.current.has(path)) {
        warnedPathsRef.current.add(path);
        console.warn(
          `readDisplayValue: path "${path}" did not resolve to a number ` +
          `(${raw === undefined ? 'undefined — no such property' : typeof raw}). ` +
          `Outputs will show '—' and graphs will gap. ` +
          `Did the property omit an axis suffix ("velocity" instead of "velocity.y"), ` +
          `or name something that doesn't exist?`,
        );
      }
      return NaN;
    }
    return raw / unitScaleFor(path, unitScale, angleScale);
  }, [unitScale, angleScale, gravityVec]);

  const setNestedValue = (obj: any, path: string, value: any): void => {
    // FORCE KINDS ARE READ-ONLY. They became readable as property paths on
    // 2026-08-14, which put them within reach of a slider — and a slider bound
    // to e.g. "force-net.x" would otherwise reach the generic branch below and
    // THROW on `target[lastKey] = value` (target is undefined). Reject loudly
    // instead. They are read-only by physics, not by policy: `force-net` is
    // DERIVED from measured motion (invariant #14) and the contact forces are
    // read back out of the solver, so there is nothing to write. To make a
    // force a student can change, author `appliedForce` and bind the slider to
    // "appliedForce.*" — that is the one force path with a writable source.
    const forceBase = path.slice(0, path.indexOf('.'));
    if (forceBase && VECTOR_KINDS.includes(forceBase as any)) {
      console.warn(
        `setNestedValue: "${path}" is READ-ONLY — ${forceBase} is measured, not set. ` +
          `Bind the control to "appliedForce.x" / "appliedForce.magnitude" instead.`,
      );
      return;
    }
    // Acceleration isn't a native PhysicsBody field — it's a per-body config
    // applied each step by handleUpdate via velocity integration. Route writes
    // to userData.configuredAcceleration so sliders targeting "acceleration.x"
    // take effect on the next physics step.
    if (path.startsWith('acceleration.')) {
      const axis = path.slice('acceleration.'.length);
      if (!obj?.userData) return;
      if (!obj.userData.configuredAcceleration) {
        obj.userData.configuredAcceleration = { x: 0, y: 0 };
      }
      obj.userData.configuredAcceleration[axis] = value;
      return;
    }
    // Same story for applied force: not a native PhysicsBody field. Writes land
    // on the CONFIGURED value; handleUpdate folds it (plus any debug force)
    // into userData.appliedForce, which is what the solver and every display
    // consumer read.
    if (path.startsWith('appliedForce.')) {
      const axis = path.slice('appliedForce.'.length);
      if (!obj?.userData) return;
      if (!obj.userData.configuredAppliedForce) {
        obj.userData.configuredAppliedForce = { x: 0, y: 0 };
      }
      obj.userData.configuredAppliedForce[axis] = value;
      resolveAppliedForce(obj, debugForceRef.current, debugForceTargetRef.current);
      return;
    }
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => current[key], obj);
    target[lastKey] = value;
  };

  // Write a polar component (SI: magnitude in m/s, angle in radians) to a vector
  // field, preserving the orthogonal component via the per-vector held state
  // keyed by `key` (`${targetObj}.${base}`).
  const writeVectorPolar = (
    obj: any,
    key: string,
    base: string,
    kind: 'magnitude' | 'angle',
    value: number,
  ): void => {
    // Resolve the writable {x, y} target. Acceleration routes to the configured-
    // acceleration userData (same redirect as setNestedValue); other bases are
    // the body's Vec2Accessor, whose x/y setters route through the adapter.
    let target: { x: number; y: number } | undefined;
    if (base === 'acceleration') {
      if (!obj?.userData) return;
      if (!obj.userData.configuredAcceleration) {
        obj.userData.configuredAcceleration = { x: 0, y: 0 };
      }
      target = obj.userData.configuredAcceleration;
    } else if (base === 'appliedForce') {
      if (!obj?.userData) return;
      if (!obj.userData.configuredAppliedForce) {
        obj.userData.configuredAppliedForce = { x: 0, y: 0 };
      }
      target = obj.userData.configuredAppliedForce;
    } else {
      target = base.split('.').reduce((current: any, k) => current?.[k], obj);
    }
    if (!target) return;

    const curMag = Math.hypot(target.x, target.y);
    const held = heldVectorStateRef.current[key] ?? { angle: 0, magnitude: 0 };
    // Refresh held direction/magnitude from the live vector whenever it's
    // non-degenerate, so dialing magnitude to 0 and back is lossless and a
    // paired angle slider rotates the current speed.
    if (curMag > POLAR_EPS) {
      held.angle = Math.atan2(target.y, target.x);
      held.magnitude = curMag;
    }
    if (kind === 'magnitude') {
      const m = Math.max(0, value);
      target.x = m * Math.cos(held.angle);
      target.y = m * Math.sin(held.angle);
      held.magnitude = m;
    } else {
      target.x = held.magnitude * Math.cos(value);
      target.y = held.magnitude * Math.sin(value);
      held.angle = value;
    }
    heldVectorStateRef.current[key] = held;
    if (base === 'appliedForce') resolveAppliedForce(obj, debugForceRef.current, debugForceTargetRef.current);
  };

  const clampToZero = (value: number): number => {
    return Math.abs(value) < 0.01 ? 0 : value;
  };

  // Handle control changes — SI everywhere, Vec2Accessor routes writes through
  // the adapter for velocity/position.
  // The body-write half of a slider change, shared by live drags
  // (handleControlChange) and the post-rebuild re-application below. Never
  // called for ramp.* paths (those are expansion params, not body state).
  const applyControlToBody = useCallback((control: typeof controls[0], value: number) => {
    const obj = objRefs.current[control.targetObj];
    if (!obj || !control.property) return;
    const siValue = value * unitScaleFor(control.property, unitScale, angleScale);
    if (control.property.endsWith('.magnitude') || control.property.endsWith('.angle')) {
      const base = control.property.slice(0, control.property.lastIndexOf('.'));
      const kind = control.property.endsWith('.angle') ? 'angle' : 'magnitude';
      writeVectorPolar(obj, `${control.targetObj}.${base}`, base, kind, siValue);
    } else {
      setNestedValue(obj, control.property, siValue);
    }
  }, [unitScale, angleScale]);

  const handleControlChange = useCallback((control: typeof controls[0], value: number) => {
    setControlValues((prev) => ({
      ...prev,
      [control.label]: value,
    }));

    // Ramp-dimension sliders never write to a body — the value flows into
    // the expansion seam as a param override (rampOverrides memo above), and
    // re-expansion rebuilds the triangle + re-seats riders. Arm the deferred
    // recapture so the next Play starts from the rebuilt geometry.
    if (control.property?.startsWith('ramp.')) {
      pendingRecaptureRef.current = true;
      return;
    }

    applyControlToBody(control, value);
  }, [applyControlToBody]);

  // Per-ENGINE-STEP hook (Goal-2 Phase 1). Delivers the debug applied force on
  // the engine's own cadence, exactly the way gravity is delivered: once per
  // adapter.step(), converted with THAT step's dt.
  //
  // J = F · dt_of_the_next_step. Converting over the LOGICAL frame dt and
  // handing the result to a 1/480 s step dumps eight steps' worth of tangential
  // impulse into one step's friction budget — measured breakaway collapsed to
  // 6 N against a true 19.6 N, and a crate crept 36 mm in 5 s at half of
  // breakaway. Per-step delivery restores breakaway to ~3% and the creep to
  // 0.3 mm. (Solver iterations are a different axis entirely and do not fix
  // it: 1 → 32 iterations leaves the wrong number unchanged.)
  //
  // Reads the Newton value stashed by handleUpdate rather than the ref, so the
  // engine and the `force-applied` arrow cannot disagree.
  const handlePreStep = useCallback((_adapter: PhysicsAdapter, dtSeconds: number) => {
    if (jsonModeRef.current === 'replay') return;
    // Every body may carry a force now that `appliedForce` is authorable — the
    // Phase 1 shortcut of visiting only the debug target would silently drop
    // authored forces. Reads the resolved Newton value handleUpdate stashed,
    // never the debug ref, so the engine and the arrow cannot disagree.
    for (const id in objRefs.current) {
      const body = objRefs.current[id];
      if (!body || body.isStatic) continue;
      const F = body.userData.appliedForce as Vec2 | undefined;
      if (!F || (F.x === 0 && F.y === 0)) continue;
      body.applyImpulse({ x: F.x * dtSeconds, y: F.y * dtSeconds });
    }
  }, []);

  // Update loop: compute finite-difference acceleration, collect outputs, graphs.
  const handleUpdate = useCallback((_adapter: PhysicsAdapter, time: number) => {
    if (jsonModeRef.current === 'replay') return;

    const isRecording = jsonModeRef.current === 'precomputing';

    const deltaTime = time - prevTimeRef.current;
    const airMode = airResistanceModeRef.current;
    if (deltaTime > 0) {
      expandedObjects.forEach((objectConfig) => {
        const body = objRefs.current[objectConfig.id];
        if (!body) return;

        // Apply the body's configured constant acceleration via velocity
        // integration. Works uniformly across Matter/Rapier/Planck because
        // the Vec2Accessor setter routes through each engine's setVelocity,
        // which also wakes sleeping bodies when the new velocity is non-zero.
        const cfgAccel = body.userData.configuredAcceleration as
          | { x: number; y: number }
          | undefined;
        if (cfgAccel && !body.isStatic && (cfgAccel.x !== 0 || cfgAccel.y !== 0)) {
          body.velocity.x = body.velocity.x + cfgAccel.x * deltaTime;
          body.velocity.y = body.velocity.y + cfgAccel.y * deltaTime;
        }

        // Air-resistance compute. We approximate quadratic, mass-dependent
        // drag (a = -(k/m)·|v|·v) by writing a per-frame linearDamping value
        // of (k/m)·|v|, which the engine then applies through its
        // substep-correct, unconditionally-stable damping integrator
        // (v / (1 + damping·dt)). |v| is held constant within a frame's
        // substeps — fine for educational sims at 60 Hz.
        //
        // k = ½ · airDensity · dragCdA, with dragCdA = Cd · A stored on the
        // body at create time by ObjectRenderer. Factoring density apart
        // lets it vary at runtime (Mars sim, vacuum sim, etc.) without
        // recomputing per-body coefficients.
        //
        // Also writes userData.dragForce = -k·|v|·v for the vector-arrow
        // refactor's `force-drag` kind (read at render time; populates
        // automatically when this loop runs).
        //
        // When mode = 'off', clear damping (setLinearDamping(0)) so flipping
        // active → inactive doesn't strand the body in its last computed
        // damping value.
        if (!body.isStatic) {
          if (airMode === 'quadratic') {
            const dragCdA = (body.userData.dragCdA as number | undefined) ?? 0;
            const m = body.mass;
            if (dragCdA > 0 && m > 0) {
              const speed = Math.hypot(body.velocity.x, body.velocity.y);
              const k = 0.5 * airDensityRef.current * dragCdA;
              body.setLinearDamping((k / m) * speed);
              // F_drag = -k·|v|·v, written for downstream vector-arrow rendering.
              body.userData.dragForce = {
                x: -k * speed * body.velocity.x,
                y: -k * speed * body.velocity.y,
              };
            } else {
              body.userData.dragForce = { x: 0, y: 0 };
            }
          } else {
            body.setLinearDamping(0);
            body.userData.dragForce = { x: 0, y: 0 };
          }

          // Engine-read contact forces (FBD step 3): the adapter recovers
          // this body's summed normal + friction forces from the most recent
          // step's solver impulses (F = J/dt). Stashed on userData for the
          // force-normal / force-friction arrows; rides the Frame below so
          // replay animates them (the step-2 dragForce lesson).
          const contact = body.getContactForces();
          body.userData.normalForce = contact.normal;
          body.userData.frictionForce = contact.friction;
        }

        // APPLIED FORCE — the SINGLE compute site (invariant #14's drag
        // precedent). Writes Newtons onto userData here, once per logical
        // frame; handlePreStep below reads this same value back and converts
        // it to an impulse per engine step, and the Frame capture below reads
        // it for replay. One number, four consumers (physics, arrow, outputs/
        // graphs, replay), no way for them to drift apart.
        //
        // Two sources SUPERPOSE rather than override: the authored
        // `appliedForce` (Phase 2, SI newtons, also the target of any
        // "appliedForce.*" slider) and the debug-panel force. Superposition is
        // the physically honest combination — two pushes on a crate add — and
        // it keeps the debug harness usable on a sim that already authors a
        // force instead of silently discarding the authored value.
        resolveAppliedForce(body, debugForceRef.current, debugForceTargetRef.current);

        const prevVelocity = prevVelocitiesRef.current[objectConfig.id];
        if (prevVelocity) {
          body.userData.derivedAcceleration = {
            x: (body.velocity.x - prevVelocity.x) / deltaTime,
            y: (body.velocity.y - prevVelocity.y) / deltaTime,
          };
        } else {
          body.userData.derivedAcceleration = { x: 0, y: 0 };
        }

        const prevOmega = prevAngularVelocitiesRef.current[objectConfig.id];
        if (prevOmega !== undefined) {
          body.userData.derivedAngularAcceleration =
            (body.angularVelocity - prevOmega) / deltaTime;
        } else {
          body.userData.derivedAngularAcceleration = 0;
        }

        prevVelocitiesRef.current[objectConfig.id] = { x: body.velocity.x, y: body.velocity.y };
        prevAngularVelocitiesRef.current[objectConfig.id] = body.angularVelocity;
      });
    }
    prevTimeRef.current = time;

    const newOutputValues: Record<string, number> = {};
    outputs.forEach((group) => {
      group.values.forEach((output) => {
        const obj = objRefs.current[output.targetObj];
        if (obj) {
          const key = `${output.targetObj}.${output.property}`;
          newOutputValues[key] = readDisplayValue(obj, output.property);
        }
      });
    });

    if (!isRecording) {
      setOutputValues(newOutputValues);
      simulationTimeRef.current = time;
    }

    const perFrameGraphPoints: DataPoint[] = graphs.map((graph) => {
      const dataPoint: DataPoint = { time };
      if (graph.type === 'line' && graph.lines) {
        graph.lines.forEach((line: LineConfig) => {
          const obj = objRefs.current[line.targetObj];
          if (obj) {
            const value = readDisplayValue(obj, line.property);
            dataPoint[line.label] = clampToZero(value);
          }
        });
      }
      return dataPoint;
    });

    if (graphs.length > 0 && isRunningRef.current && !isRecording) {
      setGraphData((prevData) =>
        prevData.map((data, graphIndex) => [...data, perFrameGraphPoints[graphIndex]])
      );
    }

    if (isRecording && recordingBufferRef.current) {
      const bodies: FrameBodySnap[] = expandedObjects
        .map((objectConfig) => {
          const body = objRefs.current[objectConfig.id];
          if (!body) return null;
          const derived = (body.userData.derivedAcceleration as Vec2 | undefined) ?? { x: 0, y: 0 };
          const alpha = (body.userData.derivedAngularAcceleration as number | undefined) ?? 0;
          const drag = (body.userData.dragForce as Vec2 | undefined) ?? { x: 0, y: 0 };
          const normal = (body.userData.normalForce as Vec2 | undefined) ?? { x: 0, y: 0 };
          const fric = (body.userData.frictionForce as Vec2 | undefined) ?? { x: 0, y: 0 };
          const app = (body.userData.appliedForce as Vec2 | undefined) ?? { x: 0, y: 0 };
          return {
            id: objectConfig.id,
            x: body.position.x,
            y: body.position.y,
            angle: body.angle,
            vx: body.velocity.x,
            vy: body.velocity.y,
            omega: body.angularVelocity,
            ax: derived.x,
            ay: derived.y,
            alpha,
            appFx: app.x,
            appFy: app.y,
            dragFx: drag.x,
            dragFy: drag.y,
            normalFx: normal.x,
            normalFy: normal.y,
            fricFx: fric.x,
            fricFy: fric.y,
          };
        })
        .filter((b): b is FrameBodySnap => b !== null);
      recordingBufferRef.current.push({
        bodies,
        outputValues: newOutputValues,
        graphPoints: perFrameGraphPoints,
      });
    }
  }, [outputs, graphs, expandedObjects, readDisplayValue]);

  // All three save paths (AI remix, JSON tweak, direct-manipulation edits)
  // persist via createSimulation. For a local example sim (localJsonEdit, no
  // simulationId) the new row is a fresh root (parent_id = null); for a DB sim
  // it's a child of the current sim. Either way we navigate to the new
  // /simulation/:id, where the standard DB-backed affordances take over.
  const canPersist = simulationId !== undefined || !!localJsonEdit;

  const handleEdit = async (editedJSON: any, userPrompt: string | null) => {
    if (!canPersist) return;
    try {
      const newSimulationId = await createSimulation(editedJSON, true, simulationId ?? null, userPrompt);
      updateChangesMade(newSimulationId);
      navigate(`/simulation/${newSimulationId}`);
    } catch (error) {
      console.error('Failed to save edited simulation:', error);
      alert('Failed to save edited simulation. Please try again.');
    }
  };

  const handleTweakJSON = () => {
    setShowJsonEditor(true);
  };

  const handleSaveTweakedJSON = async (tweakedJSON: any) => {
    if (!canPersist) return;
    try {
      // Duplicate-id rejection happens upstream in JsonEditor's save
      // validation (like a parse error) — by the time JSON reaches here its
      // ids are unique, so no sanitize pass is needed.
      // Manual JSON edits have no natural-language prompt.
      const newSimulationId = await createSimulation(tweakedJSON, false, simulationId ?? null, null);
      updateChangesMade(newSimulationId);
      setShowJsonEditor(false);
      navigate(`/simulation/${newSimulationId}`);
    } catch (error) {
      console.error('Failed to save tweaked simulation:', error);
      alert('Failed to save tweaked simulation. Please try again.');
    }
  };

  const handlePickPosition = useCallback(() => {
    setShowExperimentalModal(false);
    setPickingPosition(true);
  }, []);

  const handleCanvasClick = useCallback((canvasX: number, canvasY: number) => {
    if (!pickingPosition) return;
    // Click coords arrive in scaled-canvas pixels (scrollLeft/Top already
    // applied by BaseSimulation). Scale the canvas height and wall offset to
    // match so fromPoint inverts correctly.
    const w2c = new WorldToCanvas(
      pixelsPerUnit,
      CANVAS_HEIGHT * zoomFactor,
      WALL_THICKNESS * zoomFactor,
    );
    const userPos = w2c.fromPoint({ x: canvasX, y: canvasY });
    setPickedPosition(userPos);
    setPickingPosition(false);
    setShowExperimentalModal(true);
  }, [pickingPosition, pixelsPerUnit, zoomFactor]);

  const handleCanvasContainerReady = useCallback((container: HTMLDivElement) => {
    setCanvasContainer(container);
  }, []);

  // Wheel + Ctrl/Cmd zooms (and trackpad pinch — browsers synthesize ctrlKey
  // on pinch). Plain wheel falls through to the container's overflow:auto so
  // the user can pan a zoomed canvas with regular scroll. Pinning the world
  // point under the cursor keeps the gesture feeling like "zoom into here"
  // rather than "rescale around the top-left corner".
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);

  // Float accumulator. The visible pixelsPerUnit is integer (slider step = 1),
  // but trackpad pinch sends tiny per-event deltas (deltaY ≈ 2-5) that round
  // to no change every time and never visibly zoom. Accumulating in a float
  // ref lets small deltas eventually cross an integer boundary.
  const floatValueRef = useRef<number>(configPixelsPerUnit);

  // Resync the float accumulator whenever pixelsPerUnit changes by a non-
  // wheel route (slider drag, Reset button, JSON tweak). Keeping the float
  // in sync prevents a stale accumulator from making the next pinch jump
  // back to a previous zoom level.
  useEffect(() => {
    if (Math.round(floatValueRef.current) !== pixelsPerUnit) {
      floatValueRef.current = pixelsPerUnit;
    }
  }, [pixelsPerUnit]);

  useEffect(() => {
    if (!canvasContainer) return;

    // Shared zoom application. multiplier is the ratio to multiply the float
    // accumulator by; cursor coords are container-relative pixels (the
    // visible position of the cursor inside the scrollable wrapper).
    const applyZoom = (
      multiplier: number,
      cursorContainerX: number,
      cursorContainerY: number,
    ) => {
      const cursorCanvasX = cursorContainerX + canvasContainer.scrollLeft;
      const cursorCanvasY = cursorContainerY + canvasContainer.scrollTop;
      setPixelsPerUnit((current) => {
        floatValueRef.current = floatValueRef.current * multiplier;
        // Floor the float at configPixelsPerUnit too, not just the integer
        // result — otherwise repeated zoom-out at the floor would build up a
        // hidden "debt" the user must zoom-in past before anything visible
        // happens.
        if (floatValueRef.current < configPixelsPerUnit) {
          floatValueRef.current = configPixelsPerUnit;
        }
        const next = Math.round(floatValueRef.current);
        if (next === current) return current;
        const ratio = next / current;
        pendingScrollRef.current = {
          left: cursorCanvasX * ratio - cursorContainerX,
          top: cursorCanvasY * ratio - cursorContainerY,
        };
        return next;
      });
    };

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.deltaY === 0) return;
      e.preventDefault();
      const rect = canvasContainer.getBoundingClientRect();
      // 0.9985^deltaY: roughly constant perceptual zoom rate per delta. Tiny
      // trackpad ticks accumulate via the float ref; mouse-notch deltaY≈100
      // moves about 14% per click.
      const multiplier = Math.pow(0.9985, e.deltaY);
      applyZoom(multiplier, e.clientX - rect.left, e.clientY - rect.top);
    };

    // Safari fires its own gesturestart/gesturechange/gestureend for trackpad
    // pinch instead of (or in addition to) wheel events. e.scale is the
    // cumulative pinch ratio since gesturestart, so we track lastScale and
    // apply only the incremental ratio per change event.
    let lastScale = 1;
    let gestureCursorX = 0;
    let gestureCursorY = 0;
    const onGestureStart = (e: Event & { clientX: number; clientY: number; scale?: number }) => {
      e.preventDefault();
      lastScale = 1;
      const rect = canvasContainer.getBoundingClientRect();
      gestureCursorX = e.clientX - rect.left;
      gestureCursorY = e.clientY - rect.top;
    };
    const onGestureChange = (e: Event & { scale?: number }) => {
      e.preventDefault();
      const scale = e.scale ?? 1;
      const multiplier = scale / lastScale;
      lastScale = scale;
      applyZoom(multiplier, gestureCursorX, gestureCursorY);
    };

    // passive:false so we can preventDefault — without it, Ctrl+wheel and
    // gesture events would also trigger the browser's page zoom.
    canvasContainer.addEventListener('wheel', onWheel, { passive: false });
    canvasContainer.addEventListener('gesturestart', onGestureStart as EventListener, { passive: false });
    canvasContainer.addEventListener('gesturechange', onGestureChange as EventListener, { passive: false });
    return () => {
      canvasContainer.removeEventListener('wheel', onWheel);
      canvasContainer.removeEventListener('gesturestart', onGestureStart as EventListener);
      canvasContainer.removeEventListener('gesturechange', onGestureChange as EventListener);
    };
  }, [canvasContainer, configPixelsPerUnit]);

  // Apply the wheel-zoom's "pin cursor" scroll AFTER the canvas has resized
  // (RenderLayer's child effect fires before this parent effect). Setting
  // scrollLeft before the buffer grew would clamp it to the old scroll range.
  useEffect(() => {
    if (!canvasContainer || !pendingScrollRef.current) return;
    canvasContainer.scrollLeft = pendingScrollRef.current.left;
    canvasContainer.scrollTop = pendingScrollRef.current.top;
    pendingScrollRef.current = null;
  }, [pixelsPerUnit, canvasContainer]);

  const handleExperimentalConfirm = useCallback((config: ExperimentalDataConfig) => {
    setExperimentalData(config);
    setShowExperimentalModal(false);
    setPickedPosition(null);
    setModalFormState(DEFAULT_MODAL_FORM_STATE);
  }, []);

  const handleModalFormStateChange = useCallback((update: Partial<ModalFormState>) => {
    setModalFormState(prev => ({ ...prev, ...update }));
  }, []);

  // Apply a click-edit commit (move or resize) to editedConfig, drive the live
  // physics body to the committed pose, and re-capture the initial snapshot so
  // the next sim.reset()/precompute() starts from the edited state.
  //
  // Also re-syncs any slider bound to position.x / position.y on this object —
  // both the slider's defaultValue (so a save persists the new starting value)
  // and the live controlValues map (so handleControlChange after reset/play
  // doesn't write the stale slider value back over the dragged position).
  const commitObjectEdit = useCallback(
    (id: string, partial: ObjectEditCommit) => {
      setEditedConfig((prev) => {
        // applyEditCommitToObject routes the commit through the seam's edit
        // back-feed: ramp-field objects get their authoring params rewritten
        // (resize → run/rise, move → x only) instead of raw width/height/y,
        // which the next expansion's derived-wins would otherwise revert.
        const newObjects = (prev.objects ?? []).map((o) =>
          o.id === id ? applyEditCommitToObject(o, partial) : o,
        );
        const newControls = (prev.controls ?? []).map((c) => {
          if (c.type !== 'slider' || c.targetObj !== id) return c;
          if (c.property === 'position.x') return { ...c, defaultValue: partial.x };
          if (c.property === 'position.y') return { ...c, defaultValue: partial.y };
          return c;
        });
        return { ...prev, objects: newObjects, controls: newControls };
      });
      setControlValues((cv) => {
        const next = { ...cv };
        controls.forEach((c) => {
          if (c.type !== 'slider' || c.targetObj !== id) return;
          if (c.property === 'position.x') next[c.label] = partial.x;
          if (c.property === 'position.y') next[c.label] = partial.y;
        });
        return next;
      });
      const body = objRefs.current[id];
      if (body) {
        body.position.x = partial.x * unitScale;
        body.position.y = partial.y * unitScale;
      }
      simulationControlsRef.current?.recaptureInitialSnapshot();
      // The immediate recapture above catches the raw committed pose, but the
      // seam may still transform it (seatOn riders re-seat, ramps re-derive)
      // on the re-render this commit triggers — so arm the deferred recapture
      // too, which fires AFTER siObjects change and the ObjectRenderers
      // rebuild bodies at the seam-derived poses. Without it, play/reset
      // restored the raw dragged pose while the display showed the seated one
      // (SO-B drive finding, 2026-08-06).
      pendingRecaptureRef.current = true;
      setHasUnsavedChanges(true);
      frameCacheRef.current = null;
      recordingBufferRef.current = null;
      prevVelocitiesRef.current = {};
      prevAngularVelocitiesRef.current = {};
      prevTimeRef.current = 0;
    },
    [unitScale, controls],
  );

  // Deferred initial-snapshot recapture for object add/remove AND for edit
  // commits whose seam-derived pose differs from the raw commit (seatOn
  // riders, ramp resizes). The recapture must be DEFERRED one commit: an
  // added/rebuilt body only exists after the new ObjectRenderer's mount
  // effect runs, and a removed body is only destroyed after the old one's
  // cleanup runs (both happen before this parent effect on the same commit).
  useEffect(() => {
    if (!pendingRecaptureRef.current) return;
    pendingRecaptureRef.current = false;
    // Re-apply slider values to the rebuilt bodies BEFORE recapturing: a
    // seam-driven rebuild spawns bodies from config state, which drops any
    // slider-held state (e.g. a speed-along-incline slider's magnitude).
    // For seatOn riders the held polar direction has just re-seeded to the
    // CURRENT surface (the [expandedObjects] effect above runs first), so
    // re-application aims the kept speed down the NEW slope — the velocity
    // angle rides with a ramp-angle slider (drive finding 2026-08-06).
    // ramp.* sliders are skipped: their values are already inside the
    // expansion that caused this pass (re-applying would re-arm the flag).
    controls.forEach((c) => {
      if (c.type !== 'slider' || c.property?.startsWith('ramp.')) return;
      const v = controlValues[c.label];
      if (typeof v === 'number') applyControlToBody(c, v);
    });
    simulationControlsRef.current?.recaptureInitialSnapshot();
  }, [siObjects, controls, controlValues, applyControlToBody]);

  // Debug "Import Object": inject an SVG-generator export as a new object at
  // the center of the play area, sized to ~20% of the smaller scene dimension
  // so it lands clearly grabbable (EditOverlay drag/resize) at any sim scale.
  const handleImportObject = useCallback(
    (
      { item, svgText }: ImportCandidate,
      { isStatic, presets }: { isStatic: boolean; presets: ImportControlPreset[] },
    ) => {
      const registered = registerImportedRenderable(item, svgText);
      const vb = registered.viewBox ?? {
        width: MANIFEST_VIEWBOX,
        height: MANIFEST_VIEWBOX,
      };
      // JSON-declared scale (not the zoom slider), in user units — same frame
      // object x/y/width/height are authored in.
      const worldW = SIMULATION_WIDTH / configPixelsPerUnit;
      const worldH = SIMULATION_HEIGHT / configPixelsPerUnit;
      const target = 0.2 * Math.min(worldW, worldH);
      const aspect = vb.width / vb.height;
      const width = aspect >= 1 ? target : target * aspect;
      const height = aspect >= 1 ? target / aspect : target;

      // Unique id computed from the current objects (not inside the state
      // updater) because the preset control labels below need the final id.
      const ids = new Set(expandedObjects.map((o) => o.id));
      let id = registered.name;
      for (let n = 2; ids.has(id); n++) id = `${registered.name}_${n}`;
      const newObject: ObjectConfig = {
        id,
        x: worldW / 2,
        y: worldH / 2,
        width,
        height,
        svg: registered.name,
        isStatic,
        mass: 1,
      };

      // Preset sliders bound to the new object. Ranges are auto-derived; the
      // angle range follows env.angleUnit, and defaults match the object's
      // initial (zero) velocity/acceleration so attaching a control doesn't
      // move anything until the user drags it.
      const angleUnit = environment.angleUnit ?? 'deg';
      const angleMax = angleUnit === 'deg' ? 360 : angleUnit === 'rad' ? 6.28 : 1;
      const angleStep = angleUnit === 'deg' ? 1 : 0.01;
      const presetSliders: Record<ImportControlPreset, Omit<SliderConfig, 'type' | 'targetObj'>> = {
        speed: { label: `${id} speed`, property: 'velocity.magnitude', min: 0, max: 30, step: 0.1, defaultValue: 0 },
        'launch-angle': { label: `${id} launch angle`, property: 'velocity.angle', min: 0, max: angleMax, step: angleStep, defaultValue: 0 },
        'accel-x': { label: `${id} accel X`, property: 'acceleration.x', min: -20, max: 20, step: 0.1, defaultValue: 0 },
        'accel-y': { label: `${id} accel Y`, property: 'acceleration.y', min: -20, max: 20, step: 0.1, defaultValue: 0 },
      };
      const newControls: ControlConfig[] = presets.map((p) => ({
        type: 'slider',
        targetObj: id,
        ...presetSliders[p],
      }));

      setEditedConfig((prev) => ({
        ...prev,
        objects: [...(prev.objects ?? []), newObject],
        controls: newControls.length > 0 ? [...(prev.controls ?? []), ...newControls] : prev.controls,
      }));
      if (newControls.length > 0) {
        // Seed live values so the new sliders render controlled from frame one.
        setControlValues((cv) => {
          const next = { ...cv };
          newControls.forEach((c) => {
            if (c.type === 'slider') next[c.label] = c.defaultValue;
          });
          return next;
        });
      }
      setShowImportObjectModal(false);
      setHasUnsavedChanges(true);
      frameCacheRef.current = null;
      recordingBufferRef.current = null;
      prevVelocitiesRef.current = {};
      prevAngularVelocitiesRef.current = {};
      prevTimeRef.current = 0;
      pendingRecaptureRef.current = true;
    },
    [configPixelsPerUnit, expandedObjects, environment.angleUnit],
  );

  const handleSaveEdits = useCallback(async () => {
    if (simulationId === undefined && !localJsonEdit) return;
    setIsSaving(true);
    try {
      const newSimulationId = await createSimulation(
        editedConfig,
        false,
        simulationId ?? null,
        null,
      );
      setHasUnsavedChanges(false);
      navigate(`/simulation/${newSimulationId}`);
    } catch (error) {
      console.error('Failed to save edited simulation:', error);
      alert('Failed to save edited simulation. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [editedConfig, simulationId, localJsonEdit, navigate]);

  // Direct-manipulation editing (select / move / resize / Delete) is gated on
  // THREE unrelated concerns — worth naming them separately, because reading
  // this line as one idea is what makes it confusing:
  //
  //  1. `!isRunning` — playback state. Don't edit a moving picture.
  //  2. `!pickingPosition` — NOT a playback concept at all. This is a transient
  //     canvas INPUT MODE owned by the experimental-data overlay: the user hit
  //     "pick position" in ExperimentalDataModal, the modal hid itself, and the
  //     next canvas click is claimed as an origin coordinate (handleCanvasClick
  //     converts it to world coords and clears the flag immediately). The gate
  //     exists so that one click doesn't ALSO select an object. Nothing about
  //     the play/pause/scrub cycle sets it.
  //  3. `simAtInitialConditions` — body displacement. See its declaration.
  //
  // Consequence worth knowing (it has bitten): after any run, editing stays
  // locked until Reset — pausing and scrubbing do not unlock it. That is why
  // the force loupe self-triggers on its own rule instead of being anchored to
  // a selection (Notes_on_Applied_Forces_Refactor.md, Findings 2026-08-08).
  const editModeActive = !isRunning && !pickingPosition && simAtInitialConditions;

  // Drop a stale selection if the object disappears (e.g., simulationId change
  // races, or future features that remove objects).
  useEffect(() => {
    if (!selectedObjectId) return;
    if (!expandedObjects.some((o) => o.id === selectedObjectId)) {
      setSelectedObjectId(null);
    }
  }, [selectedObjectId, expandedObjects]);

  // Select + Delete: remove an object and every control/output/graph binding
  // that references it (commitObjectEdit's re-sync concerns in reverse —
  // orphaned bindings would silently read a missing body). Draft-only like
  // all click-edits: Save persists the removal, reload discards it.
  const removeObject = useCallback(
    (id: string) => {
      const droppedLabels = controls
        .filter((c) => c.targetObj === id)
        .map((c) => c.label);
      setEditedConfig((prev) => ({
        ...prev,
        objects: (prev.objects ?? []).filter((o) => o.id !== id),
        controls: (prev.controls ?? []).filter((c) => c.targetObj !== id),
        outputs: (prev.outputs ?? [])
          .map((g) => ({ ...g, values: g.values.filter((v) => v.targetObj !== id) }))
          .filter((g) => g.values.length > 0),
        graphs: (prev.graphs ?? [])
          .map((g) => ({ ...g, lines: g.lines.filter((l) => l.targetObj !== id) }))
          .filter((g) => g.lines.length > 0),
      }));
      if (droppedLabels.length > 0) {
        setControlValues((cv) => {
          const next = { ...cv };
          droppedLabels.forEach((label) => delete next[label]);
          return next;
        });
      }
      setSelectedObjectId(null);
      setHasUnsavedChanges(true);
      frameCacheRef.current = null;
      recordingBufferRef.current = null;
      prevVelocitiesRef.current = {};
      prevAngularVelocitiesRef.current = {};
      prevTimeRef.current = 0;
      pendingRecaptureRef.current = true;
    },
    [controls],
  );

  // Delete/Backspace removes the selected object while editing. Skipped when
  // focus is in a form field so typing in inputs never deletes bodies.
  useEffect(() => {
    if (!editModeActive || !selectedObjectId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      removeObject(selectedObjectId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editModeActive, selectedObjectId, removeObject]);

  // Dismiss the "reset to edit" prompt automatically once editing is allowed
  // again (e.g. user reset the sim from the header controls).
  useEffect(() => {
    if (editModeActive && resetPromptAt) setResetPromptAt(null);
  }, [editModeActive, resetPromptAt]);

  const handlePlay = async () => {
    const sim = simulationControlsRef.current;
    if (!sim) return;

    // Drop selection so the edit overlay disappears once the sim starts. The
    // bodies are about to leave their authored poses, so editing stays locked
    // until Reset puts them back — pausing or scrubbing is not enough.
    setSelectedObjectId(null);
    setSimAtInitialConditions(false);

    // The cache-key invariant: EVERY physics-affecting input belongs in this
    // key — cached frames may replay only when all of them match. Air mode and
    // solver iterations were missing until 2026-08-06 (drive finding): flipping
    // the air toggle after a run silently replayed the stale frames computed
    // under the old mode.
    const currentKey = JSON.stringify({
      controls: controlValues,
      duration: maxDuration,
      engine: activeEngine,
      timestepHz: precomputeTimestepHz,
      airResistance: airResistanceMode,
      solverIterations,
      positionIterations,
      // Debug applied force is a physics-affecting input like any other
      // (invariant #13). Discrete values keep this key space small enough
      // that flipping between forces can actually reuse cached frames.
      debugForce: debugForceN,
      debugForceTarget: debugForceTargetId,
      // AUTHORED applied force (Phase 2). A slider bound to "appliedForce.*"
      // already rides `controls` above, but the authored baseline does not —
      // and Tweak JSON can change it without recreating bodies. Cheap
      // insurance, and exactly what invariant #13 asks for.
      authoredForces: siObjects
        .filter((o) => o.appliedForce)
        .map((o) => [o.id, o.appliedForce!.x, o.appliedForce!.y]),
    });

    if (frameCacheRef.current && frameCacheRef.current.key === currentKey) {
      const frames = frameCacheRef.current.frames;
      setReplayTotalFrames(frames.length);
      if (jsonModeRef.current !== 'replay' || replayCursorRef.current >= frames.length) {
        setGraphData(graphs.map(() => []));
        jsonModeRef.current = 'replay';
        setPrecomputeState('ready');
        sim.startReplay(handleReplayFrame, frames.length);
      }
      sim.play();
      setIsRunning(true);
      return;
    }

    frameCacheRef.current = null;
    const totalFrames = Math.max(1, Math.round(maxDuration * 60) + 1);
    recordingBufferRef.current = [];
    prevVelocitiesRef.current = {};
    prevAngularVelocitiesRef.current = {};
    prevTimeRef.current = 0;
    setGraphData(graphs.map(() => []));

    sim.reset();
    controls.forEach((control) => {
      if (control.type === 'slider' || control.type === 'toggle') {
        handleControlChange(control, controlValues[control.label]);
      }
    });
    jsonModeRef.current = 'precomputing';
    setPrecomputeState('precomputing');
    setPrecomputeProgress({ framesDone: 0, totalFrames, estimatedMsRemaining: 0 });
    const startedAt = performance.now();

    try {
      await sim.precompute(totalFrames, (framesDone) => {
        const elapsed = performance.now() - startedAt;
        const estimatedTotal = framesDone > 0 ? (elapsed / framesDone) * totalFrames : 0;
        const remaining = Math.max(0, estimatedTotal - elapsed);
        setPrecomputeProgress({
          framesDone,
          totalFrames,
          estimatedMsRemaining: remaining,
        });
      });
    } catch (err) {
      console.error('Pre-compute failed:', err);
      jsonModeRef.current = 'idle';
      setPrecomputeState('idle');
      setPrecomputeProgress(null);
      return;
    }

    const recordedFrames = recordingBufferRef.current;
    recordingBufferRef.current = null;
    frameCacheRef.current = { key: currentKey, frames: recordedFrames };

    setGraphData(graphs.map(() => []));

    jsonModeRef.current = 'replay';
    setPrecomputeState('ready');
    setPrecomputeProgress(null);
    setReplayTotalFrames(recordedFrames.length);
    sim.startReplay(handleReplayFrame, recordedFrames.length);
    sim.play();
    setIsRunning(true);
  };

  const handlePause = () => {
    simulationControls?.pause();
    setIsRunning(false);
  };

  const handleReset = () => {
    const sim = simulationControlsRef.current;
    if (!sim) return;

    if (frameCacheRef.current) {
      setIsRunning(false);
      setSimAtInitialConditions(true);
      setGraphData(graphs.map(() => []));
      jsonModeRef.current = 'replay';
      setPrecomputeState('ready');
      sim.pause();
      sim.startReplay(handleReplayFrame, frameCacheRef.current.frames.length);
      return;
    }

    sim.reset();
    setIsRunning(false);
    setSimAtInitialConditions(true);
    setGraphData(graphs.map(() => []));
    prevVelocitiesRef.current = {};
    prevAngularVelocitiesRef.current = {};
    prevTimeRef.current = 0;
    setTimeout(() => {
      controls.forEach((control) => {
        if (control.type === 'slider') {
          handleControlChange(control, controlValues[control.label]);
        }
      });
    }, 0);
  };

  return (
    <div>
      {showJsonEditor && (
        <JsonEditor
          initialJSON={editedConfig}
          onSave={handleSaveTweakedJSON}
          onClose={() => setShowJsonEditor(false)}
        />
      )}
      {showExperimentalModal && (
        <ExperimentalDataModal
          formState={modalFormState}
          onFormStateChange={handleModalFormStateChange}
          onClose={() => { setShowExperimentalModal(false); setPickedPosition(null); setModalFormState(DEFAULT_MODAL_FORM_STATE); }}
          onConfirm={handleExperimentalConfirm}
          onPickPosition={handlePickPosition}
          pickedPosition={pickedPosition}
          unitLabel={UNIT_ABBREV[environment.unit ?? 'm']}
          graphs={graphs}
        />
      )}
      {showImportObjectModal && (
        <ImportObjectModal
          onClose={() => setShowImportObjectModal(false)}
          onImport={handleImportObject}
        />
      )}
      {pickingPosition && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg text-sm font-medium">
          Click on the simulation to set the starting position
        </div>
      )}
      <SimulationHeader
        title={title}
        description={description}
        simulationId={simulationId}
        currentJSON={editedConfig}
        onEdit={canPersist ? handleEdit : undefined}
      />

      <BaseSimulation
        physicsEngine={activeEngine}
        precomputeTimestepSeconds={1 / precomputeTimestepHz}
        solverIterations={solverIterations}
        positionIterations={positionIterations}
        playbackSpeed={playbackSpeed}
        onUpdate={handleUpdate}
        onPreStep={handlePreStep}
        onControlsReady={handleControlsReady}
        onCanvasContainerReady={handleCanvasContainerReady}
        onCanvasClick={handleCanvasClick}
        pickingPosition={pickingPosition}
      >
        {/* Playback + Controls */}
        <div className="col-start-1 row-start-1 flex flex-col gap-4">
          <Panel title="Playback">
            <SimulationControls
              isRunning={isRunning}
              onPlay={handlePlay}
              onPause={handlePause}
              onReset={handleReset}
              maxDuration={maxDuration}
              onMaxDurationChange={setMaxDuration}
              precomputeState={precomputeState}
              precomputeProgress={precomputeProgress}
              playbackSpeed={playbackSpeed}
              onPlaybackSpeedChange={setPlaybackSpeed}
              replayFrameIndex={replayFrameIndex}
              totalFrames={replayTotalFrames}
              onSeek={(frameIndex) => simulationControlsRef.current?.seekReplay(frameIndex)}
            />
          </Panel>
          {controls.length > 0 && (
            <Panel title="Controls">
              {controls.map((control) => (
                <ControlRenderer
                  key={`${control.targetObj}.${control.property}`}
                  control={control}
                  value={controlValues[control.label]}
                  disabled={isRunning}
                  onChange={(value: number | boolean) => handleControlChange(control, value as number)}
                />
              ))}
            </Panel>
          )}
        </div>

        {/* Scale + Import Experimental Data */}
        <div className="col-start-1 row-start-2 justify-self-end flex flex-col gap-3 items-end">
          <ScaleSlider
            value={pixelsPerUnit}
            onChange={setPixelsPerUnit}
            unit={environment.unit ?? 'm'}
            defaultValue={configPixelsPerUnit}
          />
          <AdvancedDebugPanel
            engine={activeEngine}
            onEngineChange={setEngineOverride}
            engineDisabled={isRunning || precomputeState === 'precomputing'}
            timestepHz={precomputeTimestepHz}
            onTimestepChange={setPrecomputeTimestepHz}
            timestepDisabled={isRunning || precomputeState === 'precomputing'}
            solverIterations={solverIterations}
            onSolverIterationsChange={setSolverIterations}
            solverIterationsDisabled={isRunning || precomputeState === 'precomputing'}
            positionIterations={positionIterations}
            onPositionIterationsChange={setPositionIterations}
            positionIterationsDisabled={isRunning || precomputeState === 'precomputing'}
            airResistanceMode={airResistanceMode}
            onAirResistanceModeChange={setAirResistanceMode}
            airResistanceDisabled={isRunning || precomputeState === 'precomputing'}
            debugForceN={debugForceN}
            onDebugForceChange={setDebugForceN}
            debugForceTargetId={debugForceTargetId}
            onDebugForceTargetChange={setDebugForceTargetId}
            forceTargetOptions={forceTargetOptions}
            debugForceDisabled={isRunning || precomputeState === 'precomputing'}
            showGrid={showGrid}
            onShowGridChange={setShowGrid}
            showColliders={showColliders}
            onShowCollidersChange={setShowColliders}
            showForces={showForces}
            onShowForcesChange={setShowForces}
            showLoupe={showLoupe}
            onShowLoupeChange={setShowLoupe}
            onTweakJSON={canPersist ? handleTweakJSON : undefined}
            onImportObject={() => setShowImportObjectModal(true)}
          />
          <button
            onClick={() => setShowExperimentalModal(true)}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium shadow-md"
          >
            Import Experimental Data
          </button>
          {experimentalData && (
            <button
              onClick={() => setExperimentalData(null)}
              className="px-3 py-1.5 text-red-500 hover:text-red-700 text-xs"
            >
              Clear Experimental Data
            </button>
          )}
        </div>

        {/* Environment - SI gravity and bounds. Walls use the JSON-declared
            scale so they don't move when the user drags the zoom slider. */}
        <Environment
          walls={environment.walls}
          gravity={siGravityMagnitude}
          pixelsPerUnit={configPixelsPerMeter}
        />

        {/* Objects - pre-scaled to SI at the config boundary */}
        {siObjects.map((object) => (
          <ObjectRenderer
            key={object.id}
            ref={(ref) => {
              // Delete on null so objRefs doesn't keep wrappers to freed
              // engine bodies after an adapter teardown (engine switch). A
              // stale wrapper would crash on the next body.velocity.x read —
              // Rapier throws "unreachable" from WASM, which then corrupts
              // the shared world and breaks the next reinit too.
              if (ref) {
                objRefs.current[object.id] = ref;
              } else {
                delete objRefs.current[object.id];
              }
            }}
            {...object}
          />
        ))}

        {/* Graphs */}
        {graphs.length > 0 && (
          <Panel className="col-start-3 row-start-1">
            <div className={`grid gap-3 md:gap-5 xl:gap-8 ${
              graphs.length <= 2 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
            }`}>
              {graphs.map((graph, graphIndex) => {
                const isOverlayTarget = experimentalData?.graphOverlayIndex === graphIndex;
                const overlayData = isOverlayTarget && experimentalData
                  ? experimentalData.data
                      .map(p => {
                        const field = experimentalData.graphOverlayYField;
                        const value = field === 'x' ? p.x : p.y;
                        return value !== undefined ? { time: p.time, value } : null;
                      })
                      .filter((p): p is { time: number; value: number } => p !== null)
                  : undefined;
                return (
                  <GraphRenderer
                    key={graphIndex}
                    config={graph}
                    data={graphData[graphIndex] || []}
                    compact={graphs.length > 1}
                    maxDuration={maxDuration}
                    overlayData={overlayData}
                    overlayColor={isOverlayTarget ? experimentalData?.color : undefined}
                  />
                );
              })}
            </div>
          </Panel>
        )}

        {/* Outputs */}
        {outputs.length > 0 && (
          <Panel className="col-start-2 row-start-2 xl:min-w-[800px] justify-center">
            <div className="flex flex-row gap-3 md:gap-4 xl:gap-6 justify-center">
              {outputs.map((group, index) => (
                <OutputGroup
                  key={index}
                  config={group}
                  getValue={(targetObj, property) => {
                    const key = `${targetObj}.${property}`;
                    // `?? 0`, NOT `|| 0` — the difference is the whole fix.
                    // ABSENT key (nothing computed yet: a paused, never-stepped
                    // sim, whose body loop is gated on deltaTime > 0) → 0, which
                    // is what every sim has always shown on load.
                    // PRESENT but NaN (the property path did not resolve) → pass
                    // the NaN through; clampToZero preserves it and `Output`
                    // renders an em-dash, which it has always been able to do.
                    // `|| 0` collapsed both cases to 0, so an unresolvable path
                    // displayed a confident "0.00" — a fabricated measurement.
                    // Found via the LLM's invented `force-net.x` readouts
                    // (2026-08-14): a student saw "Net force: 0.00 N" on an
                    // accelerating cart, with nothing logged anywhere.
                    return clampToZero(outputValues[key] ?? 0);
                  }}
                />
              ))}
            </div>
          </Panel>
        )}

        {/* Data Download */}
        {graphs.length > 0 && (
          <Panel title="Download Data" className="col-start-3 row-start-2">
            <DataDownload graphs={graphs} graphData={graphData} />
          </Panel>
        )}
        {/* Unified render layer */}
        <RenderLayer
          renderables={pixelRenderables}
          objRefs={objRefs}
          dataSources={dataSources}
          simulationTimeRef={simulationTimeRef}
          canvasContainer={canvasContainer}
          pixelsPerUnit={pixelsPerMeter}
          zoomFactor={zoomFactor}
          gravity={gravityVec}
        />
        {/* Click-to-edit overlay (active only while paused) */}
        <EditOverlay
          canvasContainer={canvasContainer}
          editModeActive={editModeActive}
          clickShowsResetPrompt={!editModeActive && !pickingPosition && (isRunning || !simAtInitialConditions)}
          editedObjects={expandedObjects}
          selectedObjectId={selectedObjectId}
          onSelect={setSelectedObjectId}
          onCommitEdit={commitObjectEdit}
          onResetPromptRequested={(clientX, clientY) =>
            setResetPromptAt({ x: clientX, y: clientY })
          }
          objRefs={objRefs}
          infoActive={!pickingPosition}
          walls={environment.walls}
          onInfoHover={handleInfoHover}
          onInfoPin={handleInfoPin}
          onInfoClear={handleInfoClear}
          pixelsPerMeter={pixelsPerMeter}
          unitScale={unitScale}
          zoomFactor={zoomFactor}
        />
      </BaseSimulation>
      <InfoBoxes
        objects={expandedObjects}
        objRefs={objRefs}
        pins={infoPins}
        hover={infoHover}
        hint={infoHint}
      />
      {resetPromptAt && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setResetPromptAt(null)}
          />
          <div
            className="fixed z-50 bg-white rounded-lg shadow-lg border border-slate-200 px-4 py-3 max-w-xs"
            style={{
              left: Math.min(resetPromptAt.x + 12, window.innerWidth - 280),
              top: Math.min(resetPromptAt.y + 12, window.innerHeight - 120),
            }}
          >
            <p className="text-sm text-slate-700 mb-2">
              You have to reset the sim to move objects around.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResetPromptAt(null)}
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setResetPromptAt(null);
                  handleReset();
                }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Reset now
              </button>
            </div>
          </div>
        </>
      )}
      <UnsavedChangesIndicator
        visible={hasUnsavedChanges && canPersist}
        saving={isSaving}
        onSave={handleSaveEdits}
      />
    </div>
  );
}

export default JsonSimulation;
