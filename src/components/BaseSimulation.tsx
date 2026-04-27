import { useEffect, useRef, useState, ReactNode } from 'react';
import { PhysicsProvider } from '../contexts/PhysicsContext';
import { createPhysicsAdapter, type PhysicsEngineKind } from '../physics';
import type { PhysicsAdapter, WorldSnapshot } from '../physics/types';

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
    onFrame: (frameIndex: number, options?: { seek?: boolean }) => void,
    totalFrames: number
  ) => void;
  seekReplay: (frameIndex: number) => void;
  clearReplay: () => void;
  /**
   * Re-capture the "initial" world snapshot used by reset(). Call after
   * mutating object configs (e.g. user edits while paused) so subsequent
   * reset()/precompute() use the edited state as the starting pose.
   */
  recaptureInitialSnapshot: () => void;
}

interface BaseSimulationProps {
  physicsEngine?: PhysicsEngineKind;
  onInit?: (adapter: PhysicsAdapter) => void;
  onUpdate?: (adapter: PhysicsAdapter, time: number) => void;
  children?: ReactNode;
  onControlsReady?: (controls: SimulationControls) => void;
  onCanvasContainerReady?: (container: HTMLDivElement) => void;
  onCanvasClick?: (canvasX: number, canvasY: number) => void;
  pickingPosition?: boolean;
  precomputeTimestepSeconds?: number;
  playbackSpeed?: number;
  /** Optional override for the active engine's solver iteration count. */
  solverIterations?: number;
  /** Optional override for Planck's position-iteration count; ignored by other engines. */
  positionIterations?: number;
}

// Wall thickness for environment boundaries
export const WALL_THICKNESS = 40;

// Usable simulation space dimensions (where objects can be placed)
export const SIMULATION_WIDTH = 800;
export const SIMULATION_HEIGHT = 600;

// Total canvas dimensions (includes walls on all sides)
export const CANVAS_WIDTH = SIMULATION_WIDTH + 2 * WALL_THICKNESS;
export const CANVAS_HEIGHT = SIMULATION_HEIGHT + 2 * WALL_THICKNESS;

// 60 FPS fixed timestep for both live physics and pre-computed playback.
const FIXED_TIME_STEP = 1000 / 60;
const FIXED_DT_SECONDS = FIXED_TIME_STEP / 1000;
const MAX_DELTA = FIXED_TIME_STEP * 3;
const PRECOMPUTE_BATCH = 60;
const DEFAULT_PRECOMPUTE_TIMESTEP_SECONDS = 1 / 480;

function cloneSnapshot(snap: WorldSnapshot): WorldSnapshot {
  return {
    t: snap.t,
    bodies: snap.bodies.map((b) => ({
      id: b.id,
      position: { x: b.position.x, y: b.position.y },
      velocity: { x: b.velocity.x, y: b.velocity.y },
      angle: b.angle,
      angularVelocity: b.angularVelocity,
    })),
  };
}

