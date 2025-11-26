import Matter from 'matter-js';
import { registerBody } from '../registry';
import type { CircleBodyConfig } from '../types';

function createCircle(x: number, y: number, config: CircleBodyConfig): Matter.Body {
  const body = Matter.Bodies.circle(x, y, config.radius);
  if (config.color) {
    body.render.fillStyle = config.color;
  }
  return body;
}

registerBody('circle', createCircle);

export default createCircle;

