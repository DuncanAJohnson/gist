import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { PhysicsProvider } from '../contexts/PhysicsContext';
import './BaseSimulation.css';

function BaseSimulation({ width = 800, height = 600, onInit, onUpdate, children, onControlsReady }) {
  const sceneRef = useRef(null);
  const engineRef = useRef(null);
  const renderRef = useRef(null);
  const [engineReady, setEngineReady] = useState(false);
  const isRunningRef = useRef(true);
  const initialBodiesRef = useRef([]);

  useEffect(() => {
    // Create engine
    const engine = Matter.Engine.create();
    engineRef.current = engine;

    // Create renderer
    const render = Matter.Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: width,
        height: height,
        wireframes: false,
        background: '#fafafa',
      },
    });
    renderRef.current = render;

    // Mark engine as ready so children can use it
    setEngineReady(true);

    // Call initialization callback
    if (onInit) {
      onInit(engine, render);
    }

    // Run the renderer
    Matter.Render.run(render);

    // Save initial state for reset
    setTimeout(() => {
      initialBodiesRef.current = engine.world.bodies.map(body => ({
        id: body.id,
        position: { ...body.position },
        velocity: { ...body.velocity },
        angle: body.angle,
        angularVelocity: body.angularVelocity,
      }));
    }, 100);

    // Manual animation loop using Engine.update
    let lastTime = performance.now();
    let animationFrameId;
    
    const updateLoop = (currentTime) => {
      const delta = currentTime - lastTime;
      lastTime = currentTime;
      
      // Only step the simulation if running
      if (isRunningRef.current) {
        Matter.Engine.update(engine, delta);
      }
      
      // Call user update callback
      if (onUpdate) {
        onUpdate(engine);
      }
      
      animationFrameId = requestAnimationFrame(updateLoop);
    };
    
    animationFrameId = requestAnimationFrame(updateLoop);

    // Expose control methods
    if (onControlsReady) {
      onControlsReady({
        play: () => {
          isRunningRef.current = true;
        },
        pause: () => {
          isRunningRef.current = false;
        },
        reset: () => {
          // Reset all bodies to initial state
          initialBodiesRef.current.forEach(initialBody => {
            const body = engine.world.bodies.find(b => b.id === initialBody.id);
            if (body) {
              Matter.Body.setPosition(body, initialBody.position);
              Matter.Body.setVelocity(body, initialBody.velocity);
              Matter.Body.setAngle(body, initialBody.angle);
              Matter.Body.setAngularVelocity(body, initialBody.angularVelocity);
            }
          });
          isRunningRef.current = false;
        },
      });
    }

    // Cleanup
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      Matter.Render.stop(render);
      Matter.Engine.clear(engine);
      render.canvas.remove();
      render.textures = {};
      setEngineReady(false);
    };
  }, [width, height, onInit, onUpdate, onControlsReady]);

  return (
    <div className="simulation-container">
      <div className="simulation-canvas" ref={sceneRef} />
      {engineReady && engineRef.current && (
        <PhysicsProvider engine={engineRef.current}>
          {children && (
            <div className="simulation-controls">
              {children}
            </div>
          )}
        </PhysicsProvider>
      )}
    </div>
  );
}

export default BaseSimulation;

