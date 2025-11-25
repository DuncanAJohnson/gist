import Matter from 'matter-js';
import { registerBody } from '../registry';
import type { RectangleBodyConfig } from '../types';

function createRectangle(x: number, y: number, config: RectangleBodyConfig): Matter.Body {
  const body = Matter.Bodies.rectangle(x, y, config.width, config.height);
  if (config.color) {
    body.render.fillStyle = config.color;
  }
  return body;
}

registerBody('rectangle', createRectangle);

export default createRectangle;

