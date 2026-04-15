import Matter from 'matter-js';
import * as decomp from 'poly-decomp';
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
 * MatterAdapter — wraps Matter.js behind the SI + Y-up adapter interface.
 *
 * Internal coordinate convention (used only inside this adapter):
 *   matter_x = si_x * PX_PER_M
 *   matter_y = -si_y * PX_PER_M
 *   matter_angle = -si_angle
 *   matter_vx = si_vx * PX_PER_M / FRAME_RATE
 *   matter_vy = -si_vy * PX_PER_M / FRAME_RATE
 *
 * PX_PER_M is a fixed internal tuning constant independent of any config
 * pixelsPerUnit — that field is a *render* scale and does not affect physics.
 */

const PX_PER_M = 100;
const FRAME_RATE = 60;
const GRAVITY_SCALE = PX_PER_M / 1_000_000;

type Registered = {
  def: BodyDef;
  matter: Matter.Body;
  wrapper: MatterPhysicsBody;
};

// ─── conversions ──────────────────────────────────────────────────────────

const siToMatterPos = (si: Vec2): Vec2 => ({
  x: si.x * PX_PER_M,
  y: -si.y * PX_PER_M,
});

const matterToSiPos = (mx: number, my: number): Vec2 => ({
  x: mx / PX_PER_M,
  y: -my / PX_PER_M,
});

const siToMatterVel = (si: Vec2): Vec2 => ({
  x: (si.x * PX_PER_M) / FRAME_RATE,
  y: (-si.y * PX_PER_M) / FRAME_RATE,
});

const matterToSiVel = (mx: number, my: number): Vec2 => ({
  x: (mx * FRAME_RATE) / PX_PER_M,
  y: (-my * FRAME_RATE) / PX_PER_M,
});

const siToMatterAngle = (a: number): number => -a;
const matterToSiAngle = (a: number): number => -a;

const siToMatterAngVel = (w: number): number => -w / FRAME_RATE;
const matterToSiAngVel = (w: number): number => -w * FRAME_RATE;

const siLen = (m: number): number => m * PX_PER_M;

// ─── shape builders ───────────────────────────────────────────────────────

function buildMatterBodyFromShape(shape: ShapeDescriptor, isStatic: boolean): Matter.Body {
  const opts: Matter.IChamferableBodyDefinition = { isStatic };
  switch (shape.type) {
    case 'circle':
      return Matter.Bodies.circle(0, 0, siLen(shape.radius), opts);
    case 'rectangle':
      return Matter.Bodies.rectangle(0, 0, siLen(shape.width), siLen(shape.height), opts);
    case 'polygon': {
      const verts = shape.vertices.map((v) => ({ x: siLen(v.x), y: -siLen(v.y) }));
      return Matter.Bodies.fromVertices(0, 0, [verts], opts);
    }
    case 'compound': {
      const vertexSets = shape.parts.map((part) => {
        if (part.type !== 'polygon') {
          throw new Error(
            `MatterAdapter: compound shape parts must be 'polygon' (got '${part.type}')`,
          );
        }
        return part.vertices.map((v) => ({ x: siLen(v.x), y: -siLen(v.y) }));
      });
      return Matter.Bodies.fromVertices(0, 0, vertexSets, opts);
    }
  }
}

/**
 * Decompose a (possibly concave) polygon described in SI into a compound
 * ShapeDescriptor of convex polygon parts. This mirrors the current Vertex
 * body factory but operates on SI input.
 */
export function decomposePolygonShape(vertices: Vec2[]): ShapeDescriptor {
  const polygon: [number, number][] = vertices.map((v) => [v.x, v.y]);
  decomp.makeCCW(polygon);
  const convex = decomp.quickDecomp(polygon);
  const parts: ShapeDescriptor[] = convex.map((poly: [number, number][]) => ({
    type: 'polygon' as const,
    vertices: poly.map(([x, y]) => ({ x, y })),
  }));
  return parts.length === 1 ? parts[0] : { type: 'compound', parts };
}

// ─── PhysicsBody wrapper ──────────────────────────────────────────────────

class MatterPhysicsBody implements PhysicsBody {
  readonly id: string;
  readonly shape: ShapeDescriptor;
  readonly userData: Record<string, unknown> = {};

  readonly position: Vec2;
  readonly velocity: Vec2;

