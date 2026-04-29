/**
 * Engine-agnostic physics types.
 *
 * All values are in SI units with Y-up:
 *   - position: meters
 *   - velocity: m/s
 *   - angle: radians, counter-clockwise from +X
 *   - angular velocity: rad/s
 *   - mass: kg
 *   - gravity: m/s²
 *
 * Engine adapters are responsible for converting to/from their internal
 * representation. Callers above the adapter never see engine-specific coordinates.
 */

export type Vec2 = { x: number; y: number };

export type ShapeDescriptor =
  | { type: 'circle'; radius: number }
  | { type: 'rectangle'; width: number; height: number }
  | { type: 'polygon'; vertices: Vec2[] }
  | { type: 'compound'; parts: ShapeDescriptor[] };

export interface BodyDef {
  id: string;
  position: Vec2;
  angle?: number;
  velocity?: Vec2;
  angularVelocity?: number;
  mass?: number;
  /** Moment of inertia override. Set very high (e.g. 1e10) to prevent rotation. */
  inertia?: number;
  restitution?: number;
  friction?: number;
  frictionStatic?: number;
  frictionAir?: number;
  isStatic?: boolean;
  shape: ShapeDescriptor;
}

export interface WallDef {
  side: 'left' | 'right' | 'top' | 'bottom';
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  thickness: number;
}

export interface BodySnapshot {
  id: string;
  position: Vec2;
  velocity: Vec2;
  angle: number;
  angularVelocity: number;
}

export interface WorldSnapshot {
  t: number;
  bodies: BodySnapshot[];
}

export interface PhysicsBody {
  readonly id: string;
  readonly shape: ShapeDescriptor;
  position: Vec2;
  velocity: Vec2;
  angle: number;
  angularVelocity: number;
  mass: number;
  isStatic: boolean;
  /** Coefficient of restitution, applied to all of the body's colliders/fixtures. */
  restitution: number;
  userData: Record<string, unknown>;

  /**
   * Replace the body's linear damping coefficient at runtime. Per-step velocity
   * decay is `v / (1 + damping·dt)`. JsonSimulation drives this each frame when
   * the air-resistance debug toggle is on, plugging in `(k/m)·|v|` to mimic
   * quadratic, mass-dependent drag using the engine's stable damping integrator.
   */
  setLinearDamping(damping: number): void;
}

export interface PhysicsAdapter {
  readonly kind: 'matter' | 'rapier' | 'planck';

  init(): Promise<void>;
  setGravity(g: Vec2): void;

  createBody(def: BodyDef): PhysicsBody;
  removeBody(body: PhysicsBody): void;
  createWalls(walls: WallDef[]): PhysicsBody[];

  step(dtSeconds: number): void;
  getAllBodies(): PhysicsBody[];

  snapshot(buf?: WorldSnapshot): WorldSnapshot;
  restore(snap: WorldSnapshot): void;

  destroy(): void;

  /**
   * Override the engine's primary constraint-solver iteration count. Higher
   * values trade CPU for stability on stiff stacks and high-restitution
   * chains. Engines map this to whichever knob is most impactful:
   *   - Rapier: integrationParameters.numSolverIterations (default 4)
   *   - Planck: velocityIterations passed to world.step (default 8)
   * Optional — adapters that don't expose a runtime knob may omit it.
   */
  setSolverIterations?(iters: number): void;

  /**
   * Override the engine's position-correction iteration count. Currently
   * Planck-only — Rapier folds position correction into its single solver
   * loop (numSolverIterations), so the Rapier adapter omits this method.
   *   - Planck: positionIterations passed to world.step (default 3)
   */
  setPositionIterations?(iters: number): void;
}

export interface AdapterOptions {
  gravity?: Vec2;
  /** See PhysicsAdapter.setSolverIterations. */
  solverIterations?: number;
  /** See PhysicsAdapter.setPositionIterations. Planck-only. */
  positionIterations?: number;
}
