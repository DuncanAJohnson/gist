import type RAPIER_NS from '@dimforge/rapier2d-compat';
import type {
  AdapterOptions,
  BodyDef,
  BodySnapshot,
  ContactForces,
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
    private readonly worldRef: () => RAPIER_NS.World | null,
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
    // Rapier has no body-level setMass. Mass lives on the COLLIDERS — each is
    // created with `cd.setMass(...)` in addCollidersForShape — so the runtime
    // setter has to go back to the same place and then ask the body to
    // recompute.
    //
    // WHY NOT setAdditionalMass (what this did until 2026-08-13): it is a
    // TOTAL NO-OP for `rigid.mass()` unless
    // `recomputeMassPropertiesFromColliders()` runs afterwards — measured, on
    // 0.19.3 — so `body.mass = X` silently did nothing at all on Rapier while
    // working correctly on Planck. And even with the recompute it can only
    // ADD (mass = collider base + additional, additional ≥ 0), so it could
    // never model a LIGHTER body: a mass slider could not go down, which is
    // half of the a = F/m lesson it exists to teach. Found by Bill driving
    // `/simulation/applied-force-2d` — a 2 kg crate that stayed 5 kg refused
    // to lift under a force that should have lifted it.
    //
    // Scaling every collider by the same factor preserves the compound's mass
    // DISTRIBUTION, so the centre of mass stays put and the recomputed inertia
    // stays physical (heavier body → proportionally harder to spin).
    const n = this.rigid.numColliders();
    if (n === 0) return;
    // A dynamic body at exactly 0 kg is degenerate (infinite acceleration);
    // clamp to something small and positive instead of dividing by zero.
    const target = Math.max(1e-6, value);
    const cols: RAPIER_NS.Collider[] = [];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const c = this.rigid.collider(i);
      cols.push(c);
      total += c.mass();
    }
    if (total > 0) {
      const k = target / total;
      for (const c of cols) c.setMass(c.mass() * k);
    } else {
      // No collider carries mass yet (all massless): split evenly, matching
      // addCollidersForShape's compound behaviour.
      for (const c of cols) c.setMass(target / n);
    }
    this.rigid.recomputeMassPropertiesFromColliders();
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

  get friction(): number {
    return this.rigid.numColliders() > 0 ? this.rigid.collider(0).friction() : 0;
  }
  set friction(value: number) {
    // Rapier re-evaluates contact materials from collider properties each
    // step, so updating the colliders is sufficient — live contacts pick the
    // new µ up on the next solve.
    const n = this.rigid.numColliders();
    for (let i = 0; i < n; i++) {
      this.rigid.collider(i).setFriction(value);
    }
  }

  applyImpulse(impulse: Vec2): void {
    // wakeUp: true — a sub-breakaway push on a resting body must still register
    // even though sleep is disabled globally (belt and braces; also correct if
    // the sleep decision is ever narrowed per its revisit triggers).
    this.rigid.applyImpulse({ x: impulse.x, y: impulse.y }, true);
  }

  setLinearDamping(damping: number): void {
    this.rigid.setLinearDamping(damping);
  }

  getContactForces(): ContactForces {
    const out: ContactForces = { normal: { x: 0, y: 0 }, friction: { x: 0, y: 0 } };
    const world = this.worldRef();
    if (!world || this.rigid.isFixed()) return out;
    // world.timestep still holds the dt of the most recent step (step() sets
    // it before stepping) — impulses accumulate over that whole dt across
    // solver iterations, so this is the correct divisor.
    const dt = world.timestep;
    if (!(dt > 0)) return out;
    // Rapier 0.19's TGS-soft solver runs numSolverIterations substeps PLUS one
    // extra stabilization iteration, and contactImpulse() accumulates across
    // all of them — so raw J/dt overshoots the true force by (i+1)/i.
    // Empirically exact across iteration counts 1–16 (step-3 harness probe,
    // 2026-08-06): a 2 kg resting box reads N/(m·g) = 2.0, 1.5, 1.25, 1.125,
    // 1.0625 for i = 1, 2, 4, 8, 16. Read i live so the debug-panel solver-
    // iterations knob keeps the correction consistent.
    const iters = world.integrationParameters.numSolverIterations;
    const corr = iters / (iters + 1);

    const n = this.rigid.numColliders();
    for (let i = 0; i < n; i++) {
      const collider = this.rigid.collider(i);
      world.contactPairsWith(collider, (other) => {
        world.contactPair(collider, other, (manifold, flipped) => {
          // Manifold normal is world-space, collider1 → collider2. Our
          // collider is manifold-collider1 when !flipped, so the contact
          // force ON US points along −normal (+normal when flipped).
          const nrm = manifold.normal();
          const nx = nrm.x;
          const ny = nrm.y;
          const sign = flipped ? 1 : -1;
          // Tangent: 90° counter-clockwise from the normal — Rapier's 2D
          // tangent convention is opposite Box2D's cross(n, 1); harness-
          // verified on both ramp orientations (friction opposes motion).
          const tx = -ny;
          const ty = nx;
          const count = manifold.numContacts();
          for (let c = 0; c < count; c++) {
            const jn = manifold.contactImpulse(c);
            const jt = manifold.contactTangentImpulse(c);
            out.normal.x += (sign * nx * jn * corr) / dt;
            out.normal.y += (sign * ny * jn * corr) / dt;
            out.friction.x += (sign * tx * jt * corr) / dt;
            out.friction.y += (sign * ty * jt * corr) / dt;
          }
        });
      });
    }
    return out;
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
  private pendingSolverIters: number | null = null;

  constructor(opts: AdapterOptions = {}) {
    this.pendingGravity = opts.gravity ?? { x: 0, y: -9.8 };
    if (opts.solverIterations !== undefined) {
      this.pendingSolverIters = opts.solverIterations;
    }
  }

  async init(): Promise<void> {
    this.RAPIER = await loadRapier();
    if (this.destroyed) return;
    this.world = getSharedWorld(this.RAPIER, this.pendingGravity);
    if (this.pendingSolverIters !== null) {
      this.world.integrationParameters.numSolverIterations = this.pendingSolverIters;
    }
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

  setSolverIterations(iters: number): void {
    this.pendingSolverIters = iters;
    if (this.world) {
      this.world.integrationParameters.numSolverIterations = iters;
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

    // SLEEP DISABLED GLOBALLY (decided 2026-08-09, Bill —
    // Notes_on_Applied_Forces_Refactor.md Findings, Goal 2 item #4).
    //
    // Both engines sleep resting bodies (NOT Planck-only: measured, Planck by
    // ~0.5 s, Rapier ~1 s later). A sleeping body's solver impulses flatten,
    // so getContactForces() reads zero and its normal/friction arrows vanish —
    // the free-body diagram silently empties on exactly the resting and
    // below-breakaway scenes that teach static friction.
    //
    // Global at CREATION rather than a per-body knob because Rapier exposes no
    // runtime canSleep setter (0.19.3): setCanSleep lives on RigidBodyDesc, so
    // a runtime toggle would mean recreating the body. Deliberately NOT a
    // debug toggle either — a knob that changes trajectories would have to
    // join the frame-cache key (invariant #13); a constant doesn't.
    //
    // Measured cost: ~0.5 ms per logical frame at diorama scale (~3% of the
    // 60 fps budget), and ZERO stability cost (a resting box drifts 0.0000 mm
    // over 10 s, max |v| 2.3e-18 m/s, both engines).
    //
    // DON'T re-enable this to fix a perf problem — read the revisit triggers
    // (object count past ~100 bodies; low-performance hardware, especially
    // Chromebooks) in GIST_Physics_System_Topics.md → Performance & tuning.
    // The intended fallback is narrowing scope, not reverting.
    bd.setCanSleep(false);

    const world = this.requireWorld();
    const rigid = world.createRigidBody(bd);

    addCollidersForShape(this.RAPIER, world, rigid, def.shape, {
      restitution: def.restitution,
      friction: def.friction,
      massOverride: def.mass,
    });

    const wrapper = new RapierPhysicsBody(def.id, def.shape, rigid, () => this.world);
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

      // Explicit zero material: with the Max combine rule (see
      // addCollidersForShape) the dynamic body's own friction/restitution
      // must dominate the contact. Omitting these left Rapier's default
      // collider friction (0.5) on walls, silently out-frictioning any
      // slipperier object — a frictionless floor was unauthorable.
      created.push(this.createBody({ id, position, shape, isStatic: true, friction: 0, restitution: 0 }));
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
