import { registerBody } from '../registry';
import type { PolygonBodyConfig } from '../types';
import type { ShapeDescriptor } from '../../../../physics/types';

function createPolygon(config: PolygonBodyConfig): ShapeDescriptor {
  const sides = config.sides;
  const r = config.radius;
  const vertices = [] as { x: number; y: number }[];
  for (let i = 0; i < sides; i++) {
    const theta = (i / sides) * Math.PI * 2 - Math.PI / 2;
    vertices.push({ x: Math.cos(theta) * r, y: Math.sin(theta) * r });
  }
  return { type: 'polygon', vertices };
}

registerBody('polygon', createPolygon);

export default createPolygon;
