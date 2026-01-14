import { useEffect } from 'react';
import Matter from 'matter-js';
import { usePhysics } from '../../contexts/PhysicsContext';
import { 
  CANVAS_WIDTH, 
  CANVAS_HEIGHT, 
  WALL_THICKNESS 
} from '../BaseSimulation';

interface EnvironmentProps {
  walls?: string[];
  /** Matter.js gravity scale (pre-converted from real-world units). Default: ~0.00098 (Earth gravity at 100px/m) */
  gravity?: number;
}

function Environment({ walls = [], gravity = 0.00098 }: EnvironmentProps) {
  const engine = usePhysics();

  // Set gravity scale directly (already converted from real-world units)
  engine.gravity.scale = gravity;

  useEffect(() => {
    const { Bodies, Composite } = Matter;
    const createdBodies: Matter.Body[] = [];

    // Walls are positioned at the outer edges of the canvas,
    // so the usable simulation space (0,0) to (SIMULATION_WIDTH, SIMULATION_HEIGHT)
    // is inside the walls with (0,0) at bottom-left of the usable area.

    // Create walls based on the walls array
    if (walls.includes('bottom')) {
      // Bottom wall: inner edge at y = CANVAS_HEIGHT - WALL_THICKNESS (bottom of usable space)
      const ground = Bodies.rectangle(
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT - WALL_THICKNESS / 2,
        CANVAS_WIDTH,
        WALL_THICKNESS,
        {
          isStatic: true,
          render: {
            fillStyle: '#666',
          },
        }
      );
      createdBodies.push(ground);
    }

    if (walls.includes('top')) {
      // Top wall: inner edge at y = WALL_THICKNESS (top of usable space)
      const ceiling = Bodies.rectangle(
        CANVAS_WIDTH / 2,
        WALL_THICKNESS / 2,
        CANVAS_WIDTH,
        WALL_THICKNESS,
        {
          isStatic: true,
          render: {
            fillStyle: '#666',
          },
        }
      );
      createdBodies.push(ceiling);
    }

    if (walls.includes('left')) {
      // Left wall: inner edge at x = WALL_THICKNESS (left of usable space)
      const leftWall = Bodies.rectangle(
        WALL_THICKNESS / 2,
        CANVAS_HEIGHT / 2,
        WALL_THICKNESS,
        CANVAS_HEIGHT,
        {
          isStatic: true,
          render: {
            fillStyle: '#666',
          },
        }
      );
      createdBodies.push(leftWall);
    }

    if (walls.includes('right')) {
      // Right wall: inner edge at x = CANVAS_WIDTH - WALL_THICKNESS (right of usable space)
      const rightWall = Bodies.rectangle(
        CANVAS_WIDTH - WALL_THICKNESS / 2,
        CANVAS_HEIGHT / 2,
        WALL_THICKNESS,
        CANVAS_HEIGHT,
        {
          isStatic: true,
          render: {
            fillStyle: '#666',
          },
        }
      );
      createdBodies.push(rightWall);
    }

    // Add all bodies to the world
    Composite.add(engine.world, createdBodies);

    // Cleanup
    return () => {
      Composite.remove(engine.world, createdBodies);
    };
  }, [walls, engine]);

  return null;
}

export default Environment;
