import React, { useState, useRef, useCallback, useEffect } from 'react';
import Matter from 'matter-js';
import BaseSimulation from './BaseSimulation';
import Environment from './simulation_components/Environment';
import Box from './simulation_components/Box';
import ControlPanel from './simulation_components/ControlPanel';
import Slider from './simulation_components/Slider';
import Outputs from './simulation_components/Outputs';
import SimulationControls from './simulation_components/SimulationControls';
import Graph from './simulation_components/Graph';
import './JsonSimulation.css';

function JsonSimulation({ config }) {
  const {
    title,
    description,
    width = 800,
    height = 600,
    environment = {},
    boxes = [],
    controls = [],
    outputs = [],
    graphs = [],
  } = config;

  // Store refs to all boxes by their ID
  const boxRefs = useRef({});
  
  // State for control values
  const [controlValues, setControlValues] = useState(() => {
    const initialValues = {};
    controls.forEach((control) => {
      if (control.type === 'slider') {
        initialValues[control.label] = control.defaultValue;
      }
    });
    return initialValues;
  });

  // State for output values
  const [outputValues, setOutputValues] = useState({});

  // State for simulation controls
  const [simulationControls, setSimulationControls] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  // State for graph data - one array per graph
  const [graphData, setGraphData] = useState(() => graphs.map(() => []));
  const shouldClearGraphDataRef = useRef(false);

  // Callback when simulation controls are ready
  const handleControlsReady = useCallback((controls) => {
    setSimulationControls(controls);
  }, []);

  // Helper function to get nested property value
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  // Helper function to set nested property value
  const setNestedValue = (obj, path, value) => {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => current[key], obj);
    target[lastKey] = value;
  };

  // Handle control changes
  const handleControlChange = useCallback((control, value) => {
    setControlValues((prev) => ({
      ...prev,
      [control.label]: value,
    }));

    // Update the box property
    const box = boxRefs.current[control.targetBox];
    if (box && control.property) {
      if (control.property.startsWith('velocity.')) {
        // Special handling for velocity
        const axis = control.property.split('.')[1]; // 'x' or 'y'
        const currentVelocity = box.velocity;
        const newVelocity = {
          x: axis === 'x' ? value : currentVelocity.x,
          y: axis === 'y' ? value : currentVelocity.y,
        };
        Matter.Body.setVelocity(box, newVelocity);
      } else if (control.property.startsWith('position.')) {
        // Special handling for position
        const axis = control.property.split('.')[1]; // 'x' or 'y'
        const currentPosition = box.position;
        const newPosition = {
          x: axis === 'x' ? value : currentPosition.x,
          y: axis === 'y' ? value : currentPosition.y,
        };
        Matter.Body.setPosition(box, newPosition);
      } else {
        // Generic property update
        setNestedValue(box, control.property, value);
      }
    }
  }, []);

  // Update loop to read output values and graph data
  const handleUpdate = useCallback((engine, time) => {
    const newOutputValues = {};
    
    outputs.forEach((outputGroup) => {
      outputGroup.values.forEach((output) => {
        const box = boxRefs.current[output.targetBox];
        if (box) {
          const key = `${output.targetBox}.${output.property}`;
          newOutputValues[key] = getNestedValue(box, output.property);
        }
      });
    });

    setOutputValues(newOutputValues);

    // Collect graph data
    if (graphs.length > 0 && isRunning) {
      setGraphData((prevData) => {
        return prevData.map((data, graphIndex) => {
          const graph = graphs[graphIndex];
          const dataPoint = { time };

          // Collect all line values for this graph
          graph.lines.forEach((line) => {
            const box = boxRefs.current[line.targetBox];
            if (box) {
              dataPoint[line.label] = getNestedValue(box, line.property);
            }
          });

          return [...data, dataPoint];
        });
      });
    }
  }, [outputs, graphs, isRunning]);

  return (
    <div>
      <div className="simulation-header">
        <div className="simulation-info">
          {title && <h1 className="simulation-title">{title}</h1>}
          {description && (
            <p className="simulation-description">
              {description}
            </p>
          )}
        </div>
        <SimulationControls
          isRunning={isRunning}
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
      </div>

      
      
      <BaseSimulation
        width={width}
        height={height}
        onUpdate={handleUpdate}
        onControlsReady={handleControlsReady}
      >
        {/* Controls */}
        {controls.length > 0 && (
          <ControlPanel title="Controls" className="controls-left">
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
        <Environment walls={environment.walls || []} width={width} height={height} />
        
        {/* Boxes */}
        {boxes.map((box) => (
          <Box
            key={box.id}
            ref={(ref) => {
              if (ref) {
                boxRefs.current[box.id] = ref;
              }
            }}
            {...box}
          />
        ))}

        {/* Graphs */}
        {graphs.map((graph, graphIndex) => (
          <ControlPanel key={graphIndex} className="graphs-right">
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
          <ControlPanel className="outputs-bottom">
            {outputs.map((outputGroup, groupIndex) => (
              <div key={groupIndex}>
                {outputGroup.title && <h4 className="output-group-title">{outputGroup.title}</h4>}
                {outputGroup.values.map((output, outputIndex) => {
                  const key = `${output.targetBox}.${output.property}`;
                  return (
                    <Outputs
                      key={outputIndex}
                      label={output.label}
                      value={outputValues[key] || 0}
                      unit={output.unit || ''}
                    />
                  );
                })}
              </div>
            ))}
          </ControlPanel>
        )}
      </BaseSimulation>
    </div>
  );
}

export default JsonSimulation;

