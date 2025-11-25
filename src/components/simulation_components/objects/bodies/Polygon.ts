import Matter from 'matter-js';
import { registerBody } from '../registry';
import type { PolygonBodyConfig } from '../types';

function createPolygon(x: number, y: number, config: PolygonBodyConfig): Matter.Body {
  const body = Matter.Bodies.polygon(x, y, config.sides, config.radius);
  if (config.color) {
    body.render.fillStyle = config.color;
  }
  return body;
}

registerBody('polygon', createPolygon);

export default createPolygon;

