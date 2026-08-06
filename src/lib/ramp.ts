/**
 * makeRamp — the ramp/inclined-plane factory, first citizen of the
 * environment-shapes charter (Notes_on_Concave_Colliders_Refactor.md,
 * Findings 2026-07-10 decision 5: the generator becomes a tool for custom
 * compound shapes AND environment/background shapes; "opens its own doc when
 * that work starts" — that doc is Notes_on_Ramps_and_Tracks_Refactor.md).
 *
 * Curriculum home: PHYSICS_SHAPES.md S0.1 (box on incline — sliding,
 * friction), S0.2 (rolling race), S0.4 (tipping vs sliding), and the energy
 * chapter's GPE→KE conversions. The ramp is also the gateway to Rung 1
 * tracks (two-hill coaster, loop, ramp-to-launch) — those need polyline/
 * chain surfaces and stay in the tracks workstream; this factory is straight
 * inclines only, on purpose.
 *
 * Same synthesis contract as makeOpenContainer: BOTH manifest halves from
 * one outline — a flat-fill SVG sprite and a `type:"polygon"` collider in
 * the sprite's own viewBox coordinates — registered session-side via
 * registerImportedRenderable. The right triangle is CONVEX, so
 * decomposePolygonShape returns a single 3-vertex part (trivially under
 * Planck's 12-vertex cap). The collider spans the FULL viewBox, so the
 * object's width × height box IS the physical extent and grounded seating is
 * exact: centerY = groundLevel + rise/2.
 *
 * Unlike containers, a ramp is STATIC environment geometry (isStatic: true)
 * and its friction defaults to 0 — the phantom-friction lesson from Phase 1:
 * both engines run the Max coefficient-combine rule, so static geometry with
 * nonzero default friction would silently out-friction every slipperier
 * object. Put the µ you want on the ramp AND the payload (Max rule ⇒
 * effective µ = max of the two; setting both to the same value is the
 * least-surprising authoring).
 *
 * seatOnRamp() is the incline case of the "seat this object on that surface"
 * placement-helper seed (concave note, Findings 2026-07-10 decision 4 and
 * the 2026-07-19 container.angle wishlist entry): it computes the flush pose
 * {x, y, angle} for a body resting on the incline surface, so authors never
 * hand-solve trigonometry for a start position.
 */

import { registerImportedRenderable, type ManifestItem } from './renderableManifest';

export interface RampParams {
  /** Object id; also names the registered renderable (`ramp-<id>`). */
  id: string;
  /**
   * Incline angle in DEGREES (the authoring surface convention — env
   * angleUnit defaults to degrees). Give any two of {angle, rise, run,
   * slopeLength}; the rest are derived. NOTE the wrinkle: the seat helper
   * and `dims.surfaceAngle` emit RADIANS because raw ObjectConfig.angle is
   * radians.
   */
  angle?: number;
  /** Vertical height of the incline (the "h" in mgh), config units. */
  rise?: number;
  /** Horizontal base length, config units. */
  run?: number;
  /** Length along the incline surface (the hypotenuse; the "L" in slide-time problems), config units. */
  slopeLength?: number;
  /**
   * Which side is high. 'left' (default): crest at left, surface descends
   * rightward — payloads slide/roll toward +x. 'right' mirrors it.
   */
  highSide?: 'left' | 'right';
  /** Center x, config units. */
  x: number;
  /** Top of the ground surface; the ramp seats on it. Default 0. */
  groundLevel?: number;
  /** Surface friction. Default 0 — deliberate; see the Max-rule note above. */
  friction?: number;
  /** Default 0 (payloads shouldn't bounce off an incline). */
  restitution?: number;
  /** Sprite fill / stroke colors. */
  fill?: string;
  stroke?: string;
}

/** Object-config fragment ready to drop into a sim's `objects` array. */
export interface RampObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  svg: string;
  friction: number;
  restitution: number;
  isStatic: true;
}

export interface RampDims {
  angleDeg: number;
  /** Same angle in radians (unsigned magnitude). */
  angleRad: number;
  rise: number;
  run: number;
  slopeLength: number;
  /** Center y actually used (grounded seating). */
  centerY: number;
  /** World position of the crest (top of the incline surface). */
  crest: { x: number; y: number };
  /** World position of the foot (where the surface meets the ground). */
  foot: { x: number; y: number };
  /**
   * SIGNED surface angle in radians — drop straight into ObjectConfig.angle
   * for a body lying flush on the incline. Negative for highSide 'left'
   * (surface descends rightward ⇒ clockwise tilt), positive for 'right'.
   */
  surfaceAngle: number;
  highSide: 'left' | 'right';
}

