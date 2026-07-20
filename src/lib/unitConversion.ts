import type { ExpandedObjectConfig, Vector2D, Vector2DInput, PolarVector2D } from '../schemas/simulation';

/**
 * Supported unit types for the simulation. These are display labels only —
 * physics always runs in SI internally regardless of this setting.
 */
export type UnitType = 'm' | 'cm' | 'km' | 'ft' | 'in';

/**
 * Display units for ANGLE quantities (e.g. "velocity.angle"). Angle is its own
 * display-unit family, parallel to length: physics runs in radians internally
 * (matches atan2 and the engines), and these are the surface representations a
 * physics curriculum reaches for. See Notes_on_Vector_Representation_Refactor.md
 * → "Design update — angle is its own display-unit family".
 */
export type AngleUnit = 'deg' | 'rad' | 'rot';

export const UNIT_LABELS: Record<UnitType, string> = {
  m: 'meters',
  cm: 'centimeters',
  km: 'kilometers',
  ft: 'feet',
  in: 'inches',
};

export const UNIT_ABBREV: Record<UnitType, string> = {
  m: 'm',
  cm: 'cm',
  km: 'km',
  ft: 'ft',
  in: 'in',
};

/**
 * Scale factor to convert a value in the given user unit to SI meters.
 * Physics always runs in SI internally; config values (which are declared in
 * `environment.unit`) are multiplied by this at the boundary.
 */
export const UNIT_TO_METERS: Record<UnitType, number> = {
  m: 1,
  cm: 0.01,
  km: 1000,
  ft: 0.3048,
  in: 0.0254,
};

export function unitToMeters(unit: UnitType): number {
  return UNIT_TO_METERS[unit];
}

/**
 * Radians per one of the given display unit. Mirrors UNIT_TO_METERS for the
 * angle family (config value × factor = SI radians; SI radians ÷ factor =
 * display value). 1 rotation = 1 full turn = 2π rad.
 */
export const ANGLE_TO_RADIANS: Record<AngleUnit, number> = {
  deg: Math.PI / 180,
  rad: 1,
  rot: 2 * Math.PI,
};

export function angleUnitToRadians(unit: AngleUnit): number {
  return ANGLE_TO_RADIANS[unit];
}

/**
 * The scale factor for a bound property path at the config/UI boundary, i.e.
 * the number such that `siValue = displayValue × scale` and
 * `displayValue = siValue ÷ scale`. There are two SI bases:
 *
 *   - ANGLE family (paths ending in `.angle`) → radians; scale = `angleScale`.
 *   - LENGTH family (position / velocity / acceleration components and their
 *     `.magnitude`, which are length or length-per-time) → meters; scale =
 *     `lengthScale`.
 *   - everything else is dimensionless → scale = 1.
 *
 * The `.angle` check comes first so `velocity.angle` is scaled by the angle
 * family, not the length prefix it happens to share. This is what prevents an
 * angle from being silently multiplied by the length unit factor on cm/ft/in/km
 * sims. Pass `lengthScale = unitToMeters(env.unit)` and
 * `angleScale = angleUnitToRadians(env.angleUnit)`.
 */
export function unitScaleFor(
  path: string,
  lengthScale: number,
  angleScale: number,
): number {
  if (path.endsWith('.angle')) return angleScale;
  if (
    path.startsWith('position.') ||
    path.startsWith('velocity.') ||
    path.startsWith('acceleration.')
  ) {
    return lengthScale;
  }
  return 1;
}

/**
 * True when a vector initial condition was authored in polar form
 * ({magnitude, angle}) rather than components ({x, y}).
 */
export function isPolarVector(v: Vector2DInput): v is PolarVector2D {
  return (
    typeof (v as PolarVector2D).magnitude === 'number' &&
    typeof (v as PolarVector2D).angle === 'number'
  );
}

/**
 * An ObjectConfig whose vector fields are guaranteed cartesian — what
 * scaleObjectToSI returns. Everything below the config→SI boundary consumes
 * this, never the authoring-side polar union. Built on ExpandedObjectConfig
 * (width/height/svg required): container expansion precedes this boundary, so
 * the SI layer never sees an incomplete object.
 */
export type SIObjectConfig = Omit<ExpandedObjectConfig, 'velocity'> & { velocity?: Vector2D };

/**
 * The config→SI boundary. Besides length scaling, this is where polar-authored
 * initial conditions normalize to cartesian: authored magnitude is in
 * env.unit-per-second (like components) and authored angle is in env.angleUnit,
 * so polar → SI is magnitude·scale at angle·angleScale radians. This runs on
 * every ingestion path (static cast, LLM, DB load) — none of them Zod-parse,
 * so this is the ONE place normalization is guaranteed to happen. Input is the
 * post-expansion object (expandContainerObjects runs first — it derives
 * width/height/svg for `container` objects and drops incomplete ones).
 */
export function scaleObjectToSI(obj: ExpandedObjectConfig, scale: number, angleScale: number): SIObjectConfig {
  let velocity: Vector2D | undefined;
  if (obj.velocity) {
    if (isPolarVector(obj.velocity)) {
      // Defensive clamp mirrors writeVectorPolar: magnitude is ≥ 0 by contract,
      // but nothing runtime-enforces the schema's .min(0).
      const m = Math.max(0, obj.velocity.magnitude) * scale;
      const theta = obj.velocity.angle * angleScale;
      velocity = { x: m * Math.cos(theta), y: m * Math.sin(theta) };
    } else {
      velocity = { x: obj.velocity.x * scale, y: obj.velocity.y * scale };
    }
  }
  return {
    ...obj,
    x: obj.x * scale,
    y: obj.y * scale,
    width: obj.width * scale,
    height: obj.height * scale,
    velocity,
    acceleration: obj.acceleration
      ? { x: obj.acceleration.x * scale, y: obj.acceleration.y * scale }
      : obj.acceleration,
  };
}
