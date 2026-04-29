import { useEffect, forwardRef } from 'react';
import { usePhysics } from '../../../contexts/PhysicsContext';
import { getBodyFactory } from './registry';
import type { BodyConfig, ObjectConfig } from './types';
import type { BodyDef, PhysicsBody } from '../../../physics/types';

// Ensure all body types are registered
import './bodies';

// Phase-1 air-resistance defaults (debug-panel toggle only — no JSON schema
// changes yet). The per-frame quadratic drag model in JsonSimulation reads
// `userData.dragK` for each body. Computing k here from shape geometry means
// existing sims feel air resistance the moment the toggle flips on.
const AIR_DENSITY_KG_PER_M3 = 1.225;          // Earth sea level
const DEFAULT_CD_SPHERE = 0.47;                // smooth sphere
const DEFAULT_CD_CUBE = 1.05;                  // cube broadside
const DEFAULT_CD_FALLBACK = 1.0;               // unknown shape

function defaultDragK(body: BodyConfig): number {
  switch (body.type) {
    case 'circle':
      return 0.5 * AIR_DENSITY_KG_PER_M3 * DEFAULT_CD_SPHERE * Math.PI * body.radius * body.radius;
    case 'rectangle':
      return 0.5 * AIR_DENSITY_KG_PER_M3 * DEFAULT_CD_CUBE * body.width * body.height;
    case 'polygon': {
      // Regular n-gon with circumradius r → area = (1/2)·n·r²·sin(2π/n).
      const area = 0.5 * body.sides * body.radius * body.radius * Math.sin((2 * Math.PI) / body.sides);
      return 0.5 * AIR_DENSITY_KG_PER_M3 * DEFAULT_CD_FALLBACK * area;
    }
    case 'vertex': {
      // Shoelace area of the user-defined polygon.
      let a = 0;
      for (let i = 0; i < body.vertices.length; i++) {
        const p = body.vertices[i];
        const q = body.vertices[(i + 1) % body.vertices.length];
        a += p.x * q.y - q.x * p.y;
      }
      const area = Math.abs(a) / 2;
      return 0.5 * AIR_DENSITY_KG_PER_M3 * DEFAULT_CD_FALLBACK * area;
    }
  }
}

const ObjectRenderer = forwardRef<PhysicsBody, ObjectConfig>(function ObjectRenderer(
  {
    id,
    x,
    y,
    body,
    velocity,
    acceleration,
    restitution = 0.8,
    frictionAir = 0,
    friction = 0,
    frictionStatic = 0,
    isStatic = false,
    angularVelocity = 0,
    angle = 0,
    mass = 1,
    inertia,
  },
  ref
) {
  const adapter = usePhysics();

  useEffect(() => {
    if (!adapter || !body) return;

    const factory = getBodyFactory(body.type);
    if (!factory) {
      console.warn(`Unknown body type: ${body.type}`);
      return;
    }

    const shape = factory(body);

    const def: BodyDef = {
      id,
      position: { x, y },
      shape,
      angle,
      velocity,
      angularVelocity,
      mass,
      inertia,
      restitution,
      friction,
      frictionStatic,
      frictionAir,
      isStatic,
    };

    const created = adapter.createBody(def);
    created.userData.derivedAcceleration = { x: 0, y: 0 };
    // Persistent acceleration applied per-step by JsonSimulation's update loop.
    // Stored on userData so the adapter stays engine-agnostic — integration
    // happens above the adapter via velocity writes, not via engine forces.
    created.userData.configuredAcceleration = acceleration
      ? { x: acceleration.x, y: acceleration.y }
      : { x: 0, y: 0 };
    // Drag coefficient for the Phase-1 debug-panel air-resistance toggle.
    // JsonSimulation reads this each frame when the toggle is on and writes
    // `setLinearDamping((k/m)·|v|)` to mimic quadratic, mass-dependent drag
    // through the engine's stable damping integrator.
    created.userData.dragK = defaultDragK(body);
    // Original frictionAir is restored when the toggle is Off so toggling
    // Off→On→Off doesn't strand the body in its last computed damping value.
    created.userData.originalFrictionAir = frictionAir;

    if (ref) {
      if (typeof ref === 'function') {
        ref(created);
      } else {
        ref.current = created;
      }
    }

    return () => {
      adapter.removeBody(created);
      if (ref) {
        if (typeof ref === 'function') {
          ref(null);
        } else if (ref.current) {
          ref.current = null;
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, id]);

  return null;
});

export default ObjectRenderer;