export interface Ramp {
  object: RampObject;
  dims: RampDims;
}

/**
 * Diorama-scoped angle clamp: below ~5° the triangle is a sliver whose
 * collider approaches degenerate (and nothing pedagogically interesting
 * happens); above ~80° it's a wall, not a ramp. Mirrors the container
 * wall-thickness clamp philosophy — warn and clamp, don't throw.
 */
const MIN_ANGLE_DEG = 5;
const MAX_ANGLE_DEG = 80;

const round = (n: number): number => Math.round(n * 1e4) / 1e4;
const DEG = Math.PI / 180;

/**
 * ViewBox units per config unit — same rationale as the container factory:
 * sub-pixel viewBoxes rasterize to nothing via new Image(); scaling the
 * coordinate space is purely cosmetic because the collider is authored in
 * the SAME scaled space and scaleManifestColliderToShape maps per-axis.
 */
const SPRITE_SCALE = 200;

/**
 * Resolve {angle, rise, run, slopeLength} from any consistent pair, in a
 * documented priority order. Over-specified inputs are checked: any provided
 * value that disagrees with the derived triangle by >0.5% gets a
 * console.warn (derived wins).
 */
function resolveTriangle(p: RampParams): { angleDeg: number; rise: number; run: number; slopeLength: number } {
  const { angle, rise, run, slopeLength } = p;
  let aDeg: number | undefined;
  let h: number | undefined;
  let b: number | undefined;

  if (angle !== undefined) {
    aDeg = angle;
    if (rise !== undefined) h = rise;
    else if (run !== undefined) b = run;
    else if (slopeLength !== undefined) h = slopeLength * Math.sin(aDeg * DEG);
    else throw new Error(`makeRamp("${p.id}"): angle needs one of rise / run / slopeLength.`);
  } else if (rise !== undefined && run !== undefined) {
    h = rise;
    b = run;
  } else if (rise !== undefined && slopeLength !== undefined) {
    if (slopeLength <= rise) throw new Error(`makeRamp("${p.id}"): slopeLength must exceed rise.`);
    h = rise;
    b = Math.sqrt(slopeLength * slopeLength - rise * rise);
  } else if (run !== undefined && slopeLength !== undefined) {
    if (slopeLength <= run) throw new Error(`makeRamp("${p.id}"): slopeLength must exceed run.`);
    b = run;
    h = Math.sqrt(slopeLength * slopeLength - run * run);
  } else {
    throw new Error(
      `makeRamp("${p.id}"): give any two of angle / rise / run / slopeLength.`,
    );
  }

  if (aDeg !== undefined) {
    if (aDeg < MIN_ANGLE_DEG || aDeg > MAX_ANGLE_DEG) {
      const clamped = Math.min(MAX_ANGLE_DEG, Math.max(MIN_ANGLE_DEG, aDeg));
      console.warn(
        `makeRamp("${p.id}"): angle ${aDeg}° outside the diorama range ` +
          `[${MIN_ANGLE_DEG}°, ${MAX_ANGLE_DEG}°]; clamped to ${clamped}°.`,
      );
      aDeg = clamped;
    }
    if (h === undefined) h = (b as number) * Math.tan(aDeg * DEG);
    if (b === undefined) b = h / Math.tan(aDeg * DEG);
  } else {
    aDeg = Math.atan2(h as number, b as number) / DEG;
    if (aDeg < MIN_ANGLE_DEG || aDeg > MAX_ANGLE_DEG) {
      console.warn(
        `makeRamp("${p.id}"): rise/run give ${round(aDeg)}° — outside the diorama ` +
          `range [${MIN_ANGLE_DEG}°, ${MAX_ANGLE_DEG}°]. Kept as authored; ` +
          `expect a sliver or a wall, not a ramp.`,
      );
    }
  }

  const L = Math.sqrt((h as number) * (h as number) + (b as number) * (b as number));
  const check: Array<[string, number | undefined, number]> = [
    ['rise', rise, h as number],
    ['run', run, b as number],
    ['slopeLength', slopeLength, L],
    ['angle', angle, aDeg],
  ];
  for (const [name, given, derived] of check) {
    if (given !== undefined && Math.abs(given - derived) > 0.005 * Math.max(1e-9, Math.abs(derived))) {
      console.warn(
        `makeRamp("${p.id}"): over-specified ${name}=${given} disagrees with the ` +
          `derived triangle (${round(derived)}); derived wins.`,
      );
    }
  }

  return { angleDeg: aDeg, rise: h as number, run: b as number, slopeLength: L };
}

