import * as decomp from 'poly-decomp';
import type { ShapeDescriptor, Vec2 } from './types';

/**
 * Decompose a (possibly concave) polygon in SI into a convex-polygon
 * ShapeDescriptor. Single convex polygons return a `polygon` shape;
 * concave inputs return a `compound` with one part per convex piece.
 */
export function decomposePolygonShape(vertices: Vec2[]): ShapeDescriptor {
  const polygon: [number, number][] = vertices.map((v) => [v.x, v.y]);
  decomp.makeCCW(polygon);
  const convex = decomp.quickDecomp(polygon);
  const parts: ShapeDescriptor[] = convex.map((poly: [number, number][]) => ({
    type: 'polygon' as const,
    vertices: poly.map(([x, y]) => ({ x, y })),
  }));
  return parts.length === 1 ? parts[0] : { type: 'compound', parts };
}
