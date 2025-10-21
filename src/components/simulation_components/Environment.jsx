import { useEffect } from 'react';
import Matter from 'matter-js';
import { usePhysics } from '../../contexts/PhysicsContext';

function Environment({ walls = [], width = 800, height = 600 }) {
  const engine = usePhysics();

  useEffect(() => {
    const { Bodies, Composite } = Matter;
    const createdBodies = [];

    const wallThickness = 40;

    // Create walls based on the walls array
    if (walls.includes('bottom')) {
      const ground = Bodies.rectangle(
        width / 2,
        height - wallThickness / 2,
        width + wallThickness,
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
        width / 2,
        wallThickness / 2,
        width + wallThickness,
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
        height / 2,
        wallThickness,
        height,
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
        width - wallThickness / 2,
        height / 2,
        wallThickness,
        height,
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
  }, [walls, width, height, engine]);

  return null; // This component doesn't render anything visible
}

export default Environment;

