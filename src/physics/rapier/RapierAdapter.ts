import type RAPIER_NS from '@dimforge/rapier2d-compat';
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
 * RapierAdapter — wraps @dimforge/rapier2d-compat behind the SI + Y-up adapter
 * interface. Rapier is natively SI with Y-up, so wrapper accessors are
 * near-pass-through.
 *
 * Rapier is loaded via dynamic import from `createPhysicsAdapter` so the WASM
 * bundle (~2 MB) is code-split away from Matter-only sims.
 */

type RAPIER = typeof import('@dimforge/rapier2d-compat');

// Module-level singletons. Rapier's WASM module is shared process-wide, and
// calling RAPIER.init() more than once — or creating and freeing Worlds
// across navigations — corrupts its internal state. So we:
//   1. Call RAPIER.init() exactly once (cached promise).
//   2. Keep a single World alive for the whole process. Each RapierAdapter
//      leases this world, scoping its own body IDs via a prefix, and on
//      destroy removes only its own bodies from it.
let rapierModulePromise: Promise<RAPIER> | null = null;
let sharedWorld: RAPIER_NS.World | null = null;

function loadRapier(): Promise<RAPIER> {
  if (!rapierModulePromise) {
    rapierModulePromise = (async () => {
      const R = await import('@dimforge/rapier2d-compat');
      // @dimforge/rapier2d-compat 0.19.x's own init() passes a Uint8Array to
      // the underlying WASM loader, which triggers a "deprecated parameters …
      // pass a single object instead" console.warn. It's internal to the
      // compat bundle (no caller-side fix), so suppress it just for this call.
      const origWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].includes('deprecated parameters for the initialization function')) return;
        origWarn.apply(console, args);
      };
      try {
        await R.init();
      } finally {
        console.warn = origWarn;
      }
      return R;
    })();
  }
  return rapierModulePromise;
}

function getSharedWorld(RAPIER: RAPIER, gravity: Vec2): RAPIER_NS.World {
  if (!sharedWorld) {
    sharedWorld = new RAPIER.World({ x: gravity.x, y: gravity.y });
    sharedWorld.timestep = 1 / 60;
  } else {
    sharedWorld.gravity = { x: gravity.x, y: gravity.y };
  }
  return sharedWorld;
}

type Registered = {
  def: BodyDef;
  rigid: RAPIER_NS.RigidBody;
  wrapper: RapierPhysicsBody;
};

// ─── shape builders ───────────────────────────────────────────────────────

function addCollidersForShape(
  RAPIER: RAPIER,
  world: RAPIER_NS.World,
  body: RAPIER_NS.RigidBody,
  shape: ShapeDescriptor,
  material: { restitution?: number; friction?: number; massOverride?: number },
  localOffset: Vec2 = { x: 0, y: 0 },
): void {
  const applyMaterial = (cd: RAPIER_NS.ColliderDesc) => {
    if (material.restitution !== undefined) cd.setRestitution(material.restitution);
    if (material.friction !== undefined) cd.setFriction(material.friction);
    // Use Max so a body's own restitution/friction dominates the contact —
    // matches Planck's mixRestitution and makes a ball=1 bounce off wall=0
    // fully elastic, instead of Rapier's default Average halving it.
    cd.setRestitutionCombineRule(3 as RAPIER_NS.CoefficientCombineRule);
    cd.setFrictionCombineRule(3 as RAPIER_NS.CoefficientCombineRule);
    if (localOffset.x !== 0 || localOffset.y !== 0) {
      cd.setTranslation(localOffset.x, localOffset.y);
    }
    return cd;
  };

  switch (shape.type) {
    case 'circle': {
      const cd = applyMaterial(RAPIER.ColliderDesc.ball(shape.radius));
      if (material.massOverride !== undefined) cd.setMass(material.massOverride);
      world.createCollider(cd, body);
      return;
    }
    case 'rectangle': {
      const cd = applyMaterial(RAPIER.ColliderDesc.cuboid(shape.width / 2, shape.height / 2));
      if (material.massOverride !== undefined) cd.setMass(material.massOverride);
      world.createCollider(cd, body);
      return;
    }
    case 'polygon': {
      const pts = new Float32Array(shape.vertices.length * 2);
      for (let i = 0; i < shape.vertices.length; i++) {
        pts[i * 2] = shape.vertices[i].x;
        pts[i * 2 + 1] = shape.vertices[i].y;
      }
      const hull = RAPIER.ColliderDesc.convexHull(pts);
      if (!hull) {
        throw new Error('RapierAdapter: failed to build convex hull from polygon vertices');
      }
      const cd = applyMaterial(hull);
      if (material.massOverride !== undefined) cd.setMass(material.massOverride);
      world.createCollider(cd, body);
      return;
    }
    case 'compound': {
      // Distribute a mass override evenly across parts so total mass matches.
      const perPartMass =
        material.massOverride !== undefined
          ? material.massOverride / shape.parts.length
          : undefined;
      for (const part of shape.parts) {
        addCollidersForShape(
          RAPIER,
          world,
          body,
          part,
          { ...material, massOverride: perPartMass },
          localOffset,
        );
      }
      return;
    }
  }
}

// ─── PhysicsBody wrapper ──────────────────────────────────────────────────

class RapierPhysicsBody implements PhysicsBody {
  readonly id: string;
  readonly shape: ShapeDescriptor;
  readonly userData: Record<string, unknown> = {};

  readonly position: Vec2;
  readonly velocity: Vec2;

