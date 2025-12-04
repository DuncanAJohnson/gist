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
        width: BASE_SIMULATION_WIDTH,
        height: BASE_SIMULATION_HEIGHT,
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

    // Note: Render.run() removed to eliminate dual animation loop
    // Rendering now handled manually via Render.world() in updateLoop

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

    // Manual animation loop using Engine.update with fixed time step
    const FIXED_TIME_STEP = 1000 / 60; // 16.67ms for 60 FPS
    const MAX_DELTA = FIXED_TIME_STEP * 3; // Cap at 3 frames to prevent spiral of death

    // Debug logging configuration
    const ENABLE_DEBUG = false; // Easy toggle for all debug logging
    const DEBUG_FRAME_COUNT = 30; // Log first 30 frames when running

    let lastTime = performance.now();
    let accumulator = 0;
    let animationFrameId: number;
    let frameCount = 0; // Track total frame number
    let debugFrameCounter = 0; // Track running frame number for debug logs

    const updateLoop = (currentTime: number) => {
      let delta = currentTime - lastTime;
      lastTime = currentTime;
      frameCount++;

      // Only step the simulation if running
      if (isRunningRef.current) {
        debugFrameCounter++; // Increment only when running

        // Debug: Log first N frames when RUNNING
        if (ENABLE_DEBUG && debugFrameCounter <= DEBUG_FRAME_COUNT) {
          const isDeltaCapped = delta > MAX_DELTA;
          console.log(
            `[RUNNING Frame ${debugFrameCounter}/${frameCount}] ` +
            `delta: ${delta.toFixed(2)}ms` +
            `${isDeltaCapped ? ' (CAPPED to ' + MAX_DELTA.toFixed(2) + 'ms)' : ''}, ` +
            `accumulator: ${accumulator.toFixed(2)}ms`
          );
        }

        // Cap delta to prevent large jumps (e.g., initial frame, tab switching)
        if (delta > MAX_DELTA) {
          delta = MAX_DELTA;
        }

        // Add frame time to accumulator (only when running!)
        accumulator += delta;
        let stepsThisFrame = 0;

        // Run physics updates in fixed time steps
        while (accumulator >= FIXED_TIME_STEP) {
          // Call user update callback BEFORE physics step (for force application, etc.)
          if (onUpdate) {
            onUpdate(engine, simulationTimeRef.current);
          }

          // Step physics with fixed time step
          Matter.Engine.update(engine, FIXED_TIME_STEP);

          // Increment simulation time
          simulationTimeRef.current += FIXED_TIME_STEP / 1000;
          accumulator -= FIXED_TIME_STEP;
          stepsThisFrame++;
        }

        // Debug: Log physics steps and object positions for initial frames
        if (ENABLE_DEBUG && debugFrameCounter <= DEBUG_FRAME_COUNT && stepsThisFrame > 0) {
          console.log(
            `[RUNNING Frame ${debugFrameCounter}] ` +
            `Executed ${stepsThisFrame} physics step(s), ` +
            `remaining accumulator: ${accumulator.toFixed(2)}ms`
          );

          // Log positions of all dynamic bodies
          const dynamicBodies = engine.world.bodies.filter(b => !b.isStatic);
          if (dynamicBodies.length > 0) {
            console.log(`[RUNNING Frame ${debugFrameCounter}] Object positions:`);
            dynamicBodies.forEach(body => {
              console.log(
                `  - Body ${body.id}: ` +
                `pos(${body.position.x.toFixed(1)}, ${body.position.y.toFixed(1)}), ` +
                `vel(${body.velocity.x.toFixed(2)}, ${body.velocity.y.toFixed(2)})`
              );
            });
          }
        }
      } else {
        // PAUSED state - log periodically
        if (ENABLE_DEBUG && frameCount % 60 === 0) {
          console.log(`[PAUSED Frame ${frameCount}] Waiting... (delta: ${delta.toFixed(2)}ms)`);
        }

        // When paused, still call onUpdate for output display
        if (onUpdate) {
          onUpdate(engine, simulationTimeRef.current);
        }
      }

      // Render current state (always render, even when paused)
      Matter.Render.world(render);

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
          accumulator = 0; // Clear accumulated time
          debugFrameCounter = 0; // Reset for fresh debug logs
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
