import * as planck from 'planck';
import type {
  AdapterOptions,
  BodyDef,
  BodySnapshot,
  PhysicsAdapter,
  PhysicsBody,
  ShapeDescriptor,
  Vec2,
  WallDef,
  WorldSnapshot,
} from '../types';
import { Vec2Accessor } from '../vec2Accessor';

/**
 * PlanckAdapter — wraps Planck.js (pure-JS Box2D port) behind the SI + Y-up
 * adapter interface. Planck is natively SI with Y-up so wrapper accessors are
 * near-pass-through, mirroring RapierAdapter. Unlike Rapier there is no WASM
 * singleton constraint, so each adapter owns its own world.
 */

type Registered = {
  def: BodyDef;
  body: planck.Body;
  wrapper: PlanckPhysicsBody;
};

// ─── shape area (used to map `def.mass` → fixture density) ────────────────

function polygonArea(verts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < verts.length; i++) {
    const p = verts[i];
    const q = verts[(i + 1) % verts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function shapeArea(shape: ShapeDescriptor): number {
  switch (shape.type) {
    case 'circle':    return Math.PI * shape.radius * shape.radius;
    case 'rectangle': return shape.width * shape.height;
    case 'polygon':   return polygonArea(shape.vertices);
    case 'compound':  return shape.parts.reduce((s, p) => s + shapeArea(p), 0);
  }
}

// ─── fixture builders ─────────────────────────────────────────────────────

function addFixturesForShape(
  body: planck.Body,
  shape: ShapeDescriptor,
  material: { restitution?: number; friction?: number; density: number },
): void {
  switch (shape.type) {
    case 'circle': {
      body.createFixture({
        shape: new planck.Circle(shape.radius),
        density: material.density,
        friction: material.friction ?? 0,
        restitution: material.restitution ?? 0,
      });
      return;
    }
    case 'rectangle': {
      body.createFixture({
        shape: new planck.Box(shape.width / 2, shape.height / 2),
        density: material.density,
        friction: material.friction ?? 0,
        restitution: material.restitution ?? 0,
      });
      return;
    }
    case 'polygon': {
      body.createFixture({
        shape: new planck.Polygon(shape.vertices.map((v) => ({ x: v.x, y: v.y }))),
        density: material.density,
        friction: material.friction ?? 0,
        restitution: material.restitution ?? 0,
      });
      return;
    }
    case 'compound': {
      // Each part gets its own fixture on the same body. Planck computes the
      // body's total mass as the sum of per-fixture density*area, so using the
      // shared density here preserves the caller's intended total when a mass
      // override was resolved to `totalMass / totalArea` above.
      for (const part of shape.parts) {
        addFixturesForShape(body, part, material);
      }
      return;
    }
  }
}

// ─── PhysicsBody wrapper ──────────────────────────────────────────────────

class PlanckPhysicsBody implements PhysicsBody {
  readonly id: string;
  readonly shape: ShapeDescriptor;
  readonly userData: Record<string, unknown> = {};

  readonly position: Vec2;
  readonly velocity: Vec2;

  constructor(
    id: string,
    shape: ShapeDescriptor,
    private readonly body: planck.Body,
  ) {
    this.id = id;
    this.shape = shape;

    this.position = new Vec2Accessor(
      () => {
        const p = this.body.getPosition();
        return { x: p.x, y: p.y };
      },
      (v) => {
        this.body.setTransform({ x: v.x, y: v.y }, this.body.getAngle());
      },
    ) as unknown as Vec2;

    this.velocity = new Vec2Accessor(
      () => {
        const v = this.body.getLinearVelocity();
        return { x: v.x, y: v.y };
      },
      (v) => {
        this.body.setLinearVelocity({ x: v.x, y: v.y });
      },
    ) as unknown as Vec2;
  }

  get planckBody(): planck.Body {
    return this.body;
  }

  get angle(): number {
    return this.body.getAngle();
  }
  set angle(value: number) {
    this.body.setTransform(this.body.getPosition(), value);
  }

  get angularVelocity(): number {
    return this.body.getAngularVelocity();
  }
  set angularVelocity(value: number) {
    this.body.setAngularVelocity(value);
  }

  get mass(): number {
    return this.body.getMass();
  }
  set mass(value: number) {
    const center = this.body.getLocalCenter();
    this.body.setMassData({
      mass: value,
      center: { x: center.x, y: center.y },
      I: this.body.getInertia(),
    });
  }

  get isStatic(): boolean {
    return this.body.isStatic();
  }
  set isStatic(value: boolean) {
    this.body.setType(value ? 'static' : 'dynamic');
  }

  get restitution(): number {
    const f = this.body.getFixtureList();
    return f ? f.getRestitution() : 0;
  }
  set restitution(value: number) {
    for (let f = this.body.getFixtureList(); f; f = f.getNext()) {
      f.setRestitution(value);
    }
  }
}

// ─── adapter ──────────────────────────────────────────────────────────────

export class PlanckAdapter implements PhysicsAdapter {
  readonly kind = 'planck' as const;

  private readonly world: planck.World;
  private readonly bodyById = new Map<string, Registered>();
  /** Override for Planck's per-step velocity iterations (default 8). */
  private velocityIterations: number | undefined;
  /** Override for Planck's per-step position iterations (default 3). */
  private positionIterations: number | undefined;

  constructor(opts: AdapterOptions = {}) {
    const g = opts.gravity ?? { x: 0, y: -9.8 };
    this.world = new planck.World({ gravity: { x: g.x, y: g.y } });
    this.velocityIterations = opts.solverIterations;
    this.positionIterations = opts.positionIterations;
  }

  async init(): Promise<void> {
    // Planck is pure JS; nothing to await.
  }

  setGravity(g: Vec2): void {
    this.world.setGravity({ x: g.x, y: g.y });
  }

  setSolverIterations(iters: number): void {
    this.velocityIterations = iters;
  }

  setPositionIterations(iters: number): void {
    this.positionIterations = iters;
  }

  createBody(def: BodyDef): PhysicsBody {
    if (this.bodyById.has(def.id)) {
      throw new Error(`PlanckAdapter: duplicate body id '${def.id}'`);
    }

    const isStatic = def.isStatic ?? false;

    const body = this.world.createBody({
      type: isStatic ? 'static' : 'dynamic',
      position: { x: def.position.x, y: def.position.y },
      angle: def.angle ?? 0,
      linearVelocity: def.velocity ? { x: def.velocity.x, y: def.velocity.y } : undefined,
      angularVelocity: def.angularVelocity,
      // Matter's frictionAir ≈ linearDamping in Planck.
      linearDamping: def.frictionAir,
    });

    // Density maps the caller's intended mass across the shape's area. When no
    // mass override is supplied, use density = 1 so a dynamic body still gets
    // nonzero mass (Planck would otherwise leave mass at the default of 1 kg).
    const area = shapeArea(def.shape);
    const density =
      def.mass !== undefined && area > 0 ? def.mass / area : 1;

    addFixturesForShape(body, def.shape, {
      restitution: def.restitution,
      friction: def.friction,
      density,
    });

    // Inertia override must go in after fixtures are created — setMassData
    // overwrites Planck's auto-computed mass properties in one call, so we
    // preserve the just-derived mass and local center.
    if (def.inertia !== undefined) {
      const center = body.getLocalCenter();
      body.setMassData({
        mass: body.getMass(),
        center: { x: center.x, y: center.y },
        I: def.inertia,
      });
    }

    const wrapper = new PlanckPhysicsBody(def.id, def.shape, body);
    this.bodyById.set(def.id, { def, body, wrapper });
    return wrapper;
  }

  removeBody(body: PhysicsBody): void {
    const entry = this.bodyById.get(body.id);
    if (!entry) return;
    this.world.destroyBody(entry.body);
    this.bodyById.delete(body.id);
  }

  createWalls(walls: WallDef[]): PhysicsBody[] {
    const created: PhysicsBody[] = [];
    for (const wall of walls) {
      const { bounds, thickness } = wall;
      const worldW = bounds.maxX - bounds.minX;
      const worldH = bounds.maxY - bounds.minY;

      let id: string;
      let position: Vec2;
      let shape: ShapeDescriptor;

      switch (wall.side) {
        case 'bottom':
          id = `__wall_bottom`;
          position = { x: bounds.minX + worldW / 2, y: bounds.minY - thickness / 2 };
          shape = { type: 'rectangle', width: worldW + thickness * 2, height: thickness };
          break;
        case 'top':
          id = `__wall_top`;
          position = { x: bounds.minX + worldW / 2, y: bounds.maxY + thickness / 2 };
          shape = { type: 'rectangle', width: worldW + thickness * 2, height: thickness };
          break;
        case 'left':
          id = `__wall_left`;
          position = { x: bounds.minX - thickness / 2, y: bounds.minY + worldH / 2 };
          shape = { type: 'rectangle', width: thickness, height: worldH + thickness * 2 };
          break;
        case 'right':
          id = `__wall_right`;
          position = { x: bounds.maxX + thickness / 2, y: bounds.minY + worldH / 2 };
          shape = { type: 'rectangle', width: thickness, height: worldH + thickness * 2 };
          break;
      }

      created.push(this.createBody({ id, position, shape, isStatic: true }));
    }
    return created;
  }

  step(dtSeconds: number): void {
    this.world.step(dtSeconds, this.velocityIterations, this.positionIterations);
  }

  getAllBodies(): PhysicsBody[] {
    const out: PhysicsBody[] = [];
    for (const entry of this.bodyById.values()) out.push(entry.wrapper);
    return out;
  }

  snapshot(buf?: WorldSnapshot): WorldSnapshot {
    const bodies = buf?.bodies ?? [];
    let i = 0;
    for (const { wrapper } of this.bodyById.values()) {
      if (wrapper.isStatic) continue;
      const b: BodySnapshot = bodies[i] ?? {
        id: '',
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        angle: 0,
        angularVelocity: 0,
      };
      b.id = wrapper.id;
      b.position.x = wrapper.position.x;
      b.position.y = wrapper.position.y;
      b.velocity.x = wrapper.velocity.x;
      b.velocity.y = wrapper.velocity.y;
      b.angle = wrapper.angle;
      b.angularVelocity = wrapper.angularVelocity;
      bodies[i] = b;
      i++;
    }
    bodies.length = i;
    return { t: buf?.t ?? 0, bodies };
  }

  restore(snap: WorldSnapshot): void {
    for (const b of snap.bodies) {
      const entry = this.bodyById.get(b.id);
      if (!entry) continue;
      const w = entry.wrapper;
      w.position.x = b.position.x;
      w.position.y = b.position.y;
      w.velocity.x = b.velocity.x;
      w.velocity.y = b.velocity.y;
      w.angle = b.angle;
      w.angularVelocity = b.angularVelocity;
    }
  }

  destroy(): void {
    for (const { body } of this.bodyById.values()) {
      this.world.destroyBody(body);
    }
    this.bodyById.clear();
  }
}
