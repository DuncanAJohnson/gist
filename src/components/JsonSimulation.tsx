import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Matter from 'matter-js';
import BaseSimulation, { type SimulationControls as BaseSimulationControls } from './BaseSimulation';
import type { PrecomputeState, PrecomputeProgress } from './simulation_components/SimulationControls';
import Environment from './simulation_components/Environment';
import Panel from './simulation_components/Panel';
import Scale from './simulation_components/Scale';
import SimulationHeader from './simulation_components/SimulationHeader';
import JsonEditor from './JsonEditor';
import { createSimulation, updateChangesMade } from '../lib/simulationService';
import { UnitConverter, type UnitType } from '../lib/unitConversion';
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
  toPixelRenderable,
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

type Frame = {
  bodies: Array<{ id: number; x: number; y: number; angle: number }>;
  outputValues: Record<string, number>;
  graphPoints: DataPoint[]; // one per graph, aligned with graphs array order
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

  const [showJsonEditor, setShowJsonEditor] = useState(false);

  // Experimental data overlay state
  const [showExperimentalModal, setShowExperimentalModal] = useState(false);
  const [experimentalData, setExperimentalData] = useState<ExperimentalDataConfig | null>(null);
  const [pickingPosition, setPickingPosition] = useState(false);
  const [pickedPosition, setPickedPosition] = useState<{ x: number; y: number } | null>(null);
  const [modalFormState, setModalFormState] = useState<ModalFormState>(DEFAULT_MODAL_FORM_STATE);
  const simulationTimeRef = useRef(0);
  const [canvasContainer, setCanvasContainer] = useState<HTMLDivElement | null>(null);

  // Create unit converter from environment config
  const unitConverter = useMemo(() => {
    return new UnitConverter(
      environment.unit ?? 'm',
      environment.pixelsPerUnit ?? 10,
    );
  }, [environment.unit, environment.pixelsPerUnit]);

  // Convert objects from real-world units to pixels for rendering
  const pixelObjects = useMemo(() => {
    return objects.map((obj): ObjectConfig => {
      const pixelObj: ObjectConfig = {
        ...obj,
        x: unitConverter.toPixelsX(obj.x),
        y: unitConverter.toPixelsY(obj.y),
      };

      // Convert velocity if present
      if (obj.velocity) {
        pixelObj.velocity = unitConverter.toPixelsVelocityAcceleration(obj.velocity);
      }

      // Convert acceleration if present
      if (obj.acceleration) {
        pixelObj.acceleration = unitConverter.toPixelsVelocityAcceleration(obj.acceleration);
      }

      // Convert body dimensions
      if (obj.body) {
        const body = { ...obj.body };
        if (body.type === 'circle' && 'radius' in body) {
          (body as any).radius = unitConverter.toPixelsDimension((body as any).radius);
        } else if (body.type === 'rectangle' && 'width' in body && 'height' in body) {
          (body as any).width = unitConverter.toPixelsDimension((body as any).width);
          (body as any).height = unitConverter.toPixelsDimension((body as any).height);
        } else if (body.type === 'polygon' && 'radius' in body) {
          (body as any).radius = unitConverter.toPixelsDimension((body as any).radius);
        } else if (body.type === 'vertex' && 'vertices' in body) {
          (body as any).vertices = (body as any).vertices.map((v: { x: number; y: number }) => 
            unitConverter.toPixelsPosition(v)
          );
        }
        pixelObj.body = body;
      }

      return pixelObj;
    });
  }, [objects, unitConverter]);

  // Convert gravity from real-world units to Matter.js scale
  const matterGravityScale = useMemo(() => {
    const gravity = environment.gravity ?? 9.8;
    return unitConverter.toMatterGravityScale(gravity);
  }, [environment.gravity, unitConverter]);

  // Compose renderables: user-declared + auto-synthesized (walls, default
  // body outlines, experimental-data marker). Any physics object without an
  // explicit body-tracking renderable gets a default one so every sim still
  // renders correctly.
  const pixelRenderables = useMemo<PixelRenderable[]>(() => {
    const explicit = configRenderables.map((r) => toPixelRenderable(r, unitConverter));
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
    const walls = synthesizeWallRenderables(environment.walls ?? []);
    const experimental = experimentalData
      ? [synthesizeExperimentalRenderable(experimentalData)]
      : [];
    return [...walls, ...defaults, ...forceArrows, ...explicit, ...experimental].sort(
      (a, b) => a.zIndex - b.zIndex
    );
  }, [configRenderables, objects, environment.walls, experimentalData, unitConverter]);

  const dataSources = useMemo<Record<string, DataPositionResolver>>(() => {
    if (!experimentalData) return {};
    const resolver = buildExperimentalDataResolver(experimentalData, unitConverter);
    return resolver ? { experimental: resolver } : {};
  }, [experimentalData, unitConverter]);

  // Store refs to all objects by their ID
  const objRefs = useRef<Record<string, Matter.Body>>({});
  
  // Store previous velocities to calculate acceleration
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

  // Duration limit is now a required finite number, default 10, min 1.
  const [maxDuration, setMaxDuration] = useState<number>(10);

  // State for graph data - one array per graph
  const [graphData, setGraphData] = useState<DataPoint[][]>(() => graphs.map(() => []));
  const isRunningRef = useRef(isRunning);

  // Pre-compute / replay state
  const [precomputeState, setPrecomputeState] = useState<PrecomputeState>('idle');
  const [precomputeProgress, setPrecomputeProgress] = useState<PrecomputeProgress | null>(null);
  // 'idle' in live mode, 'precomputing' while recording, 'replay' while playing back.
  const jsonModeRef = useRef<'idle' | 'precomputing' | 'replay'>('idle');
  const frameCacheRef = useRef<Frame[] | null>(null);
  const recordingBufferRef = useRef<Frame[] | null>(null);
  // Tracks replay playhead so the next play click knows whether to resume or rewind.
  const replayCursorRef = useRef<number>(0);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  // Callback when simulation controls are ready
  const handleControlsReady = useCallback((controls: SimulationControls) => {
    setSimulationControls(controls);
    simulationControlsRef.current = controls;
  }, []);

  // Replay callback: apply a recorded frame to bodies/outputs/graphs.
  const handleReplayFrame = useCallback((frameIndex: number) => {
    const frames = frameCacheRef.current;
    if (!frames || frameIndex >= frames.length) return;
    const frame = frames[frameIndex];

    // Index bodies by Matter id for this lookup.
    const byId = new Map<number, Matter.Body>();
    for (const id in objRefs.current) {
      const body = objRefs.current[id];
      if (body) byId.set(body.id, body);
    }
    frame.bodies.forEach((snap) => {
      const body = byId.get(snap.id);
      if (body) {
        Matter.Body.setPosition(body, { x: snap.x, y: snap.y });
        Matter.Body.setAngle(body, snap.angle);
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

  // Helper function to get nested property value
  const getNestedValue = (obj: any, path: string): any => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  // Helper function to set nested property value
  const setNestedValue = (obj: any, path: string, value: any): void => {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => current[key], obj);
    target[lastKey] = value;
  };

  // Helper function to clamp very small values to zero
  const clampToZero = (value: number): number => {
    return Math.abs(value) < 0.01 ? 0 : value;
  };

  // Handle control changes - value is in real-world units, convert to pixels for Matter.js
  const handleControlChange = useCallback((control: typeof controls[0], value: number) => {
    setControlValues((prev) => ({
      ...prev,
      [control.label]: value,
    }));

    // Update the object property
    const obj = objRefs.current[control.targetObj];
    if (obj && control.property) {
      if (control.property.startsWith('velocity.')) {
        // Special handling for velocity - convert from real units to pixels
        const axis = control.property.split('.')[1] as 'x' | 'y';
        const pixelValue = axis === 'x' 
          ? unitConverter.toPixelsVelocityAccelerationX(value)
          : unitConverter.toPixelsVelocityAccelerationY(value);
        const currentVelocity = obj.velocity;
        const newVelocity = {
          x: axis === 'x' ? pixelValue : currentVelocity.x,
          y: axis === 'y' ? pixelValue : currentVelocity.y,
        };
        Matter.Body.setVelocity(obj, newVelocity);
      } else if (control.property.startsWith('position.')) {
        // Special handling for position - convert from real units to pixels
        const axis = control.property.split('.')[1] as 'x' | 'y';
        const pixelValue = axis === 'x'
          ? unitConverter.toPixelsX(value)
          : unitConverter.toPixelsY(value);
        const currentPosition = obj.position;
        const newPosition = {
          x: axis === 'x' ? pixelValue : currentPosition.x,
          y: axis === 'y' ? pixelValue : currentPosition.y,
        };
        Matter.Body.setPosition(obj, newPosition);
      } else {
        // Generic property update (no conversion needed for non-spatial properties)
        setNestedValue(obj, control.property, value);
      }
    }
  }, [unitConverter]);

  // Helper to convert a pixel value to real-world units based on property type
  const convertPixelToRealUnit = useCallback((property: string, pixelValue: number): number => {
    return unitConverter.fromPixelsProperty(property, pixelValue);
  }, [unitConverter]);

  // Update loop to read output values and graph data.
  // During 'replay', playback is driven by onReplayFrame instead — short-circuit.
  const handleUpdate = useCallback((_engine: Matter.Engine, time: number) => {
    if (jsonModeRef.current === 'replay') return;

    const isRecording = jsonModeRef.current === 'precomputing';

    // Calculate acceleration for all bodies (in pixel space)
    const deltaTime = time - prevTimeRef.current;
    if (deltaTime > 0) {
      // Use objects from the config to iterate through bodies
      objects.forEach((objectConfig) => {
        const body = objRefs.current[objectConfig.id];
        if (!body) return;
        
        const prevVelocity = prevVelocitiesRef.current[objectConfig.id];
        if (prevVelocity) {
          // Calculate acceleration as change in velocity over time (still in pixels)
          const acceleration = {
            x: (body.velocity.x - prevVelocity.x) / deltaTime,
            y: (body.velocity.y - prevVelocity.y) / deltaTime,
          };
          // Store acceleration on the body as a custom property
          (body as any).acceleration = acceleration;
        } else {
          // First frame - initialize acceleration to zero
          (body as any).acceleration = { x: 0, y: 0 };
        }
        // Store engine gravity so force arrows can include gravitational force.
        // Convert to the same units as the delta-v acceleration (pixels / seconds):
        //   Matter.js gravity adds gravity.scale * dt² to displacement per step,
        //   so the equivalent acceleration = gravity.scale * dt_ms² / dt_seconds
        //                                  = gravity.scale * deltaTime * 1e6
        const gScale = _engine.gravity.scale * deltaTime * 1e6;
        (body as any).gravityAcceleration = {
          x: _engine.gravity.x * gScale,
          y: _engine.gravity.y * gScale,
        };

        // Update previous velocity
        prevVelocitiesRef.current[objectConfig.id] = { ...body.velocity };
      });
    }
    prevTimeRef.current = time;

    // Collect output values and convert from pixels to real-world units
    const newOutputValues: Record<string, number> = {};
    
    outputs.forEach((group) => {
      group.values.forEach((output) => {
        const obj = objRefs.current[output.targetObj];
        if (obj) {
          const key = `${output.targetObj}.${output.property}`;
          const pixelValue = getNestedValue(obj, output.property);
          // Convert from pixels to real-world units
          newOutputValues[key] = convertPixelToRealUnit(output.property, pixelValue);
        }
      });
    });

    setOutputValues(newOutputValues);

    // Update simulation time (read by RenderLayer via ref)
    simulationTimeRef.current = time;

    // Compute graph data points for this frame (real-world units)
    const perFrameGraphPoints: DataPoint[] = graphs.map((graph) => {
      const dataPoint: DataPoint = { time };
      if (graph.type === 'line' && graph.lines) {
        graph.lines.forEach((line: LineConfig) => {
          const obj = objRefs.current[line.targetObj];
          if (obj) {
            const pixelValue = getNestedValue(obj, line.property);
            const realValue = convertPixelToRealUnit(line.property, pixelValue);
            dataPoint[line.label] = clampToZero(realValue);
          }
        });
      }
      return dataPoint;
    });

    if (graphs.length > 0 && (isRunningRef.current || isRecording)) {
      setGraphData((prevData) =>
        prevData.map((data, graphIndex) => [...data, perFrameGraphPoints[graphIndex]])
      );
    }

    if (isRecording && recordingBufferRef.current) {
      const bodies = objects
        .map((objectConfig) => {
          const body = objRefs.current[objectConfig.id];
          if (!body) return null;
          return { id: body.id, x: body.position.x, y: body.position.y, angle: body.angle };
        })
        .filter((b): b is { id: number; x: number; y: number; angle: number } => b !== null);
      recordingBufferRef.current.push({
        bodies,
        outputValues: newOutputValues,
        graphPoints: perFrameGraphPoints,
      });
    }
  }, [outputs, graphs, objects, convertPixelToRealUnit]);

  const handleEdit = async (editedJSON: any) => {
    if (!simulationId) return;
    try {
      const newSimulationId = await createSimulation(editedJSON, true, simulationId);
      // Trigger server-side update of changes_made column
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
      // Trigger server-side update of changes_made column
      updateChangesMade(newSimulationId);
      setShowJsonEditor(false);
      navigate(`/simulation/${newSimulationId}`);
    } catch (error) {
      console.error('Failed to save tweaked simulation:', error);
      alert('Failed to save tweaked simulation. Please try again.');
    }
  };

  const handlePickPosition = useCallback(() => {
    setShowExperimentalModal(false); // hide modal but keep form state
    setPickingPosition(true);
  }, []);

  const handleCanvasClick = useCallback((canvasX: number, canvasY: number) => {
    if (!pickingPosition) return;
    const realPos = unitConverter.fromPixelsPosition({ x: canvasX, y: canvasY });
    setPickedPosition(realPos);
    setPickingPosition(false);
    setShowExperimentalModal(true);
  }, [pickingPosition, unitConverter]);

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
          unitLabel={unitConverter.getUnitLabel()}
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

          // If a cached replay is ready: resume mid-stream, or rewind if at end.
          if (precomputeState === 'ready' && frameCacheRef.current) {
            const frames = frameCacheRef.current;
            if (replayCursorRef.current >= frames.length) {
              sim.startReplay(handleReplayFrame, frames.length);
            }
            sim.play();
            setIsRunning(true);
            return;
          }

          // Fresh pre-compute.
          const totalFrames = Math.max(1, Math.round(maxDuration * 30));
          recordingBufferRef.current = [];
          prevVelocitiesRef.current = {};
          prevTimeRef.current = 0;
          setGraphData(graphs.map(() => []));
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

          frameCacheRef.current = recordingBufferRef.current;
          recordingBufferRef.current = null;

          // Clear visible state before replay so replay's append-frame semantics start clean.
          setGraphData(graphs.map(() => []));

          jsonModeRef.current = 'replay';
          setPrecomputeState('ready');
          setPrecomputeProgress(null);
          sim.startReplay(handleReplayFrame, frameCacheRef.current.length);
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

          // Fully clear cache and return to idle so controls become editable again.
          frameCacheRef.current = null;
          recordingBufferRef.current = null;
          replayCursorRef.current = 0;
          jsonModeRef.current = 'idle';
          setPrecomputeState('idle');
          setPrecomputeProgress(null);
          sim.clearReplay();
          setIsRunning(false);
          setGraphData(graphs.map(() => []));
          prevVelocitiesRef.current = {};
          prevTimeRef.current = 0;

          // Re-apply control values so visible pose matches the live (editable) state.
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
              disabled={precomputeState !== 'idle'}
              onChange={(value: number | boolean) => handleControlChange(control, value as number)}
            />
          ))}
        </Panel>
        )}

        {/* Scale + Import Experimental Data */}
        <div className="col-start-1 row-start-2 justify-self-end flex flex-col gap-3 items-end">
          <Scale
            pixelsPerUnit={environment.pixelsPerUnit ?? 10}
            unit={environment.unit ?? 'm'}
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

        {/* Environment - use converted gravity scale */}
        <Environment walls={environment.walls} gravity={matterGravityScale} />
        
        {/* Objects - render with pixel-converted values */}
        {pixelObjects.map((object, index) => (
          <ObjectRenderer
            key={objects[index].id}
            ref={(ref) => {
              if (ref) {
                objRefs.current[objects[index].id] = ref;
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
        {/* Unified render layer (replaces Matter.Render and ExperimentalDataRenderer) */}
        <RenderLayer
          renderables={pixelRenderables}
          objRefs={objRefs}
          dataSources={dataSources}
          simulationTimeRef={simulationTimeRef}
          canvasContainer={canvasContainer}
        />
      </BaseSimulation>
    </div>
  );
}

export default JsonSimulation;

