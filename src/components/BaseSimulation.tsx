import { useEffect, useRef, useState, ReactNode } from 'react';
import Matter from 'matter-js';
import { PhysicsProvider } from '../contexts/PhysicsContext';

export type SimulationMode = 'live' | 'precomputing' | 'replay';

export interface SimulationControls {
  play: () => void;
  pause: () => void;
  reset: () => void;
  precompute: (
    totalFrames: number,
    onBatch: (framesDone: number) => void
  ) => Promise<void>;
  startReplay: (
    onFrame: (frameIndex: number) => void,
    totalFrames: number
  ) => void;
  clearReplay: () => void;
}

interface BaseSimulationProps {
  onInit?: (engine: Matter.Engine) => void;
  onUpdate?: (engine: Matter.Engine, time: number) => void;
  children?: ReactNode;
  onControlsReady?: (controls: SimulationControls) => void;
  onCanvasContainerReady?: (container: HTMLDivElement) => void;
  onCanvasClick?: (canvasX: number, canvasY: number) => void;
  pickingPosition?: boolean;
}

// Wall thickness for environment boundaries
export const WALL_THICKNESS = 40;

// Usable simulation space dimensions (where objects can be placed)
export const SIMULATION_WIDTH = 800;
export const SIMULATION_HEIGHT = 600;

// Total canvas dimensions (includes walls on all sides)
export const CANVAS_WIDTH = SIMULATION_WIDTH + 2 * WALL_THICKNESS;
export const CANVAS_HEIGHT = SIMULATION_HEIGHT + 2 * WALL_THICKNESS;

// Coordinate transformation helpers:
// Simulation (0, 0) is at the bottom-left of the usable space
// Canvas coordinates have y increasing downward, simulation has y increasing upward
export const simToCanvasX = (simX: number) => simX + WALL_THICKNESS;
export const simToCanvasY = (simY: number) => CANVAS_HEIGHT - WALL_THICKNESS - simY;
export const canvasToSimX = (canvasX: number) => canvasX - WALL_THICKNESS;
export const canvasToSimY = (canvasY: number) => CANVAS_HEIGHT - WALL_THICKNESS - canvasY;

// 30 FPS fixed timestep for both live physics and pre-computed playback.
const FIXED_TIME_STEP = 1000 / 30;
const FIXED_DT_SECONDS = FIXED_TIME_STEP / 1000;
const MAX_DELTA = FIXED_TIME_STEP * 3;
const PRECOMPUTE_BATCH = 30;

