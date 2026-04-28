import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import BaseSimulation, { type SimulationControls as BaseSimulationControls, CANVAS_HEIGHT, WALL_THICKNESS } from './BaseSimulation';
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
import type { UnitType } from '../lib/unitConversion';
import { UNIT_ABBREV, unitToMeters, scaleObjectToSI, isDimensionalProperty } from '../lib/unitConversion';
import { WorldToCanvas } from '../lib/worldToCanvas';
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
// Render Layer
import RenderLayer from './simulation_components/renderables/RenderLayer';
// Edit overlay + unsaved-changes indicator
import EditOverlay from './simulation_components/EditOverlay';
import UnsavedChangesIndicator from './simulation_components/UnsavedChangesIndicator';
import type { ObjectEditCommit } from '../lib/editGeometry';
import {
  synthesizeWallRenderables,
  synthesizeBodyRenderable,
  synthesizeForceArrowRenderable,
  synthesizeExperimentalRenderable,
  synthesizeGridRenderable,
  buildExperimentalDataResolver,
} from './simulation_components/renderables/synthesize';
import type { PixelRenderable, DataPositionResolver } from './simulation_components/renderables/types';

interface SimulationConfig {
  title?: string;
  description?: string;
  environment: {
    walls: string[];
    gravity?: number;
    unit?: UnitType;
    pixelsPerUnit?: number;
    physicsEngine?: 'matter' | 'rapier' | 'planck';
  };
  objects?: Array<ObjectConfig>;
  controls?: Array<ControlConfig>;
  outputs?: Array<OutputGroupConfig>;
  graphs?: Array<GraphConfig>;
}

interface JsonSimulationProps {
  config: SimulationConfig;
  simulationId?: number;
}

type SimulationControls = BaseSimulationControls;

type FrameBodySnap = {
  id: string;
  x: number;
  y: number;
  angle: number;
};

type Frame = {
  bodies: FrameBodySnap[];
  outputValues: Record<string, number>;
  graphPoints: DataPoint[];
};