export function makeRamp(params: RampParams): Ramp {
  const {
    id,
    highSide = 'left',
    x,
    groundLevel = 0,
    friction = 0,
    restitution = 0,
    fill = '#78716c',
    stroke = '#44403c',
  } = params;

  const { angleDeg, rise, run, slopeLength } = resolveTriangle(params);
  const centerY = round(groundLevel + rise / 2);

  // The outline in viewBox coordinates (Y down, origin top-left, units =
  // config units × SPRITE_SCALE). A right triangle whose bounding box IS the
  // full viewBox, so the full-extent contract (width/height box == physical
  // extent, exact grounded seating) holds. Convex → decomposes to itself
  // (one 3-vertex part).
  const vbW = round(run * SPRITE_SCALE);
  const vbH = round(rise * SPRITE_SCALE);
  const outline: [number, number][] =
    highSide === 'left'
      ? [
          [0, 0],
          [0, vbH],
          [vbW, vbH],
        ]
      : [
          [vbW, 0],
          [0, vbH],
          [vbW, vbH],
        ];

  const d =
    outline.map(([px, py], i) => `${i === 0 ? 'M' : 'L'} ${px} ${py}`).join(' ') + ' Z';
  const strokeWidth = round(0.03 * Math.min(vbW, vbH));
  const svgText =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}">` +
    `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>` +
    `</svg>`;

  const name = `ramp-${id}`;
  const item: ManifestItem = {
    name,
    display_name: name,
    status: 'approved',
    version: 1,
    color_tag: null,
    parent: null,
    physical_properties: {
      collider: { type: 'polygon', vertices: outline },
    },
  };
  registerImportedRenderable(item, svgText);

  const sign = highSide === 'left' ? -1 : 1;
  const crestX = highSide === 'left' ? x - run / 2 : x + run / 2;
  const footX = highSide === 'left' ? x + run / 2 : x - run / 2;

  return {
    object: {
      id,
      x,
      y: centerY,
      width: round(run),
      height: round(rise),
      svg: name,
      friction,
      restitution,
      isStatic: true,
    },
    dims: {
      angleDeg: round(angleDeg),
      angleRad: round(angleDeg * DEG),
      rise: round(rise),
      run: round(run),
      slopeLength: round(slopeLength),
      centerY,
      crest: { x: round(crestX), y: round(groundLevel + rise) },
      foot: { x: round(footX), y: round(groundLevel) },
      surfaceAngle: round(sign * angleDeg * DEG),
      highSide,
    },
  };
}

/**
 * Flush pose for a body resting on the incline surface — the incline case of
 * the "seat object on surface" placement helper.
 *
 * `s` is the distance ALONG the surface from the crest (down-slope positive),
 * in config units. The seated point is the body's bottom-face center: the
 * pose offsets the body center by objHeight/2 along the outward surface
 * normal and tilts it to `dims.surfaceAngle`. Works for boxes (flat face
 * flush) and circles (objHeight/2 = radius, tangent contact) alike.
 *
 * The caller keeps the body on the surface: s ∈ [halfExtent, slopeLength −
 * halfExtent] for a box of along-slope half-width halfExtent. Out-of-range s
 * warns (the pose is still returned — overhang can be intentional).
 */
export function seatOnRamp(
  ramp: Ramp,
  s: number,
  objHeight: number,
): { x: number; y: number; angle: number } {
  const { crest, slopeLength, angleRad, surfaceAngle, highSide } = ramp.dims;
  if (s < 0 || s > slopeLength) {
    console.warn(
      `seatOnRamp("${ramp.object.id}"): s=${s} is off the surface [0, ${slopeLength}].`,
    );
  }
  const dirX = highSide === 'left' ? 1 : -1; // down-slope x direction
  // Down-slope tangent t̂ = (dirX·cosθ, −sinθ) and outward surface normal
  // n̂ = (dirX·sinθ, cosθ), both in Y-up world coordinates (n̂ always has a
  // positive y — it points up away from the incline face).
  const tX = dirX * Math.cos(angleRad);
  const tY = -Math.sin(angleRad);
  const normX = dirX * Math.sin(angleRad);
  const normY = Math.cos(angleRad);
  const px = crest.x + s * tX;
  const py = crest.y + s * tY;
  return {
    x: round(px + (objHeight / 2) * normX),
    y: round(py + (objHeight / 2) * normY),
    angle: surfaceAngle,
  };
}
