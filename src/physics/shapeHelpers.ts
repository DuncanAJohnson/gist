import * as decomp from 'poly-decomp';
import type { ShapeDescriptor, Vec2 } from './types';
import {
  MANIFEST_VIEWBOX,
  type ManifestCollider,
} from '../lib/renderableManifest';

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

/**
 * Map a manifest collider (defined in a 64×64 viewBox with Y down, matching
 * the SVG sprite) into a SI ShapeDescriptor centered at the origin and
 * sized to fit `width × height`. Y is flipped so the resulting collider
 * sits in physics-Y-up coordinates.
 */
export function scaleManifestColliderToShape(
  collider: ManifestCollider,
  width: number,
  height: number,
): ShapeDescriptor {
  const sx = width / MANIFEST_VIEWBOX;
  const sy = height / MANIFEST_VIEWBOX;
  const half = MANIFEST_VIEWBOX / 2;
  const mapV = (vx: number, vy: number): Vec2 => ({
    x: (vx - half) * sx,
    y: (half - vy) * sy,
  });

  switch (collider.type) {
    case 'circle':
      // Manifest circles are centered (off-center round shapes are encoded as
      // box). Keep aspect by using the smaller scale so a circle doesn't go
      // elliptical when width !== height.
      return { type: 'circle', radius: collider.radius * Math.min(sx, sy) };

    case 'box': {
      const center = mapV(collider.center[0], collider.center[1]);
      const w = collider.width * sx;
      const h = collider.height * sy;
      if (center.x === 0 && center.y === 0) {
        return { type: 'rectangle', width: w, height: h };
      }
      // Off-center boxes become offset polygons so the collider tracks where
      // the shape actually sits inside the viewBox (e.g. cat: center [32,30]).
      return {
        type: 'polygon',
        vertices: [
          { x: center.x - w / 2, y: center.y - h / 2 },
          { x: center.x + w / 2, y: center.y - h / 2 },
          { x: center.x + w / 2, y: center.y + h / 2 },
          { x: center.x - w / 2, y: center.y + h / 2 },
        ],
      };
    }

    case 'convex':
      return decomposePolygonShape(
        collider.vertices.map(([vx, vy]) => mapV(vx, vy)),
      );
  }
}
