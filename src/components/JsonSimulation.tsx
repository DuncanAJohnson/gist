import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Matter from 'matter-js';
import BaseSimulation from './BaseSimulation';
import Environment from './simulation_components/Environment';
import Object from './simulation_components/Object';
import ControlPanel from './simulation_components/ControlPanel';
import Slider from './simulation_components/Slider';
import Outputs from './simulation_components/Outputs';
import SimulationHeader from './simulation_components/SimulationHeader';
import Graph from './simulation_components/Graph';
import JsonEditor from './JsonEditor';
import { createSimulation, updateChangesMade } from '../lib/simulationService';

interface SimulationConfig {
  title?: string;
  description?: string;
  environment: {
    walls: string[];
    gravity: number;
  };
  objects?: Array<{
    id: string;
    shape: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    color?: string;
    velocity?: { x: number; y: number };
    restitution?: number;
  }>;
  controls?: Array<{
    type: string;
    label: string;
    targetObj: string;
    property: string;
    defaultValue: number;
    min: number;
    max: number;
    step: number;
  }>;
  outputs?: Array<{
    title?: string;
    values: Array<{
      label: string;
      targetObj: string;
      property: string;
      unit?: string;
    }>;
  }>;
  graphs?: Array<{
    title: string;
    yAxisRange: {
      min: number;
      max: number;
    };
    lines: Array<{
      label: string;
      color: string;
      targetObj: string;
      property: string;
    }>;
  }>;
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

interface DataPoint {
  time: number;
  [key: string]: number;
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
        initialValues[control.label] = control.defaultValue;
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
    
    outputs.forEach((outputGroup) => {
      outputGroup.values.forEach((output) => {
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

          // Collect all line values for this graph
          graph.lines.forEach((line) => {
            const obj = objRefs.current[line.targetObj];
            if (obj) {
              const value = getNestedValue(obj, line.property);
              dataPoint[line.label] = clampToZero(value);
            }
          });

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
          <ControlPanel title="Controls" className="col-start-1 row-start-1">
            {controls.map((control, index) => {
              if (control.type === 'slider') {
                return (
                  <Slider
                    key={index}
                    label={control.label}
                    value={controlValues[control.label] || 0}
                    onChange={(value) => handleControlChange(control, value)}
                    min={control.min}
                    max={control.max}
                    step={control.step}
                  />
                );
              }
              return null;
            })}
          </ControlPanel>
        )}

        {/* Environment */}
        <Environment walls={environment.walls} gravity={environment.gravity} />
        
        {/* Objects */}
        {objects.map((object) => (
          <Object
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
          <ControlPanel key={graphIndex} className="col-start-3 row-start-1">
            <Graph
              title={graph.title}
              data={graphData[graphIndex] || []}
              config={{
                yAxisRange: graph.yAxisRange,
                lines: graph.lines,
              }}
            />
          </ControlPanel>
        ))}

        {/* Outputs */}
        {outputs.length > 0 && (
          <ControlPanel className="col-start-2 row-start-2 min-w-[800px] justify-center">
            <div className="flex flex-row gap-4 justify-center">
              {outputs.map((outputGroup, groupIndex) => (
                <div key={groupIndex}>
                  {outputGroup.title && (
                    <h4 className="mt-4 first:mt-0 mb-2 text-sm text-gray-700 font-semibold border-b border-gray-300 pb-1">
                      {outputGroup.title}
                    </h4>
                  )}
                  <div className="flex flex-col gap-2">
                    {outputGroup.values.map((output, outputIndex) => {
                      const key = `${output.targetObj}.${output.property}`;
                      return (
                        <Outputs
                          key={outputIndex}
                          label={output.label}
                          value={clampToZero(outputValues[key] || 0)}
                          unit={output.unit || ''}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ControlPanel>
        )}
      </BaseSimulation>
    </div>
  );
}

export default JsonSimulation;

