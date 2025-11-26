import { useEffect, forwardRef } from 'react';
import Matter from 'matter-js';
import { usePhysics } from '../../../contexts/PhysicsContext';
import { getBodyFactory } from './registry';
import type { ObjectConfig } from './types';

// Ensure all body types are registered
import './bodies';

const ObjectRenderer = forwardRef<Matter.Body, ObjectConfig>(function ObjectRenderer(
  {
    id,
    x,
    y,
    body,
    velocity = { x: 0, y: 0 },
    acceleration = { x: 0, y: 0 },
    restitution = 0.8,
    frictionAir = 0,
    friction = 0,
    isStatic = false,
  },
  ref
) {
  const engine = usePhysics();

  useEffect(() => {
    if (!body) return;

    const factory = getBodyFactory(body.type);
    if (!factory) {
      console.warn(`Unknown body type: ${body.type}`);
      return;
    }

    // Create the body using the registered factory
    const object = factory(x, y, body);

    // Apply physics properties
    object.restitution = restitution;
    object.frictionAir = frictionAir;
    object.friction = friction;
    object.isStatic = isStatic;

    // Set initial velocity
    Matter.Body.setVelocity(object, velocity);

    // Initialize acceleration property
    (object as any).acceleration = acceleration;

    // Add to world
    Matter.Composite.add(engine.world, object);

    // Expose the Matter.js body via ref
    if (ref) {
      if (typeof ref === 'function') {
        ref(object);
      } else {
        ref.current = object;
      }
    }

    // Cleanup - only when component unmounts
    return () => {
      Matter.Composite.remove(engine.world, object);
      if (ref) {
        if (typeof ref === 'function') {
          ref(null);
        } else if (ref.current) {
          ref.current = null;
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, id]); // Only recreate if engine or id changes

  return null; // This component doesn't render anything visible
});

export default ObjectRenderer;