function JsonSimulation({ config, simulationId }: JsonSimulationProps) {
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
    setSimIsDirty(false);
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

  const siObjects = useMemo(
    () => objects.map((obj) => scaleObjectToSI(obj, unitScale)),
    [objects, unitScale],
  );

  const [showJsonEditor, setShowJsonEditor] = useState(false);

  // Cosmetic graph-paper grid behind the simulation. Session-local; on by
  // default. Doesn't affect the bake cache, so toggling mid-replay is safe.
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // Experimental data overlay state
  const [showExperimentalModal, setShowExperimentalModal] = useState(false);
  const [experimentalData, setExperimentalData] = useState<ExperimentalDataConfig | null>(null);
  const [pickingPosition, setPickingPosition] = useState(false);
  const [pickedPosition, setPickedPosition] = useState<{ x: number; y: number } | null>(null);
  const [modalFormState, setModalFormState] = useState<ModalFormState>(DEFAULT_MODAL_FORM_STATE);
  const simulationTimeRef = useRef(0);
  const [canvasContainer, setCanvasContainer] = useState<HTMLDivElement | null>(null);

  // Compose renderables in SI — every object emits one SVG renderable from
  // its `svg` field, plus walls, force arrows, and any experimental overlay.
  const pixelRenderables = useMemo<PixelRenderable[]>(() => {
    const sprites = objects.map(synthesizeBodyRenderable);
    const forceArrows = objects
      .filter((obj) => obj.showForceArrows)
      .map(synthesizeForceArrowRenderable);
    const walls = synthesizeWallRenderables(environment.walls ?? [], configPixelsPerMeter);
    const experimental = experimentalData
      ? [synthesizeExperimentalRenderable(experimentalData)]
      : [];
    // Grid uses the user-unit pixelsPerUnit (not pixelsPerMeter) so labels
    // read in the sim's configured unit. zIndex (-20) sorts it under walls.
    const grid = showGrid
      ? [synthesizeGridRenderable(pixelsPerUnit, UNIT_ABBREV[environment.unit ?? 'm'], zoomFactor)]
      : [];
    return [...grid, ...walls, ...sprites, ...forceArrows, ...experimental].sort(
      (a, b) => a.zIndex - b.zIndex
    );
  }, [objects, environment.walls, environment.unit, experimentalData, configPixelsPerMeter, pixelsPerUnit, showGrid, zoomFactor]);

  const dataSources = useMemo<Record<string, DataPositionResolver>>(() => {
    if (!experimentalData) return {};
    const resolver = buildExperimentalDataResolver(experimentalData, unitScale);
    return resolver ? { experimental: resolver } : {};
  }, [experimentalData, unitScale]);

  // Refs to all physics bodies by config id (SI PhysicsBody).
  const objRefs = useRef<Record<string, PhysicsBody>>({});

  // Finite-difference state for derivedAcceleration.
  const prevVelocitiesRef = useRef<Record<string, { x: number; y: number }>>({});
  const prevTimeRef = useRef<number>(0);

  // State for control values
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

  // State for output values
  const [outputValues, setOutputValues] = useState<Record<string, number>>({});

  // State for simulation controls
  const [simulationControls, setSimulationControls] = useState<SimulationControls | null>(null);
  const simulationControlsRef = useRef<SimulationControls | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Click-to-edit state. Edits are drafts: they update editedConfig and physics
  // bodies, but don't persist until the user clicks Save now in the indicator.
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // True once the sim has been advanced (play started) since last reset. While
  // dirty we lock object editing — the user must reset first so edits apply
  // to a clean initial state, not mid-sim positions.
  const [simIsDirty, setSimIsDirty] = useState(false);

  // Popup shown when the user clicks an object while editing is locked. Stores
  // viewport coords so the bubble can be positioned next to the click.
  const [resetPromptAt, setResetPromptAt] = useState<{ x: number; y: number } | null>(null);

  // Session-local engine override. Resets on reload — the config's
  // environment.physicsEngine is always the starting point. Both the override
  // and the config value are routed through resolveEngine so a disabled engine
  // (per src/config/engines.ts) falls back to DEFAULT_ENGINE.
  const [engineOverride, setEngineOverride] = useState<PhysicsEngineKind | null>(null);
  const activeEngine: PhysicsEngineKind = resolveEngine(
    engineOverride ?? environment.physicsEngine,
  );

  const [precomputeTimestepHz, setPrecomputeTimestepHz] = useState<number>(480);

  // Constraint-solver iteration count; mapped per-engine in the adapters.
  // 8 matches Planck's velocityIterations default and is a reasonable bump
  // over Rapier's default of 4 for the high-restitution scenes Gist tends
  // to render.
  const [solverIterations, setSolverIterations] = useState<number>(8);
  // Planck-only second knob; Rapier ignores it. 3 matches Planck's default.
  const [positionIterations, setPositionIterations] = useState<number>(3);

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
        body.position.x = snap.x;
        body.position.y = snap.y;
        body.angle = snap.angle;
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

  const getNestedValue = (obj: any, path: string): any => {
    // Redirect acceleration.* to the finite-difference stored on userData.
    if (path.startsWith('acceleration.')) {
      const axis = path.slice('acceleration.'.length);
      const derived = obj?.userData?.derivedAcceleration;
      return derived?.[axis];
    }
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  // Read a property for display (outputs/graphs). Physics bodies store SI
  // values — divide by unitScale for dimensional properties so UI labels in
  // the config's `unit` stay consistent.
  //
  // Returns NaN for paths that don't resolve to a number — e.g. a config with
  // `property: "velocity"` (no axis) would otherwise hand back a Vec2Accessor
  // instance, which crashes React when rendered. Callers should treat NaN as
  // missing data.
  const readDisplayValue = (obj: any, path: string): number => {
    const raw = getNestedValue(obj, path);
    if (typeof raw !== 'number') {
      if (raw !== undefined && raw !== null) {
        // Log once per unique path so a misconfigured prop doesn't spam the console.
        console.warn(
          `readDisplayValue: path "${path}" resolved to non-number (${typeof raw}). Outputs/graphs will show '—'. ` +
          `Did the AI emit a property without an axis suffix (e.g. "velocity" instead of "velocity.y")?`,
        );
      }
      return NaN;
    }
    return isDimensionalProperty(path) ? raw / unitScale : raw;
  };

  const setNestedValue = (obj: any, path: string, value: any): void => {
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
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => current[key], obj);
    target[lastKey] = value;
  };

  const clampToZero = (value: number): number => {
    return Math.abs(value) < 0.01 ? 0 : value;
  };

  // Handle control changes — SI everywhere, Vec2Accessor routes writes through
  // the adapter for velocity/position.
  const handleControlChange = useCallback((control: typeof controls[0], value: number) => {
    setControlValues((prev) => ({
      ...prev,
      [control.label]: value,
    }));

    const obj = objRefs.current[control.targetObj];
    if (obj && control.property) {
      const siValue = isDimensionalProperty(control.property) ? value * unitScale : value;
      setNestedValue(obj, control.property, siValue);
    }
  }, [unitScale]);

  // Update loop: compute finite-difference acceleration, collect outputs, graphs.
  const handleUpdate = useCallback((_adapter: PhysicsAdapter, time: number) => {
    if (jsonModeRef.current === 'replay') return;

    const isRecording = jsonModeRef.current === 'precomputing';

    const deltaTime = time - prevTimeRef.current;
    if (deltaTime > 0) {
      objects.forEach((objectConfig) => {
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

        const prevVelocity = prevVelocitiesRef.current[objectConfig.id];
        if (prevVelocity) {
          body.userData.derivedAcceleration = {
            x: (body.velocity.x - prevVelocity.x) / deltaTime,
            y: (body.velocity.y - prevVelocity.y) / deltaTime,
          };
        } else {
          body.userData.derivedAcceleration = { x: 0, y: 0 };
        }

        prevVelocitiesRef.current[objectConfig.id] = { x: body.velocity.x, y: body.velocity.y };
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
      const bodies: FrameBodySnap[] = objects
        .map((objectConfig) => {
          const body = objRefs.current[objectConfig.id];
          if (!body) return null;
          return { id: objectConfig.id, x: body.position.x, y: body.position.y, angle: body.angle };
        })
        .filter((b): b is FrameBodySnap => b !== null);
      recordingBufferRef.current.push({
        bodies,
        outputValues: newOutputValues,
        graphPoints: perFrameGraphPoints,
      });
    }
  }, [outputs, graphs, objects]);

  const handleEdit = async (editedJSON: any, userPrompt: string | null) => {
    if (!simulationId) return;
    try {
      const newSimulationId = await createSimulation(editedJSON, true, simulationId, userPrompt);
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
    if (!simulationId) return;
    try {
      // Manual JSON edits have no natural-language prompt.
      const newSimulationId = await createSimulation(tweakedJSON, false, simulationId, null);
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
        const newObjects = (prev.objects ?? []).map((o) =>
          o.id === id ? { ...o, ...partial } : o,
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
      setHasUnsavedChanges(true);
      frameCacheRef.current = null;
      recordingBufferRef.current = null;
      prevVelocitiesRef.current = {};
      prevTimeRef.current = 0;
    },
    [unitScale, controls],
  );

  const handleSaveEdits = useCallback(async () => {
    if (!simulationId) return;
    setIsSaving(true);
    try {
      const newSimulationId = await createSimulation(
        editedConfig,
        false,
        simulationId,
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
  }, [editedConfig, simulationId, navigate]);

  // Edit mode is only active when the sim is fully at rest at its initial
  // pose: not running, not picking experimental position, and not dirty from a
  // previous play that hasn't been reset yet.
  const editModeActive = !isRunning && !pickingPosition && !simIsDirty;

  // Drop a stale selection if the object disappears (e.g., simulationId change
  // races, or future features that remove objects).
  useEffect(() => {
    if (!selectedObjectId) return;
    if (!objects.some((o) => o.id === selectedObjectId)) {
      setSelectedObjectId(null);
    }
  }, [selectedObjectId, objects]);

  // Dismiss the "reset to edit" prompt automatically once editing is allowed
  // again (e.g. user reset the sim from the header controls).
  useEffect(() => {
    if (editModeActive && resetPromptAt) setResetPromptAt(null);
  }, [editModeActive, resetPromptAt]);

  const handlePlay = async () => {
    const sim = simulationControlsRef.current;
    if (!sim) return;

    // Drop selection so the edit overlay disappears once the sim starts; and
    // mark dirty so editing stays locked until the user resets.
    setSelectedObjectId(null);
    setSimIsDirty(true);

    const currentKey = JSON.stringify({
      controls: controlValues,
      duration: maxDuration,
      engine: activeEngine,
      timestepHz: precomputeTimestepHz,
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
      setSimIsDirty(false);
      setGraphData(graphs.map(() => []));
      jsonModeRef.current = 'replay';
      setPrecomputeState('ready');
      sim.pause();
      sim.startReplay(handleReplayFrame, frameCacheRef.current.frames.length);
      return;
    }

    sim.reset();
    setIsRunning(false);
    setSimIsDirty(false);
    setGraphData(graphs.map(() => []));
    prevVelocitiesRef.current = {};
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
        onEdit={simulationId ? handleEdit : undefined}
      />

      <BaseSimulation
        physicsEngine={activeEngine}
        precomputeTimestepSeconds={1 / precomputeTimestepHz}
        solverIterations={solverIterations}
        positionIterations={positionIterations}
        playbackSpeed={playbackSpeed}
        onUpdate={handleUpdate}
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
            showGrid={showGrid}
            onShowGridChange={setShowGrid}
            onTweakJSON={simulationId ? handleTweakJSON : undefined}
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
            <div className={`grid gap-8 ${
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
          <Panel className="col-start-2 row-start-2 min-w-[800px] justify-center">
            <div className="flex flex-row gap-6 justify-center">
              {outputs.map((group, index) => (
                <OutputGroup
                  key={index}
                  config={group}
                  getValue={(targetObj, property) => {
                    const key = `${targetObj}.${property}`;
                    return clampToZero(outputValues[key] || 0);
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
          clickShowsResetPrompt={!editModeActive && !pickingPosition && (isRunning || simIsDirty)}
          editedObjects={objects}
          selectedObjectId={selectedObjectId}
          onSelect={setSelectedObjectId}
          onCommitEdit={commitObjectEdit}
          onResetPromptRequested={(clientX, clientY) =>
            setResetPromptAt({ x: clientX, y: clientY })
          }
          objRefs={objRefs}
          pixelsPerMeter={pixelsPerMeter}
          unitScale={unitScale}
        />
      </BaseSimulation>
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
        visible={hasUnsavedChanges && simulationId !== undefined}
        saving={isSaving}
        onSave={handleSaveEdits}
      />
    </div>
  );
}

export default JsonSimulation;
