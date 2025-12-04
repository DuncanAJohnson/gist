import { useEffect } from 'react';
import Matter from 'matter-js';
import { usePhysics } from '../../contexts/PhysicsContext';
import { BASE_SIMULATION_WIDTH, BASE_SIMULATION_HEIGHT } from '../BaseSimulation';

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

    const wallThickness = 40;

    // Create walls based on the walls array
    if (walls.includes('bottom')) {
      const ground = Bodies.rectangle(
        BASE_SIMULATION_WIDTH / 2,
        BASE_SIMULATION_HEIGHT - wallThickness / 2,
        BASE_SIMULATION_WIDTH + wallThickness,
        wallThickness,
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
      const ceiling = Bodies.rectangle(
        BASE_SIMULATION_WIDTH / 2,
        wallThickness / 2,
        BASE_SIMULATION_WIDTH + wallThickness,
        wallThickness,
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
      const leftWall = Bodies.rectangle(
        wallThickness / 2,
        BASE_SIMULATION_HEIGHT / 2,
        wallThickness,
        BASE_SIMULATION_HEIGHT,
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
      const rightWall = Bodies.rectangle(
        BASE_SIMULATION_WIDTH - wallThickness / 2,
        BASE_SIMULATION_HEIGHT / 2,
        wallThickness,
        BASE_SIMULATION_HEIGHT,
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
