/**
 * makeOpenContainer — the Rung 2 open-container factory (PHYSICS_SHAPES.md
 * S2.1 U-cup / S2.2 open box / S2.3 wagon). Cup, box, and wagon are one
 * construction problem: a U profile (two walls + a floor) as a single rigid
 * body, differing only in proportions and how the body is allowed to move.
 * One-sided variants (`walls: 'left' | 'right'`) drop a wall for an L
 * profile — the clean Newton's-first-law wagon (back wall only).
 *
 * The factory synthesizes BOTH halves of the manifest contract from one
 * outline: a flat-fill SVG sprite and a concave `type:"convex"` collider in
 * the sprite's own viewBox coordinates (Y down), registered session-side via
 * registerImportedRenderable. Downstream, the existing machinery does the
 * rest: scaleManifestColliderToShape maps the outline per-axis into the
 * object's width × height box, and decomposePolygonShape splits the U into
 * exactly 3 convex quads (≤4 verts/part — under Planck's silent 12-vertex
 * truncation cap by construction). See
 * Notes_on_Concave_Colliders_Refactor.md, Findings 2026-07-10.
 *
 * Deliberately NOT LLM-authorable: the schema/prompt landing is deferred
 * (Phase 4, three-places rule). Consumers are hand-authored local sims via
 * the asLocalSimConfig static path. Because registration is session-only, a
 * SAVED sim referencing a factory container falls back to a rectangle
 * collider on reload — same caveat as the Import Object debug tool.
 *
 * Unlike hand-authored sprites, the collider spans the FULL viewBox, so the
 * object's width/height box IS the physical extent — seating needs no
 * viewBox-proportion arithmetic (the authoring pain point `grounded` kills).
 */

import { registerImportedRenderable, type ManifestItem } from './renderableManifest';

export interface OpenContainerParams {
  /** Object id; also names the registered renderable (`container-<id>`). */
  id: string;
  /** Inner (payload) cavity width, config units. */
  innerWidth: number;
  /** Inner wall height, floor top → rim, config units. */
  wallHeight: number;
  /**
   * Wall thickness, config units. Default 12% of innerWidth. Clamped to a
   * diorama-scoped floor — see clampWallThickness.
   */
  wallThickness?: number;
  /** Floor slab thickness, config units. Default = wall thickness. */
  floorThickness?: number;
  /**
   * Which vertical walls the container gets. 'both' is the U (default);
   * 'left' / 'right' keep one wall and run the floor flat to the open side
   * (an L profile) — e.g. a Newton's-first-law wagon with a back wall only,
   * so the payload rolls off the open end unimpeded. At least one wall:
   * a wall-less slab is just a rectangle — author a plain box instead.
   */
  walls?: 'both' | 'left' | 'right';
  /**
   * Constraint regime — both values are DYNAMIC bodies (static is the
   * orthogonal `isStatic` object flag, not a mode):
   *  - 'free'     — place anywhere via x/y (y required).
   *  - 'grounded' — spawn-seated on the ground (y computed from groundLevel)
   *                 with a friction default suited to slide/stop demos.
   *                 Overriding `friction` is expected (e.g. near-zero for
   *                 clean momentum capture in S2.1).
   * A future 'prismatic' value is gated on the joints workstream.
   */
  mode?: 'free' | 'grounded';
  /** Center x, config units. */
  x: number;
  /** Center y, config units. Required for mode 'free'; ignored when grounded. */
  y?: number;
  /** Top of the ground surface for grounded seating. Default 0. */
  groundLevel?: number;
  /**
   * Smaller scene dimension, config units. When given, wall thickness is
   * additionally clamped to ≥1% of it (tunneling headroom at the 480 Hz
   * precompute; Phase 0 parity notes).
   */
  sceneMin?: number;
  mass?: number;
  friction?: number;
  restitution?: number;
  /** Sprite fill / stroke colors. */
  fill?: string;
  stroke?: string;
  showVectors?: string[];
}

/** Object-config fragment ready to drop into a sim's `objects` array. */
export interface OpenContainerObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  svg: string;
  mass: number;
  friction: number;
  restitution: number;
  isStatic: boolean;
  showVectors?: string[];
}

export interface OpenContainerDims {
  outerWidth: number;
  outerHeight: number;
  wallThickness: number;
  floorThickness: number;
  /** Center y actually used (computed when grounded). */
  centerY: number;
  /** World y of the inner floor's top — seat payloads at floorTopY + r. */
  floorTopY: number;
  /** World y of the wall rims (the open mouth). */
  rimY: number;
}

export interface OpenContainer {
  object: OpenContainerObject;
  dims: OpenContainerDims;
}

/**
 * Diorama-scoped wall-thickness floor (decision 2026-07-10): walls are a
 * meaningful fraction of the construction, never real-world-thin. Floors:
 * ≥5% of innerWidth always, and ≥1% of the scene's smaller dimension when
 * the caller provides it.
 */
