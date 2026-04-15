import { useEffect, forwardRef } from 'react';
import { usePhysics } from '../../../contexts/PhysicsContext';
import { getBodyFactory } from './registry';
import type { ObjectConfig } from './types';
import type { BodyDef, PhysicsBody } from '../../../physics/types';

// Ensure all body types are registered
import './bodies';

const ObjectRenderer = forwardRef<PhysicsBody, ObjectConfig>(function ObjectRenderer(
  {
    id,
    x,
    y,
    body,
    velocity,
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
