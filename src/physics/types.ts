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
  userData: Record<string, unknown>;
}

export interface PhysicsAdapter {
  readonly kind: 'matter' | 'rapier';

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
}

export interface AdapterOptions {
  gravity?: Vec2;
}
