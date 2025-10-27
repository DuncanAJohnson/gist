import { useEffect, forwardRef } from 'react';
import Matter from 'matter-js';
import { usePhysics } from '../../contexts/PhysicsContext';

interface BoxProps {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  velocity?: { x: number; y: number };
  restitution?: number;
}

const Box = forwardRef<Matter.Body, BoxProps>(function Box(
  {
    id,
    x,
    y,
    width = 60,
    height = 60,
    color = '#ff6b6b',
    velocity = { x: 0, y: 0 },
    restitution = 0.8,
  },
  ref
) {
  const engine = usePhysics();

  useEffect(() => {
    const { Bodies, Composite, Body } = Matter;

    // Create the box body
    const box = Bodies.rectangle(x, y, width, height, {
      restitution: restitution,
      render: {
        fillStyle: color,
      },
    });

    // Set initial velocity
    Body.setVelocity(box, velocity);

    // Add to world
    Composite.add(engine.world, box);

    // Expose the Matter.js body via ref
    if (ref) {
      if (typeof ref === 'function') {
        ref(box);
      } else {
        ref.current = box;
      }
    }

    // Cleanup
    return () => {
      Composite.remove(engine.world, box);
      if (ref) {
        if (typeof ref === 'function') {
          ref(null);
        } else if (ref.current) {
          ref.current = null;
        }
      }
    };
  }, [engine, id, x, y, width, height, color, velocity, restitution, ref]);

  return null; // This component doesn't render anything visible
});

export default Box;

