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
  isStatic?: boolean;
  shape: ShapeDescriptor;
}

export interface WallDef {
  side: 'left' | 'right' | 'top' | 'bottom';
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  thickness: number;
}

/** Per-step contact-force readback: this body's summed contact normal and
 *  friction forces, recovered from solver impulses as F = J/dt. */
export type ContactForces = { normal: Vec2; friction: Vec2 };

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
  /** Coefficient of friction, applied to all of the body's colliders/fixtures.
   *  Contacts combine as max-of-the-pair on both engines, so writing 0 on a
   *  surface lets the other body's µ govern the contact alone. */
  friction: number;
  userData: Record<string, unknown>;

  /**
   * Replace the body's linear damping coefficient at runtime. Per-step velocity
   * decay is `v / (1 + damping·dt)`. JsonSimulation drives this each frame when
   * the air-resistance debug toggle is on, plugging in `(k/m)·|v|` to mimic
   * quadratic, mass-dependent drag using the engine's stable damping integrator.
   */
  setLinearDamping(damping: number): void;

  /**
   * Apply a linear impulse (N·s) at the body's center of mass, waking it.
   *
   * The applied-force path is force-in / impulse-under (ratified 2026-08-09):
   * callers above the adapter speak NEWTONS and convert once, at a single
   * site, via `J = F · FIXED_DT_SECONDS` — the LOGICAL frame dt, not the
   * substep dt (`onUpdate` runs once per logical frame, then the engine takes
   * ~8 substeps; using substepDt would under-deliver 8×).
   *
   * Impulse rather than force because both engines CLEAR accumulated forces
   * after every substep, so a per-frame `applyForce` would reach only the
   * first substep of ~8 in precompute. Impulse is also the primitive both
   * solvers natively think in, and it leaves mass out of the conversion — the
   * engine divides by it, so `Δv = F·dt/m` and a mass slider changes the
   * acceleration for free.
   *
   * Known leak (measure before engineering around it): the impulse lands at
   * the frame boundary rather than spread across the substeps the way the
   * engine delivers gravity, so a contact's per-substep friction budget may
   * not absorb it in one go. See the applied-forces note, Findings 2026-08-09
   * item #3 (sub-breakaway creep).
   */
  applyImpulse(impulse: Vec2): void;

  /**
   * Contact-force readback for the most recent step (FBD Goal-1 step 3).
   * Sums normal and friction forces across all of this body's current
   * contacts, recovered from solver impulses (F = J/dt over the full step
   * dt). Returns zero vectors for a free body, a static body, or a SLEEPING
   * body (impulses flatten when the engine puts a resting body to sleep).
   * This is the engine-actual instrument: values jitter frame-to-frame at
   * resting contact — smoothing or an analytical display model lives above
   * the adapter, never here.
   */
  getContactForces(): ContactForces;
}

export interface PhysicsAdapter {
  readonly kind: 'rapier' | 'planck';

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
