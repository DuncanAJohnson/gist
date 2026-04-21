import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import BaseSimulation, { type SimulationControls as BaseSimulationControls, CANVAS_HEIGHT, WALL_THICKNESS } from './BaseSimulation';
import type { PhysicsAdapter, PhysicsBody, Vec2 } from '../physics/types';
import type { PrecomputeState, PrecomputeProgress } from './simulation_components/SimulationControls';
import Environment from './simulation_components/Environment';
import Panel from './simulation_components/Panel';
import Scale from './simulation_components/Scale';
import SimulationHeader from './simulation_components/SimulationHeader';
import JsonEditor from './JsonEditor';
import EngineSwitcher from './simulation_components/EngineSwitcher';
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
import {
  synthesizeWallRenderables,
  synthesizeBodyRenderable,
  synthesizeForceArrowRenderable,
  synthesizeExperimentalRenderable,
  buildExperimentalDataResolver,
  prepareRenderable,
} from './simulation_components/renderables/synthesize';
import type { PixelRenderable, DataPositionResolver } from './simulation_components/renderables/types';
import type { Renderable } from '../schemas/simulation';

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
  renderables?: Array<Renderable>;
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
  const {
    title,
    description,
    environment,
    objects = [],
    controls = [],
    outputs = [],
    graphs = [],
    renderables: configRenderables = [],
  } = config;

  const pixelsPerUnit = environment.pixelsPerUnit ?? 10;
  const gravityMagnitude = environment.gravity ?? 9.8;

  // SI cutover: config values are declared in `environment.unit`. Convert all
  // dimensional values (lengths, velocities, accelerations, gravity) to SI
  // meters at this boundary — everything below runs pure SI. The render layer
  // uses `pixelsPerMeter` so user-set `pixelsPerUnit` still behaves as
  // "pixels per user unit" for Scale/overlays.
  const unitScale = useMemo(() => unitToMeters(environment.unit ?? 'm'), [environment.unit]);
  const pixelsPerMeter = pixelsPerUnit / unitScale;
  const siGravityMagnitude = gravityMagnitude * unitScale;
  const gravityVec: Vec2 = useMemo(() => ({ x: 0, y: -siGravityMagnitude }), [siGravityMagnitude]);

  const siObjects = useMemo(
    () => objects.map((obj) => scaleObjectToSI(obj, unitScale)),
    [objects, unitScale],
  );

  const [showJsonEditor, setShowJsonEditor] = useState(false);

  // Experimental data overlay state
  const [showExperimentalModal, setShowExperimentalModal] = useState(false);
  const [experimentalData, setExperimentalData] = useState<ExperimentalDataConfig | null>(null);
  const [pickingPosition, setPickingPosition] = useState(false);
  const [pickedPosition, setPickedPosition] = useState<{ x: number; y: number } | null>(null);
  const [modalFormState, setModalFormState] = useState<ModalFormState>(DEFAULT_MODAL_FORM_STATE);
  const simulationTimeRef = useRef(0);
  const [canvasContainer, setCanvasContainer] = useState<HTMLDivElement | null>(null);

  // Compose renderables in SI — no per-property pixel conversion.
  const pixelRenderables = useMemo<PixelRenderable[]>(() => {
    const explicit = configRenderables.map(prepareRenderable);
    const coveredBodyIds = new Set(
      configRenderables
        .filter((r) => r.source.type === 'body')
        .map((r) => (r.source as { bodyId: string }).bodyId)
    );
    const defaults = objects
      .filter((obj) => !coveredBodyIds.has(obj.id))
      .map(synthesizeBodyRenderable);
    const forceArrows = objects
      .filter((obj) => obj.showForceArrows)
      .map(synthesizeForceArrowRenderable);
    const walls = synthesizeWallRenderables(environment.walls ?? [], pixelsPerMeter);
    const experimental = experimentalData
      ? [synthesizeExperimentalRenderable(experimentalData)]
      : [];
    return [...walls, ...defaults, ...forceArrows, ...explicit, ...experimental].sort(
      (a, b) => a.zIndex - b.zIndex
    );
  }, [configRenderables, objects, environment.walls, experimentalData, pixelsPerMeter]);

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

  // Session-local engine override. Resets on reload — the config's
  // environment.physicsEngine is always the starting point. Both the override
  // and the config value are routed through resolveEngine so a disabled engine
  // (per src/config/engines.ts) falls back to DEFAULT_ENGINE.
  const [engineOverride, setEngineOverride] = useState<PhysicsEngineKind | null>(null);
  const activeEngine: PhysicsEngineKind = resolveEngine(
    engineOverride ?? environment.physicsEngine,
  );

  const [maxDuration, setMaxDuration] = useState<number>(10);

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
  const handleReplayFrame = useCallback((frameIndex: number) => {
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
    if (frameIndex === 0) {
      setGraphData(graphs.map((_, i) => [frame.graphPoints[i]]));
    } else {
      setGraphData((prev) =>
        prev.map((arr, i) => [...arr, frame.graphPoints[i]])
      );
    }
    simulationTimeRef.current = (frameIndex + 1) / 30;
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
  const readDisplayValue = (obj: any, path: string): number => {
    const raw = getNestedValue(obj, path);
    if (typeof raw !== 'number') return raw;
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

  const handleEdit = async (editedJSON: any) => {
    if (!simulationId) return;
    try {
      const newSimulationId = await createSimulation(editedJSON, true, simulationId);
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
      const newSimulationId = await createSimulation(tweakedJSON, false, simulationId);
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
    // Convert canvas pixel back to the config's user unit (not SI).
    const w2c = new WorldToCanvas(pixelsPerUnit, CANVAS_HEIGHT, WALL_THICKNESS);
    const userPos = w2c.fromPoint({ x: canvasX, y: canvasY });
    setPickedPosition(userPos);
    setPickingPosition(false);
    setShowExperimentalModal(true);
  }, [pickingPosition, pixelsPerUnit]);

  const handleCanvasContainerReady = useCallback((container: HTMLDivElement) => {
    setCanvasContainer(container);
  }, []);

  const handleExperimentalConfirm = useCallback((config: ExperimentalDataConfig) => {
    setExperimentalData(config);
    setShowExperimentalModal(false);
    setPickedPosition(null);
    setModalFormState(DEFAULT_MODAL_FORM_STATE);
  }, []);

  const handleModalFormStateChange = useCallback((update: Partial<ModalFormState>) => {
    setModalFormState(prev => ({ ...prev, ...update }));
  }, []);

  return (
    <div>
      {showJsonEditor && (
        <JsonEditor
          initialJSON={config}
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
        isRunning={isRunning}
        simulationId={simulationId}
        currentJSON={config}
        onEdit={simulationId ? handleEdit : undefined}
        onTweakJSON={simulationId ? handleTweakJSON : undefined}
        maxDuration={maxDuration}
        onMaxDurationChange={setMaxDuration}
        precomputeState={precomputeState}
        precomputeProgress={precomputeProgress}
        onPlay={async () => {
          const sim = simulationControlsRef.current;
          if (!sim) return;

          const currentKey = JSON.stringify({
            controls: controlValues,
            duration: maxDuration,
            engine: activeEngine,
          });

          if (frameCacheRef.current && frameCacheRef.current.key === currentKey) {
            const frames = frameCacheRef.current.frames;
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
          const totalFrames = Math.max(1, Math.round(maxDuration * 30));
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
          sim.startReplay(handleReplayFrame, recordedFrames.length);
          sim.play();
          setIsRunning(true);
        }}
        onPause={() => {
          simulationControls?.pause();
          setIsRunning(false);
        }}
        onReset={() => {
          const sim = simulationControlsRef.current;
          if (!sim) return;

          if (frameCacheRef.current) {
            setIsRunning(false);
            setGraphData(graphs.map(() => []));
            jsonModeRef.current = 'replay';
            setPrecomputeState('ready');
            sim.pause();
            sim.startReplay(handleReplayFrame, frameCacheRef.current.frames.length);
            return;
          }

          sim.reset();
          setIsRunning(false);
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
        }}
      />

      <BaseSimulation
        physicsEngine={activeEngine}
        onUpdate={handleUpdate}
        onControlsReady={handleControlsReady}
        onCanvasContainerReady={handleCanvasContainerReady}
        onCanvasClick={handleCanvasClick}
        pickingPosition={pickingPosition}
      >
        {/* Controls */}
        {controls.length > 0 && (
          <Panel title="Controls" className="col-start-1 row-start-1">
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

        {/* Scale + Import Experimental Data */}
        <div className="col-start-1 row-start-2 justify-self-end flex flex-col gap-3 items-end">
          <Scale
            pixelsPerUnit={pixelsPerUnit}
            unit={environment.unit ?? 'm'}
          />
          <EngineSwitcher
            value={activeEngine}
            onChange={setEngineOverride}
            disabled={isRunning || precomputeState === 'precomputing'}
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

        {/* Environment - SI gravity and bounds */}
        <Environment
          walls={environment.walls}
          gravity={siGravityMagnitude}
          pixelsPerUnit={pixelsPerMeter}
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
          gravity={gravityVec}
        />
      </BaseSimulation>
    </div>
  );
}

export default JsonSimulation;