function BaseSimulation({
  onInit,
  onUpdate,
  children,
  onControlsReady,
  onCanvasContainerReady,
  onCanvasClick,
  pickingPosition,
}: BaseSimulationProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const isRunningRef = useRef(false);
  const modeRef = useRef<SimulationMode>('live');
  const initialBodiesRef = useRef<Array<{
    id: number;
    position: { x: number; y: number };
    velocity: { x: number; y: number };
    angle: number;
    angularVelocity: number;
  }>>([]);
  const simulationTimeRef = useRef(0);
  const replayIndexRef = useRef(0);
  const replayTotalRef = useRef(0);
  const replayOnFrameRef = useRef<((frameIndex: number) => void) | null>(null);

  useEffect(() => {
    if (!sceneRef.current) return;

    const engine = Matter.Engine.create();
    engineRef.current = engine;

    sceneRef.current.style.width = `${CANVAS_WIDTH}px`;
    sceneRef.current.style.height = `${CANVAS_HEIGHT}px`;
    sceneRef.current.style.backgroundColor = '#fafafa';

    setEngineReady(true);

    if (onCanvasContainerReady) {
      onCanvasContainerReady(sceneRef.current);
    }

    if (onInit) {
      onInit(engine);
    }

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

    let lastTime = performance.now();
    let accumulator = 0;
    let animationFrameId: number;

    const resetBodiesToInitial = () => {
      initialBodiesRef.current.forEach(initialBody => {
        const body = engine.world.bodies.find(b => b.id === initialBody.id);
        if (body) {
          Matter.Body.setPosition(body, initialBody.position);
          Matter.Body.setVelocity(body, initialBody.velocity);
          Matter.Body.setAngle(body, initialBody.angle);
          Matter.Body.setAngularVelocity(body, initialBody.angularVelocity);
        }
      });
    };

    const updateLoop = (currentTime: number) => {
      let delta = currentTime - lastTime;
      lastTime = currentTime;

      if (modeRef.current === 'precomputing') {
        // Pre-compute path drives itself via its own async loop; the rAF
        // loop here is a no-op so it can't double-step the engine.
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      if (isRunningRef.current) {
        if (delta > MAX_DELTA) delta = MAX_DELTA;
        accumulator += delta;

        while (accumulator >= FIXED_TIME_STEP) {
          if (modeRef.current === 'replay') {
            const idx = replayIndexRef.current;
            if (idx >= replayTotalRef.current) {
              isRunningRef.current = false;
              accumulator = 0;
              break;
            }
            replayOnFrameRef.current?.(idx);
            replayIndexRef.current = idx + 1;
            simulationTimeRef.current += FIXED_DT_SECONDS;
          } else {
            if (onUpdate) {
              onUpdate(engine, simulationTimeRef.current);
            }
            Matter.Engine.update(engine, FIXED_TIME_STEP);
            simulationTimeRef.current += FIXED_DT_SECONDS;
          }
          accumulator -= FIXED_TIME_STEP;
        }
      } else if (modeRef.current === 'live' && onUpdate) {
        // When paused in live mode, still call onUpdate so output displays
        // reflect immediate control changes.
        onUpdate(engine, simulationTimeRef.current);
      }

      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);

    if (onControlsReady) {
      onControlsReady({
        play: () => {
          isRunningRef.current = true;
          // Kick the timestep so the accumulator starts from "now" and
          // we don't burn off a giant delta.
          lastTime = performance.now();
          accumulator = 0;
        },
        pause: () => {
          isRunningRef.current = false;
        },
        reset: () => {
          resetBodiesToInitial();
          isRunningRef.current = false;
          simulationTimeRef.current = 0;
          accumulator = 0;
          replayIndexRef.current = 0;
        },
        precompute: async (totalFrames, onBatch) => {
          resetBodiesToInitial();
          modeRef.current = 'precomputing';
          isRunningRef.current = false;
          simulationTimeRef.current = 0;
          accumulator = 0;

          let done = 0;
          while (done < totalFrames) {
            const batchEnd = Math.min(totalFrames, done + PRECOMPUTE_BATCH);
            for (; done < batchEnd; done++) {
              if (onUpdate) {
                onUpdate(engine, simulationTimeRef.current);
              }
              Matter.Engine.update(engine, FIXED_TIME_STEP);
              simulationTimeRef.current += FIXED_DT_SECONDS;
            }
            onBatch(done);
            if (done < totalFrames) {
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() => resolve())
              );
            }
          }
        },
        startReplay: (onFrame, totalFrames) => {
          modeRef.current = 'replay';
          replayOnFrameRef.current = onFrame;
          replayTotalRef.current = totalFrames;
          replayIndexRef.current = 0;
          simulationTimeRef.current = 0;
          accumulator = 0;
          lastTime = performance.now();
          // Apply frame 0 immediately so the initial pose is visible.
          if (totalFrames > 0) {
            onFrame(0);
            replayIndexRef.current = 1;
            simulationTimeRef.current = FIXED_DT_SECONDS;
          }
        },
        clearReplay: () => {
          modeRef.current = 'live';
          replayOnFrameRef.current = null;
          replayTotalRef.current = 0;
          replayIndexRef.current = 0;
          isRunningRef.current = false;
          simulationTimeRef.current = 0;
          accumulator = 0;
          resetBodiesToInitial();
        },
      });
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      Matter.Engine.clear(engine);
      setEngineReady(false);
    };
  }, [onInit, onUpdate, onControlsReady, onCanvasContainerReady]);

  useEffect(() => {
    if (!pickingPosition || !onCanvasClick || !sceneRef.current) return;

    const container = sceneRef.current;
    const handleClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;
      onCanvasClick(canvasX, canvasY);
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [pickingPosition, onCanvasClick]);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] grid-rows-[auto_auto] gap-8 items-start px-8 py-8 max-w-[1800px] mx-auto">
      <div className={`col-start-2 row-start-1 rounded-lg shadow-md overflow-hidden ${pickingPosition ? 'cursor-crosshair' : ''}`} ref={sceneRef}>
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
