import { useEffect, forwardRef } from 'react';
import Matter from 'matter-js';
import { usePhysics } from '../../../contexts/PhysicsContext';
import type { Body } from './Body';

export interface ObjectProps {
  id: string;
  x: number;
  y: number;
  body: Body;
  velocity?: { x: number; y: number };
  acceleration?: { x: number; y: number };
  restitution?: number;
  frictionAir?: number;
  friction?: number;
  isStatic?: boolean;
}

const Object = forwardRef<Matter.Body, ObjectProps>(function Object(
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

  // Create the box body once
  useEffect(() => {
    const { Bodies, Composite, Body } = Matter;

    let object: Matter.Body | null = null;
    switch (body.type) {
      case 'rectangle':
        object = Bodies.rectangle(x, y, body.width, body.height);
        break;
      case 'circle':
        object = Bodies.circle(x, y, body.radius);
        break;
      case 'polygon':
        object = Bodies.polygon(x, y, body.sides, body.radius);
        break;
      case 'vertex':
        object = Bodies.fromVertices(x, y, [body.vertices]);
        break;
      default:
        throw new Error(`Invalid body type`);
    }

    object.restitution = restitution;
    object.frictionAir = frictionAir;
    object.friction = friction;
    object.isStatic = isStatic;
    object.render.fillStyle = body.color;

    // Set initial velocity
    Body.setVelocity(object, velocity);

    // Initialize acceleration property
    (object as any).acceleration = acceleration;

    // Add to world
    Composite.add(engine.world, object);

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
      Composite.remove(engine.world, object);
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

export default Object;