function clampWallThickness(
  requested: number,
  innerWidth: number,
  sceneMin?: number,
): number {
  const floor = Math.max(0.05 * innerWidth, sceneMin ? 0.01 * sceneMin : 0);
  if (requested < floor) {
    console.warn(
      `makeOpenContainer: wallThickness ${requested} below the diorama floor; clamped to ${floor}.`,
    );
    return floor;
  }
  return requested;
}

const round = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * ViewBox units per config unit for the synthesized sprite. The sprite is
 * drawn via new Image() + drawImage, and an SVG whose viewBox is sub-pixel
 * (e.g. "0 0 0.744 0.772") rasterizes at a ~1px intrinsic size — or not at
 * all in engines that require explicit intrinsic dimensions — leaving the
 * container invisible. Scaling the coordinate space (and setting explicit
 * width/height attributes) is purely cosmetic: the collider is authored in
 * the SAME scaled space, and scaleManifestColliderToShape maps per-axis, so
 * the physics is unchanged.
 */
const SPRITE_SCALE = 200;

export function makeOpenContainer(params: OpenContainerParams): OpenContainer {
  const {
    id,
    innerWidth,
    wallHeight,
    mode = 'grounded',
    walls = 'both',
    x,
    groundLevel = 0,
    sceneMin,
    mass = 2,
    restitution = 0.1,
    fill = '#ef4444',
    stroke = '#b91c1c',
    showVectors,
  } = params;

  const wt = clampWallThickness(
    params.wallThickness ?? 0.12 * innerWidth,
    innerWidth,
    sceneMin,
  );
  const ft = params.floorThickness ?? wt;
  const wtL = walls === 'right' ? 0 : wt;
  const wtR = walls === 'left' ? 0 : wt;
  const outerWidth = round(innerWidth + wtL + wtR);
  const outerHeight = round(wallHeight + ft);

  if (mode === 'free' && params.y === undefined) {
    throw new Error(`makeOpenContainer("${id}"): mode 'free' requires y.`);
  }
  const centerY =
    mode === 'grounded' ? round(groundLevel + outerHeight / 2) : (params.y as number);
  const friction = params.friction ?? (mode === 'grounded' ? 0.7 : 0.5);

  // The outline in viewBox coordinates (Y down, origin top-left, units =
  // config units × SPRITE_SCALE so the sprite has a real intrinsic size; the
  // per-axis mapping keeps the physics exact). 'both' is the 8-vertex U
  // (same topology as the Phase 0 hand-authored cup → 3 convex quads);
  // one-sided walls are a 6-vertex L (→ 2 quads). Winding is normalized
  // downstream by poly-decomp's makeCCW. Every case touches all four
  // viewBox edges, so the full-viewBox extent contract (width/height box ==
  // physical extent, exact grounded seating) holds for every wall choice.
  const vbW = round(outerWidth * SPRITE_SCALE);
  const vbH = round(outerHeight * SPRITE_SCALE);
  const iw = round((wtL + innerWidth) * SPRITE_SCALE); // inner-right wall x
  const wh = round(wallHeight * SPRITE_SCALE); //          inner floor y (from top)
  const swt = round(wtL * SPRITE_SCALE); //                inner-left wall x
  let outline: [number, number][];
  if (walls === 'both') {
    outline = [
      [0, 0],
      [0, vbH],
      [vbW, vbH],
      [vbW, 0],
      [iw, 0],
      [iw, wh],
      [swt, wh],
      [swt, 0],
    ];
  } else if (walls === 'left') {
    outline = [
      [0, 0],
      [0, vbH],
      [vbW, vbH],
      [vbW, wh],
      [swt, wh],
      [swt, 0],
    ];
  } else {
    outline = [
      [0, vbH],
      [vbW, vbH],
      [vbW, 0],
      [iw, 0],
      [iw, wh],
      [0, wh],
    ];
  }

  const d =
    outline.map(([px, py], i) => `${i === 0 ? 'M' : 'L'} ${px} ${py}`).join(' ') + ' Z';
  const strokeWidth = round(0.03 * Math.min(vbW, vbH));
  const svgText =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}">` +
    `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>` +
    `</svg>`;

  const name = `container-${id}`;
  const item: ManifestItem = {
    name,
    display_name: name,
    status: 'approved',
    version: 1,
    color_tag: null,
    parent: null,
    physical_properties: {
      collider: { type: 'convex', vertices: outline },
    },
  };
  registerImportedRenderable(item, svgText);

  const floorTopY = round(centerY - outerHeight / 2 + ft);
  return {
    object: {
      id,
      x,
      y: centerY,
      width: outerWidth,
      height: outerHeight,
      svg: name,
      mass,
      friction,
      restitution,
      isStatic: false,
      ...(showVectors ? { showVectors } : {}),
    },
    dims: {
      outerWidth,
      outerHeight,
      wallThickness: wt,
      floorThickness: ft,
      centerY,
      floorTopY,
      rimY: round(centerY + outerHeight / 2),
    },
  };
}
