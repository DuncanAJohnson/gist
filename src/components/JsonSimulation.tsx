import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Matter from 'matter-js';
import BaseSimulation from './BaseSimulation';
import Environment from './simulation_components/Environment';
import Panel from './simulation_components/Panel';
import SimulationHeader from './simulation_components/SimulationHeader';
import JsonEditor from './JsonEditor';
import { createSimulation, updateChangesMade } from '../lib/simulationService';
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

interface SimulationConfig {
  title?: string;
  description?: string;
  environment: {
    walls: string[];
    gravity: number;
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

interface SimulationControls {
  play: () => void;
  pause: () => void;
  reset: () => void;
}

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
  } = config;

  const [showJsonEditor, setShowJsonEditor] = useState(false);

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
  const [isRunning, setIsRunning] = useState(false);

  // State for graph data - one array per graph
  const [graphData, setGraphData] = useState<DataPoint[][]>(() => graphs.map(() => []));
  const shouldClearGraphDataRef = useRef(false);
  const isRunningRef = useRef(isRunning);

  // Keep ref in sync with state
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  // Callback when simulation controls are ready
  const handleControlsReady = useCallback((controls: SimulationControls) => {
    setSimulationControls(controls);
  }, []);

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

  // Handle control changes
  const handleControlChange = useCallback((control: typeof controls[0], value: number) => {
    setControlValues((prev) => ({
      ...prev,
      [control.label]: value,
    }));

    // Update the object property
    const obj = objRefs.current[control.targetObj];
    if (obj && control.property) {
      if (control.property.startsWith('velocity.')) {
        // Special handling for velocity
        const axis = control.property.split('.')[1] as 'x' | 'y';
        const currentVelocity = obj.velocity;
        const newVelocity = {
          x: axis === 'x' ? value : currentVelocity.x,
          y: axis === 'y' ? value : currentVelocity.y,
        };
        Matter.Body.setVelocity(obj, newVelocity);
      } else if (control.property.startsWith('position.')) {
        // Special handling for position
        const axis = control.property.split('.')[1] as 'x' | 'y';
        const currentPosition = obj.position;
        const newPosition = {
          x: axis === 'x' ? value : currentPosition.x,
          y: axis === 'y' ? value : currentPosition.y,
        };
        Matter.Body.setPosition(obj, newPosition);
      } else {
        // Generic property update
        setNestedValue(obj, control.property, value);
      }
    }
  }, []);

  // Update loop to read output values and graph data
  const handleUpdate = useCallback((_engine: Matter.Engine, time: number) => {
    // Calculate acceleration for all bodies
    const deltaTime = time - prevTimeRef.current;
    if (deltaTime > 0) {
      // Use objects from the config to iterate through bodies
      objects.forEach((objectConfig) => {
        const body = objRefs.current[objectConfig.id];
        if (!body) return;
        
        const prevVelocity = prevVelocitiesRef.current[objectConfig.id];
        if (prevVelocity) {
          // Calculate acceleration as change in velocity over time
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
        // Update previous velocity
        prevVelocitiesRef.current[objectConfig.id] = { ...body.velocity };
      });
    }
    prevTimeRef.current = time;

    const newOutputValues: Record<string, number> = {};
    
    outputs.forEach((group) => {
      group.values.forEach((output) => {
        const obj = objRefs.current[output.targetObj];
        if (obj) {
          const key = `${output.targetObj}.${output.property}`;
          newOutputValues[key] = getNestedValue(obj, output.property);
        }
      });
    });

    setOutputValues(newOutputValues);

    // Collect graph data
    if (graphs.length > 0 && isRunningRef.current) {
      setGraphData((prevData) => {
        return prevData.map((data, graphIndex) => {
          const graph = graphs[graphIndex];
          const dataPoint: DataPoint = { time };

          // Collect all line values for this graph (line graphs have lines property)
          if (graph.type === 'line' && graph.lines) {
            graph.lines.forEach((line: LineConfig) => {
              const obj = objRefs.current[line.targetObj];
              if (obj) {
                const value = getNestedValue(obj, line.property);
                dataPoint[line.label] = clampToZero(value);
              }
            });
          }

          return [...data, dataPoint];
        });
      });
    }
  }, [outputs, graphs]);

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

  return (
    <div>
      {showJsonEditor && (
        <JsonEditor
          initialJSON={config}
          onSave={handleSaveTweakedJSON}
          onClose={() => setShowJsonEditor(false)}
        />
      )}
      <SimulationHeader
        title={title}
        description={description}
        isRunning={isRunning}
        simulationId={simulationId}
        currentJSON={config}
        onEdit={simulationId ? handleEdit : undefined}
        onTweakJSON={simulationId ? handleTweakJSON : undefined}
        onPlay={() => {
          // Clear graph data if we just reset
          if (shouldClearGraphDataRef.current) {
            setGraphData(graphs.map(() => []));
            shouldClearGraphDataRef.current = false;
          }
          simulationControls?.play();
          setIsRunning(true);
        }}
        onPause={() => {
          simulationControls?.pause();
          setIsRunning(false);
        }}
        onReset={() => {
          simulationControls?.reset();
          setIsRunning(false);
          // Mark that we should clear graph data on next play
          shouldClearGraphDataRef.current = true;
          // Reset acceleration tracking
          prevVelocitiesRef.current = {};
          prevTimeRef.current = 0;
          // Re-apply all control values after reset
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
      >
        {/* Controls */}
        {controls.length > 0 && (
          <Panel title="Controls" className="col-start-1 row-start-1">
          {controls.map((control) => (
            <ControlRenderer
              key={`${control.targetObj}.${control.property}`}
              control={control}
              value={controlValues[control.label]}
              onChange={(value: number | boolean) => handleControlChange(control, value as number)}
            />
          ))}
        </Panel>
        )}

        {/* Environment */}
        <Environment walls={environment.walls} gravity={environment.gravity} />
        
        {/* Objects */}
        {objects.map((object) => (
          <ObjectRenderer
            key={object.id}
            ref={(ref) => {
              if (ref) {
                objRefs.current[object.id] = ref;
              }
            }}
            {...object}
          />
        ))}

        {/* Graphs */}
        {graphs.map((graph, graphIndex) => (
          <Panel key={graphIndex} className="col-start-3 row-start-1">
            <GraphRenderer
              config={graph}
              data={graphData[graphIndex] || []}
            />
          </Panel>
        ))}

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
      </BaseSimulation>
    </div>
  );
}

export default JsonSimulation;

