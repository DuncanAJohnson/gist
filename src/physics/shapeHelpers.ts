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
 * Map a manifest collider (defined in the SVG sprite's own viewBox, with Y
 * down) into a SI ShapeDescriptor centered at the origin and sized to fit
 * `width × height`. Y is flipped so the resulting collider sits in
 * physics-Y-up coordinates.
 *
 * `srcW` / `srcH` are the sprite's authoring viewBox dimensions. They MUST be
 * per-axis: rescaled sprites are non-square (e.g. `dynamics_cart` is 64×27.43,
 * `frisbee` 64×18.29), and assuming a square 64×64 source compresses and
 * mis-centers the collider on the off-64 axis — leaving the sprite's lower
 * extent (wheels, rim) with no collider so the body sinks into surfaces it
 * lands on. Defaulting both to `MANIFEST_VIEWBOX` keeps genuine 64×64 sprites
 * byte-identical to the old behavior.
 */
export function scaleManifestColliderToShape(
  collider: ManifestCollider,
  width: number,
  height: number,
  srcW: number = MANIFEST_VIEWBOX,
  srcH: number = MANIFEST_VIEWBOX,
): ShapeDescriptor {
  const sx = width / srcW;
  const sy = height / srcH;
  const halfX = srcW / 2;
  const halfY = srcH / 2;
  const mapV = (vx: number, vy: number): Vec2 => ({
    x: (vx - halfX) * sx,
    y: (halfY - vy) * sy,
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
