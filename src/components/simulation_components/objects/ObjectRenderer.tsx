import { useEffect, forwardRef } from 'react';
import { usePhysics } from '../../../contexts/PhysicsContext';
import type { ObjectConfig } from './types';
import type { BodyDef, PhysicsBody, ShapeDescriptor, Vec2 } from '../../../physics/types';
import { getManifestItem } from '../../../lib/renderableManifest';
import { scaleManifestColliderToShape } from '../../../physics/shapeHelpers';

// Phase-1 air-resistance defaults (debug-panel toggle only — no JSON schema
// changes yet). The per-frame quadratic drag model in JsonSimulation reads
// `userData.dragK` for each body. Computing k from the engine-agnostic
// ShapeDescriptor (rather than from BodyConfig, which no longer exists) means
// existing sims feel air resistance the moment the toggle flips on, regardless
// of how the manifest's collider was specified.
const AIR_DENSITY_KG_PER_M3 = 1.225;          // Earth sea level
const DEFAULT_CD_SPHERE = 0.47;                // smooth sphere
const DEFAULT_CD_CUBE = 1.05;                  // cube broadside
const DEFAULT_CD_FALLBACK = 1.0;               // unknown shape

function polygonArea(verts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < verts.length; i++) {
    const p = verts[i];
    const q = verts[(i + 1) % verts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function defaultDragK(shape: ShapeDescriptor): number {
  switch (shape.type) {
    case 'circle':
      return 0.5 * AIR_DENSITY_KG_PER_M3 * DEFAULT_CD_SPHERE * Math.PI * shape.radius * shape.radius;
    case 'rectangle':
      return 0.5 * AIR_DENSITY_KG_PER_M3 * DEFAULT_CD_CUBE * shape.width * shape.height;
    case 'polygon':
      return 0.5 * AIR_DENSITY_KG_PER_M3 * DEFAULT_CD_FALLBACK * polygonArea(shape.vertices);
    case 'compound':
      // Sum part contributions — same Cd applied to each piece's area.
      return shape.parts.reduce((sum, part) => sum + defaultDragK(part), 0);
  }
}

const ObjectRenderer = forwardRef<PhysicsBody, ObjectConfig>(function ObjectRenderer(
  {
    id,
    x,
    y,
    width,
    height,
    svg,
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
    if (!adapter) return;

    const item = getManifestItem(svg);
    let shape: ShapeDescriptor;
    if (item) {
      shape = scaleManifestColliderToShape(item.physical_properties.collider, width, height);
    } else {
      console.warn(
        `ObjectRenderer: svg "${svg}" not found in manifest; falling back to a plain rectangle collider.`,
      );
      shape = { type: 'rectangle', width, height };
    }

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
    created.userData.dragK = defaultDragK(shape);
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
    // ref is intentionally excluded — refs are stable callbacks/objects from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, id, x, y, width, height, svg, angle, mass, isStatic]);

  return null;
});

export default ObjectRenderer;