  constructor(
    id: string,
    shape: ShapeDescriptor,
    private readonly rigid: RAPIER_NS.RigidBody,
  ) {
    this.id = id;
    this.shape = shape;

    this.position = new Vec2Accessor(
      () => {
        const t = this.rigid.translation();
        return { x: t.x, y: t.y };
      },
      (v) => {
        this.rigid.setTranslation({ x: v.x, y: v.y }, true);
      },
    ) as unknown as Vec2;

    this.velocity = new Vec2Accessor(
      () => {
        const v = this.rigid.linvel();
        return { x: v.x, y: v.y };
      },
      (v) => {
        this.rigid.setLinvel({ x: v.x, y: v.y }, true);
      },
    ) as unknown as Vec2;
  }

  get rigidBody(): RAPIER_NS.RigidBody {
    return this.rigid;
  }

  get angle(): number {
    return this.rigid.rotation();
  }
  set angle(value: number) {
    this.rigid.setRotation(value, true);
  }

  get angularVelocity(): number {
    return this.rigid.angvel();
  }
  set angularVelocity(value: number) {
    this.rigid.setAngvel(value, true);
  }

  get mass(): number {
    return this.rigid.mass();
  }
  set mass(value: number) {
    // Rapier has no direct runtime "setMass" on the body — mass comes from
    // collider density/mass. Approximate by scaling additional mass.
    this.rigid.setAdditionalMass(Math.max(0, value - this.rigid.mass()), true);
  }

  get isStatic(): boolean {
    return this.rigid.isFixed();
  }
  set isStatic(value: boolean) {
    this.rigid.setBodyType(
      value
        ? (1 as RAPIER_NS.RigidBodyType) // Fixed
        : (0 as RAPIER_NS.RigidBodyType), // Dynamic
      true,
    );
  }

  get restitution(): number {
    return this.rigid.numColliders() > 0 ? this.rigid.collider(0).restitution() : 0;
  }
  set restitution(value: number) {
    const n = this.rigid.numColliders();
    for (let i = 0; i < n; i++) {
      this.rigid.collider(i).setRestitution(value);
    }
  }
}

// ─── adapter ──────────────────────────────────────────────────────────────

export class RapierAdapter implements PhysicsAdapter {
  readonly kind = 'rapier' as const;

  private RAPIER!: RAPIER;
  private world: RAPIER_NS.World | null = null;
  private destroyed = false;
  private readonly bodyById = new Map<string, Registered>();
  private readonly pendingGravity: Vec2;

  constructor(opts: AdapterOptions = {}) {
    this.pendingGravity = opts.gravity ?? { x: 0, y: -9.8 };
  }

  async init(): Promise<void> {
    this.RAPIER = await loadRapier();
    if (this.destroyed) return;
    this.world = getSharedWorld(this.RAPIER, this.pendingGravity);
  }

  private requireWorld(): RAPIER_NS.World {
    if (!this.world) {
      throw new Error('RapierAdapter: world not initialized (call init() first)');
    }
    return this.world;
  }

  setGravity(g: Vec2): void {
    this.pendingGravity.x = g.x;
    this.pendingGravity.y = g.y;
    if (this.world) {
      this.world.gravity = { x: g.x, y: g.y };
    }
  }

  createBody(def: BodyDef): PhysicsBody {
    if (this.bodyById.has(def.id)) {
      throw new Error(`RapierAdapter: duplicate body id '${def.id}'`);
    }

    const isStatic = def.isStatic ?? false;
    const bd = isStatic
      ? this.RAPIER.RigidBodyDesc.fixed()
      : this.RAPIER.RigidBodyDesc.dynamic();

    bd.setTranslation(def.position.x, def.position.y);
    if (def.angle !== undefined) bd.setRotation(def.angle);
    if (def.velocity) bd.setLinvel(def.velocity.x, def.velocity.y);
    if (def.angularVelocity !== undefined) bd.setAngvel(def.angularVelocity);
    // Matter's frictionAir ≈ linearDamping in Rapier.
    if (def.frictionAir !== undefined) bd.setLinearDamping(def.frictionAir);

    const world = this.requireWorld();
    const rigid = world.createRigidBody(bd);

    addCollidersForShape(this.RAPIER, world, rigid, def.shape, {
      restitution: def.restitution,
      friction: def.friction,
      massOverride: def.mass,
    });

    const wrapper = new RapierPhysicsBody(def.id, def.shape, rigid);
    this.bodyById.set(def.id, { def, rigid, wrapper });
    return wrapper;
  }

  removeBody(body: PhysicsBody): void {
    const entry = this.bodyById.get(body.id);
    if (!entry) return;
    if (this.world) {
      try {
        this.world.removeRigidBody(entry.rigid);
      } catch {
        // Body may already be invalidated if the world was freed mid-teardown.
      }
    }
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
    if (!this.world) return;
    this.world.timestep = dtSeconds;
    this.world.step();
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
    this.destroyed = true;
    // Remove only this adapter's bodies from the shared world. Do NOT free
    // the world — it persists for the next adapter. Freeing and recreating
    // worlds within a single process corrupts Rapier's WASM state.
    if (this.world) {
      for (const { rigid } of this.bodyById.values()) {
        try {
          this.world.removeRigidBody(rigid);
        } catch {
          // Already removed or invalid — safe to ignore during teardown.
        }
      }
    }
    this.bodyById.clear();
    this.world = null;
  }
}

// Exported for tests/dev tooling: tear down the shared world entirely. Not
// used in app code — the world persists for the full page lifetime.
export function __resetRapierSharedWorld(): void {
  if (sharedWorld) {
    try { sharedWorld.free(); } catch { /* noop */ }
    sharedWorld = null;
  }
}
