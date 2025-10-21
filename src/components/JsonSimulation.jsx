import React, { useState, useRef, useCallback, useEffect } from 'react';
import Matter from 'matter-js';
import BaseSimulation from './BaseSimulation';
import Environment from './simulation_components/Environment';
import Box from './simulation_components/Box';
import ControlPanel from './simulation_components/ControlPanel';
import Slider from './simulation_components/Slider';
import Outputs from './simulation_components/Outputs';
import SimulationControls from './simulation_components/SimulationControls';
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
  const [isRunning, setIsRunning] = useState(true);

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

  // Update loop to read output values
  const handleUpdate = useCallback(() => {
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
  }, [outputs]);

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
          }}
        />
      </div>
      
      <BaseSimulation
        width={width}
        height={height}
        onUpdate={handleUpdate}
        onControlsReady={handleControlsReady}
      >
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

        {/* Controls */}
        {controls.length > 0 && (
          <ControlPanel title="Controls">
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

        {/* Outputs */}
        {outputs.map((outputGroup, groupIndex) => (
          <ControlPanel key={groupIndex} title={outputGroup.title}>
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
          </ControlPanel>
        ))}
      </BaseSimulation>
    </div>
  );
}

export default JsonSimulation;