  constructor(
    id: string,
    shape: ShapeDescriptor,
    private readonly matter: Matter.Body,
  ) {
    this.id = id;
    this.shape = shape;

    this.position = new Vec2Accessor(
      () => matterToSiPos(this.matter.position.x, this.matter.position.y),
      (v) => {
        const mp = siToMatterPos(v);
        Matter.Body.setPosition(this.matter, mp);
      },
    ) as unknown as Vec2;

    this.velocity = new Vec2Accessor(
      () => matterToSiVel(this.matter.velocity.x, this.matter.velocity.y),
      (v) => {
        Matter.Body.setVelocity(this.matter, siToMatterVel(v));
      },
    ) as unknown as Vec2;
  }

  get matterBody(): Matter.Body {
    return this.matter;
  }

  get angle(): number {
    return matterToSiAngle(this.matter.angle);
  }
  set angle(value: number) {
    Matter.Body.setAngle(this.matter, siToMatterAngle(value));
  }

  get angularVelocity(): number {
    return matterToSiAngVel(this.matter.angularVelocity);
  }
  set angularVelocity(value: number) {
    Matter.Body.setAngularVelocity(this.matter, siToMatterAngVel(value));
  }

  get mass(): number {
    return this.matter.mass;
  }
  set mass(value: number) {
    Matter.Body.setMass(this.matter, value);
  }

  get isStatic(): boolean {
    return this.matter.isStatic;
  }
  set isStatic(value: boolean) {
    Matter.Body.setStatic(this.matter, value);
  }
}

// ─── adapter ──────────────────────────────────────────────────────────────

export class MatterAdapter implements PhysicsAdapter {
  readonly kind = 'matter' as const;

  private readonly engine: Matter.Engine;
  private readonly bodyById = new Map<string, Registered>();

  constructor(opts: AdapterOptions = {}) {
    this.engine = Matter.Engine.create();
    // Default Matter gravity is (0, 1) Y-down; we manage it through setGravity.
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 0;
    this.engine.gravity.scale = GRAVITY_SCALE;
    if (opts.gravity) {
      this.setGravity(opts.gravity);
    }
  }

  async init(): Promise<void> {
    // Matter is sync; nothing to await.
  }

  setGravity(g: Vec2): void {
    // SI Y-up → Matter Y-down (flip y component).
    this.engine.gravity.x = g.x;
    this.engine.gravity.y = -g.y;
    this.engine.gravity.scale = GRAVITY_SCALE;
  }

  createBody(def: BodyDef): PhysicsBody {
    if (this.bodyById.has(def.id)) {
      throw new Error(`MatterAdapter: duplicate body id '${def.id}'`);
    }

    const matter = buildMatterBodyFromShape(def.shape, def.isStatic ?? false);

    // Pose.
    Matter.Body.setPosition(matter, siToMatterPos(def.position));
    if (def.angle !== undefined) {
      Matter.Body.setAngle(matter, siToMatterAngle(def.angle));
    }
    if (def.velocity) {
      Matter.Body.setVelocity(matter, siToMatterVel(def.velocity));
    }
    if (def.angularVelocity !== undefined) {
      Matter.Body.setAngularVelocity(matter, siToMatterAngVel(def.angularVelocity));
    }

    // Material properties.
    if (def.mass !== undefined) {
      Matter.Body.setMass(matter, def.mass);
    }
    if (def.restitution !== undefined) matter.restitution = def.restitution;
    if (def.friction !== undefined) matter.friction = def.friction;
    if (def.frictionStatic !== undefined) matter.frictionStatic = def.frictionStatic;
    if (def.frictionAir !== undefined) matter.frictionAir = def.frictionAir;

    Matter.Composite.add(this.engine.world, matter);

    const wrapper = new MatterPhysicsBody(def.id, def.shape, matter);
    this.bodyById.set(def.id, { def, matter, wrapper });
    return wrapper;
  }

  removeBody(body: PhysicsBody): void {
    const entry = this.bodyById.get(body.id);
    if (!entry) return;
    Matter.Composite.remove(this.engine.world, entry.matter);
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
    Matter.Engine.update(this.engine, dtSeconds * 1000);
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
    Matter.Engine.clear(this.engine);
    this.bodyById.clear();
  }

  /** Escape hatch for code that still needs the Matter engine during migration. */
  get matterEngine(): Matter.Engine {
    return this.engine;
  }
}
