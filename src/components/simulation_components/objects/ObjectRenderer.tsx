import { useEffect, forwardRef } from 'react';
import { usePhysics } from '../../../contexts/PhysicsContext';
import type { ObjectConfig } from './types';
import type { BodyDef, PhysicsBody, ShapeDescriptor } from '../../../physics/types';
import { getManifestItem } from '../../../lib/renderableManifest';
import { scaleManifestColliderToShape } from '../../../physics/shapeHelpers';

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
