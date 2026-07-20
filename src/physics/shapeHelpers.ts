import * as decomp from 'poly-decomp';
import type { ShapeDescriptor, Vec2 } from './types';
import {
  MANIFEST_VIEWBOX,
  type ManifestCollider,
} from '../lib/renderableManifest';
import { reportDiagnostic } from '../lib/diagnosticsBus';

/**
 * Planck's `Settings.maxPolygonVertices`. A convex part above this is SILENTLY
 * truncated by Planck (first 12 vertices kept — order-dependent — the rest
 * dropped) then re-hulled → a WRONG collider with no thrown error. Rapier
 * re-hulls any vertex count safely, so an over-cap part is a portability hazard
 * (it only mis-collides once a sim runs on Planck), not a hard error. This is
 * the single source of truth for the threshold; the `?colliders=1` observation
 * overlay (BodyOutline) imports it to flag the same cap in red. (roadmap CC2)
 */
export const PLANCK_MAX_POLYGON_VERTS = 12;

/**
 * Dev-build guard for the silent Planck truncation described above. After
 * decomposition we know every part's real vertex count — the only place we do,
 * since a concave outline's own count does NOT predict its parts' counts. Warn
 * (dev only) on any part over the cap so the silent break becomes loud at
 * body-build time — via the seam diagnostics bus (console.warn + debug-panel
 * badge; the console-only channel was missed in the live baseball-on-Planck
 * specimen, 2026-07-19), complementing the visual overlay. Engine-agnostic on
 * purpose: it flags collider *content* that isn't Planck-portable, whatever
 * engine happens to be running now.
 */
function warnOnOverCapParts(
  parts: ShapeDescriptor[],
  outlineVerts: number,
  label?: string,
): void {
  const over = parts
    .map((p, i) => ({
      i,
      n: p.type === 'polygon' ? p.vertices.length : 0,
    }))
    .filter((p) => p.n > PLANCK_MAX_POLYGON_VERTS);
  if (over.length === 0) return;

  const who = label ? `"${label}" ` : '';
  const detail = over.map((p) => `part ${p.i} → ${p.n} verts`).join(', ');
  // Diagnostics bus: keyed so repeat decompositions of the same collider
  // (re-renders, StrictMode) surface as one badge entry, not a growing list.
  reportDiagnostic(
    `collider-overcap:${label ?? 'unlabeled'}:${outlineVerts}:${detail}`,
    `decomposePolygonShape: collider ${who}(${outlineVerts}-vertex outline) ` +
      `decomposed to ${parts.length} part(s); ${detail} — over Planck's ` +
      `${PLANCK_MAX_POLYGON_VERTS}-vertex cap. Planck will SILENTLY truncate ` +
      `(keep the first ${PLANCK_MAX_POLYGON_VERTS}) and re-hull → a WRONG ` +
      `collider with no error (Rapier is unaffected). Re-author the outline so ` +
      `every convex part stays ≤${PLANCK_MAX_POLYGON_VERTS} verts. Drive with ` +
      `?colliders=1 to see the offending part flagged in red.`,
  );
}

/**
 * Decompose a (possibly concave) polygon in SI into a convex-polygon
 * ShapeDescriptor. Single convex polygons return a `polygon` shape;
 * concave inputs return a `compound` with one part per convex piece.
 *
 * `label` is an optional caller-supplied name (e.g. the sprite key) used only
 * to attribute the dev-build over-cap warning; it has no effect on geometry.
 */
export function decomposePolygonShape(
  vertices: Vec2[],
  label?: string,
): ShapeDescriptor {
  const polygon: [number, number][] = vertices.map((v) => [v.x, v.y]);
  decomp.makeCCW(polygon);
  const convex = decomp.quickDecomp(polygon);
  const parts: ShapeDescriptor[] = convex.map((poly: [number, number][]) => ({
    type: 'polygon' as const,
    vertices: poly.map(([x, y]) => ({ x, y })),
  }));
  // Dev-build only. `(import.meta as any).env` matches the codebase idiom for
  // reading Vite env without wiring in vite/client types (no vite-env.d.ts).
  // Optional-chained: outside Vite (headless tsx harnesses) `env` is
  // undefined — the guard silently no-ops there instead of throwing.
  if ((import.meta as any).env?.DEV) {
    warnOnOverCapParts(parts, vertices.length, label);
  }
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
  label?: string,
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

    // 'polygon' (manifest_version 2) and 'convex' (legacy v1 tag) are the
    // same shape: an outline, possibly concave, decomposed into a compound.
    case 'polygon':
    case 'convex':
      return decomposePolygonShape(
        collider.vertices.map(([vx, vy]) => mapV(vx, vy)),
        label,
      );
  }
}
