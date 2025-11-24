import { useEffect, forwardRef } from 'react';
import Matter from 'matter-js';
import { usePhysics } from '../../contexts/PhysicsContext';

interface ObjectProps {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  velocity?: { x: number; y: number };
  acceleration?: { x: number; y: number };
  force?: { x: number; y: number };
  forceMode?: 'impulse' | 'continuous';
  restitution?: number;
  shape: string;
  frictionAir?: number;
  isStatic?: boolean;
}

const Object = forwardRef<Matter.Body, ObjectProps>(function Object(
  {
    id,
    x,
    y,
    width = 60,
    height = 60,
    color = '#ff6b6b',
    velocity = { x: 0, y: 0 },
    acceleration = { x: 0, y: 0 },
    force = { x: 0, y: 0 },
    forceMode = 'impulse',
    restitution = 0.8,
    shape = 'rectangle',
    frictionAir = 0,
    isStatic = false,
  },
  ref
) {
  const engine = usePhysics();

  // Create the box body once
  useEffect(() => {
    const { Bodies, Composite, Body } = Matter;

    // Create the box body with initial values
    let object: Matter.Body;
    if (shape === 'rectangle') {
      object = Bodies.rectangle(x, y, width, height, {
        restitution: restitution,
        render: {
          fillStyle: color,
        },
        frictionAir: frictionAir,
        isStatic: isStatic,
      });
    } else if (shape === 'circle') {
      object = Bodies.circle(x, y, width / 2, {
        restitution: restitution,
        render: {
          fillStyle: color,
        },
        frictionAir: frictionAir,
        isStatic: isStatic,
      });
    } else {
      throw new Error(`Invalid shape: ${shape}`);
    }

    // Set initial velocity
    Body.setVelocity(object, velocity);

    // Initialize acceleration property
    (object as any).acceleration = acceleration;

    // Apply initial force if provided and forceMode is 'impulse'
    // Note: 'continuous' forces are handled in the update loop
    if (forceMode === 'impulse' && (force.x !== 0 || force.y !== 0)) {
      Body.applyForce(object, object.position, force);
    }

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

