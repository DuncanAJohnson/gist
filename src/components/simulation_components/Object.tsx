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
  restitution?: number;
  shape: 'rectangle' | 'circle';
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
    restitution = 0.8,
    shape = 'rectangle',
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
      });
    } else if (shape === 'circle') {
      object = Bodies.circle(x, y, width / 2, {
        restitution: restitution,
        render: {
          fillStyle: color,
        },
      });
    } else {
      throw new Error(`Invalid shape: ${shape}`);
    }

    // Set initial velocity
    Body.setVelocity(object, velocity);

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