function BaseSimulation({
  physicsEngine = 'rapier',
  onInit,
  onUpdate,
  children,
  onControlsReady,
  onCanvasContainerReady,
  onCanvasClick,
  pickingPosition,
  precomputeTimestepSeconds = DEFAULT_PRECOMPUTE_TIMESTEP_SECONDS,
  playbackSpeed = 1,
  solverIterations,
  positionIterations,
}: BaseSimulationProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<PhysicsAdapter | null>(null);
  const [adapterReady, setAdapterReady] = useState(false);
  const isRunningRef = useRef(false);
  const modeRef = useRef<SimulationMode>('live');
  const initialSnapshotRef = useRef<WorldSnapshot | null>(null);
  const simulationTimeRef = useRef(0);
  const replayIndexRef = useRef(0);
  const replayTotalRef = useRef(0);
  const replayOnFrameRef = useRef<((frameIndex: number, options?: { seek?: boolean }) => void) | null>(null);

  // Callback refs: the adapter-lifecycle effect must NOT re-run when these
  // change. If it did, the cleanup would call adapter.destroy() — and since
  // React flushes cleanups before new effects bottom-up, a simultaneous
  // re-run in a child (e.g. Environment, whose effect uses the same adapter)
  // would try to call createWalls on a world-less adapter and throw.
  const onInitRef = useRef(onInit);
  const onUpdateRef = useRef(onUpdate);
  const onControlsReadyRef = useRef(onControlsReady);
  const onCanvasContainerReadyRef = useRef(onCanvasContainerReady);
  const precomputeTimestepRef = useRef(precomputeTimestepSeconds);
  const playbackSpeedRef = useRef(playbackSpeed);
  const solverItersRef = useRef(solverIterations);
  const positionItersRef = useRef(positionIterations);
  useEffect(() => { onInitRef.current = onInit; }, [onInit]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onControlsReadyRef.current = onControlsReady; }, [onControlsReady]);
  useEffect(() => { onCanvasContainerReadyRef.current = onCanvasContainerReady; }, [onCanvasContainerReady]);
  useEffect(() => { precomputeTimestepRef.current = precomputeTimestepSeconds; }, [precomputeTimestepSeconds]);
  useEffect(() => { playbackSpeedRef.current = playbackSpeed; }, [playbackSpeed]);
  useEffect(() => { solverItersRef.current = solverIterations; }, [solverIterations]);
  useEffect(() => { positionItersRef.current = positionIterations; }, [positionIterations]);

  // Push iteration-count changes to the live adapter without re-creating it.
  // Adapters that don't expose the knob (Matter today; Rapier for position
  // iters) silently ignore it.
  useEffect(() => {
    if (solverIterations === undefined) return;
    adapterRef.current?.setSolverIterations?.(solverIterations);
  }, [solverIterations]);
  useEffect(() => {
    if (positionIterations === undefined) return;
    adapterRef.current?.setPositionIterations?.(positionIterations);
  }, [positionIterations]);

  useEffect(() => {
    if (!sceneRef.current) return;

    let disposed = false;
    let adapter: PhysicsAdapter | null = null;
    let animationFrameId: number | undefined;

    sceneRef.current.style.width = `${CANVAS_WIDTH}px`;
    sceneRef.current.style.height = `${CANVAS_HEIGHT}px`;
    sceneRef.current.style.backgroundColor = '#fafafa';

    if (onCanvasContainerReadyRef.current) {
      onCanvasContainerReadyRef.current(sceneRef.current);
    }

    // Defer adapter creation one tick so React StrictMode's first mount
    // (which is immediately cleaned up) never actually creates a Rapier world.
    // Rapier's WASM state is fragile under double-create/double-destroy — we
    // want exactly one adapter per true component lifetime.
    const deferId = setTimeout(() => {
      if (disposed) return;
      createPhysicsAdapter(physicsEngine).then((a) => {
        if (disposed) {
          a.destroy();
          return;
        }
        adapter = a;
        adapterRef.current = a;
        if (solverItersRef.current !== undefined) {
          a.setSolverIterations?.(solverItersRef.current);
        }
        if (positionItersRef.current !== undefined) {
          a.setPositionIterations?.(positionItersRef.current);
        }
        setAdapterReady(true);

      if (onInitRef.current) {
        onInitRef.current(a);
      }

      // Save initial state for reset. Bodies are created asynchronously by
      // child components (ObjectRenderer), so delay the capture slightly.
      setTimeout(() => {
        initialSnapshotRef.current = cloneSnapshot(a.snapshot());
      }, 100);

      let lastTime = performance.now();
      let accumulator = 0;

      const resetBodiesToInitial = () => {
        if (initialSnapshotRef.current) {
          a.restore(initialSnapshotRef.current);
        }
      };

      const updateLoop = (currentTime: number) => {
        let delta = currentTime - lastTime;
        lastTime = currentTime;

        if (modeRef.current === 'precomputing') {
          animationFrameId = requestAnimationFrame(updateLoop);
          return;
        }

        if (isRunningRef.current) {
          if (delta > MAX_DELTA) delta = MAX_DELTA;
          if (modeRef.current === 'replay') {
            accumulator += delta * playbackSpeedRef.current;
          } else {
            accumulator += delta;
          }

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
              if (onUpdateRef.current) {
                onUpdateRef.current(a, simulationTimeRef.current);
              }
              a.step(FIXED_DT_SECONDS);
              simulationTimeRef.current += FIXED_DT_SECONDS;
            }
            accumulator -= FIXED_TIME_STEP;
          }
        } else if (modeRef.current === 'live' && onUpdateRef.current) {
          onUpdateRef.current(a, simulationTimeRef.current);
        }

        animationFrameId = requestAnimationFrame(updateLoop);
      };

      animationFrameId = requestAnimationFrame(updateLoop);

      if (onControlsReadyRef.current) {
        onControlsReadyRef.current({
          play: () => {
            isRunningRef.current = true;
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
            // Caller is responsible for resetting bodies and applying current
            // control values before calling this.
            modeRef.current = 'precomputing';
            isRunningRef.current = false;
            simulationTimeRef.current = 0;
            accumulator = 0;

            // Two snapshots are maintained: `freeze` (the pre-compute starting
            // pose, restored for paint between batches) and `physicsSnap` (the
            // live physics state, saved before yielding and reloaded after).
            const freeze = cloneSnapshot(a.snapshot());
            let physicsSnap = cloneSnapshot(freeze);

            // Substep the integration so each recorded frame still advances
            // by FIXED_DT_SECONDS (keeping playback pacing invariant) while
            // the engine sees a finer per-step dt for integration accuracy.
            const requestedTs = precomputeTimestepRef.current;
            const substeps = Math.max(1, Math.round(FIXED_DT_SECONDS / requestedTs));
            const substepDt = FIXED_DT_SECONDS / substeps;

            let done = 0;
            while (done < totalFrames) {
              a.restore(physicsSnap);
              const batchEnd = Math.min(totalFrames, done + PRECOMPUTE_BATCH);
              for (; done < batchEnd; done++) {
                if (onUpdateRef.current) {
                  onUpdateRef.current(a, simulationTimeRef.current);
                }
                for (let i = 0; i < substeps; i++) {
                  a.step(substepDt);
                }
                simulationTimeRef.current += FIXED_DT_SECONDS;
              }
              physicsSnap = cloneSnapshot(a.snapshot());
              a.restore(freeze);
              onBatch(done);
              if (done < totalFrames) {
                await new Promise<void>((resolve) =>
                  requestAnimationFrame(() => resolve())
                );
              }
            }
            a.restore(freeze);
          },
          startReplay: (onFrame, totalFrames) => {
            modeRef.current = 'replay';
            replayOnFrameRef.current = onFrame;
            replayTotalRef.current = totalFrames;
            replayIndexRef.current = 0;
            simulationTimeRef.current = 0;
            accumulator = 0;
            lastTime = performance.now();
            if (totalFrames > 0) {
              onFrame(0);
              replayIndexRef.current = 1;
              simulationTimeRef.current = FIXED_DT_SECONDS;
            }
          },
          seekReplay: (frameIndex: number) => {
            const total = replayTotalRef.current;
            if (total <= 0 || modeRef.current !== 'replay') return;
            const clamped = Math.max(0, Math.min(total - 1, Math.floor(frameIndex)));
            replayIndexRef.current = clamped + 1;
            simulationTimeRef.current = (clamped + 1) * FIXED_DT_SECONDS;
            accumulator = 0;
            lastTime = performance.now();
            replayOnFrameRef.current?.(clamped, { seek: true });
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
          recaptureInitialSnapshot: () => {
            initialSnapshotRef.current = cloneSnapshot(a.snapshot());
          },
        });
      }
      });
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(deferId);
      if (animationFrameId !== undefined) {
        cancelAnimationFrame(animationFrameId);
      }
      if (adapter) {
        adapter.destroy();
      }
      adapterRef.current = null;
      setAdapterReady(false);
    };
  }, [physicsEngine]);

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
      {adapterReady && adapterRef.current && (
        <PhysicsProvider adapter={adapterRef.current}>
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
