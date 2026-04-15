import { useEffect } from 'react';
import { usePhysics } from '../../contexts/PhysicsContext';
import {
  SIMULATION_WIDTH,
  SIMULATION_HEIGHT,
  WALL_THICKNESS,
} from '../BaseSimulation';
import type { PhysicsBody, WallDef } from '../../physics/types';

interface EnvironmentProps {
  walls?: string[];
  /** Gravity magnitude in SI m/s² (applied as downward acceleration). */
  gravity?: number;
  /** Render scale used to translate the fixed pixel canvas to an SI world size. */
  pixelsPerUnit?: number;
}

function Environment({ walls = [], gravity = 9.8, pixelsPerUnit = 10 }: EnvironmentProps) {
  const adapter = usePhysics();

  useEffect(() => {
    if (!adapter) return;
    adapter.setGravity({ x: 0, y: -gravity });
  }, [adapter, gravity]);

  useEffect(() => {
    if (!adapter) return;
    const worldWidth = SIMULATION_WIDTH / pixelsPerUnit;
    const worldHeight = SIMULATION_HEIGHT / pixelsPerUnit;
    const thickness = WALL_THICKNESS / pixelsPerUnit;
    const bounds = { minX: 0, minY: 0, maxX: worldWidth, maxY: worldHeight };

    const defs: WallDef[] = walls
      .filter((side): side is WallDef['side'] =>
        side === 'top' || side === 'bottom' || side === 'left' || side === 'right'
      )
      .map((side) => ({ side, bounds, thickness }));

    const created: PhysicsBody[] = adapter.createWalls(defs);

    return () => {
      for (const body of created) adapter.removeBody(body);
    };
  }, [adapter, walls, pixelsPerUnit]);

  return null;
}

export default Environment;
