import Matter from 'matter-js';
import { registerBody } from '../registry';
import type { VertexBodyConfig } from '../types';

function createVertex(x: number, y: number, config: VertexBodyConfig): Matter.Body {
  const body = Matter.Bodies.fromVertices(x, y, [config.vertices]);
  if (config.color) {
    body.render.fillStyle = config.color;
  }
  return body;
}

registerBody('vertex', createVertex);

export default createVertex;

