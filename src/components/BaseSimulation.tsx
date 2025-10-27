import { useEffect, useRef, useState, ReactNode } from 'react';
import Matter from 'matter-js';
import { PhysicsProvider } from '../contexts/PhysicsContext';

interface SimulationControls {
  play: () => void;
  pause: () => void;
  reset: () => void;
}

interface BaseSimulationProps {
  onInit?: (engine: Matter.Engine, render: Matter.Render) => void;
  onUpdate?: (engine: Matter.Engine, time: number) => void;
  children?: ReactNode;
  onControlsReady?: (controls: SimulationControls) => void;
}

export const BASE_SIMULATION_WIDTH = 800;
export const BASE_SIMULATION_HEIGHT = 600;

function BaseSimulation({ 
  onInit, 
  onUpdate, 
  children, 
  onControlsReady 
}: BaseSimulationProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const isRunningRef = useRef(false);
  const initialBodiesRef = useRef<Array<{
    id: number;
    position: { x: number; y: number };
    velocity: { x: number; y: number };
    angle: number;
    angularVelocity: number;
  }>>([]);
  const simulationTimeRef = useRef(0);

  useEffect(() => {
    if (!sceneRef.current) return;

    // Create engine
    const engine = Matter.Engine.create();
    engineRef.current = engine;

    // Create renderer
    const render = Matter.Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: 800,
        height: 600,
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
    let animationFrameId: number;
    
    const updateLoop = (currentTime: number) => {
      const delta = currentTime - lastTime;
      lastTime = currentTime;
      
      // Only step the simulation if running
      if (isRunningRef.current) {
        Matter.Engine.update(engine, delta);
        // Increment simulation time (convert milliseconds to seconds)
        simulationTimeRef.current += delta / 1000;
      }
      
      // Call user update callback with engine and current simulation time
      if (onUpdate) {
        onUpdate(engine, simulationTimeRef.current);
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
          simulationTimeRef.current = 0;
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
  }, [onInit, onUpdate, onControlsReady]);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] grid-rows-[auto_auto] gap-8 items-start px-8 py-8 max-w-[1800px] mx-auto">
      <div className="col-start-2 row-start-1 rounded-lg shadow-md overflow-hidden" ref={sceneRef}>
        {/* Canvas will be rendered here */}
      </div>
      {engineReady && engineRef.current && (
        <PhysicsProvider engine={engineRef.current}>
          {children && (
            <div className="contents">
              {children}
            </div>
          )}
        </PhysicsProvider>
      )}
    </div>
  );
}

export default BaseSimulation;

