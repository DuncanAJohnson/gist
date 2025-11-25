import Matter, { Bodies } from 'matter-js';
import * as decomp from 'poly-decomp';
import { registerBody } from '../registry';
import type { VertexBodyConfig } from '../types';

function createVertex(x: number, y: number, config: VertexBodyConfig): Matter.Body {

  // Convert from {x, y} objects to [x, y] arrays for poly-decomp
  const polygon: [number, number][] = config.vertices.map(v => [v.x, v.y]);

  // Ensure counter-clockwise winding
  decomp.makeCCW(polygon);

  // Decompose concave polygon into convex pieces
  const convexPolygons = decomp.quickDecomp(polygon);

  // Convert each convex polygon back to {x, y} format for Matter.js
  const matterVertexSets = convexPolygons.map((poly: [number, number][]) =>
    poly.map(([px, py]) => ({ x: px, y: py }))
  );

  const body = Bodies.fromVertices(x, y, matterVertexSets);
  if (config.color) {
    body.render.fillStyle = config.color;
  }
  return body;
}

registerBody('vertex', createVertex);

export default createVertex;

