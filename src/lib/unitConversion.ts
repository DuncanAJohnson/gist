import type { ObjectConfig, BodyConfig } from '../schemas/simulation';

/**
 * Supported unit types for the simulation. These are display labels only —
 * physics always runs in SI internally regardless of this setting.
 */
export type UnitType = 'm' | 'cm' | 'km' | 'ft' | 'in';

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
 * Property paths whose numeric values carry a length dimension and therefore
 * need unit scaling at the config/UI boundary. Velocity and acceleration are
 * length-per-time, but time doesn't change, so the same scale applies.
 */
export function isDimensionalProperty(path: string): boolean {
  return (
    path.startsWith('position.') ||
    path.startsWith('velocity.') ||
    path.startsWith('acceleration.')
  );
}

function scaleBodyToSI(body: BodyConfig, scale: number): BodyConfig {
  switch (body.type) {
    case 'rectangle':
      return { ...body, width: body.width * scale, height: body.height * scale };
    case 'circle':
      return { ...body, radius: body.radius * scale };
    case 'polygon':
      return { ...body, radius: body.radius * scale };
    case 'vertex':
      return { ...body, vertices: body.vertices.map((v) => ({ x: v.x * scale, y: v.y * scale })) };
  }
}

export function scaleObjectToSI(obj: ObjectConfig, scale: number): ObjectConfig {
  return {
    ...obj,
    x: obj.x * scale,
    y: obj.y * scale,
    velocity: obj.velocity
      ? { x: obj.velocity.x * scale, y: obj.velocity.y * scale }
      : obj.velocity,
    acceleration: obj.acceleration
      ? { x: obj.acceleration.x * scale, y: obj.acceleration.y * scale }
      : obj.acceleration,
    body: scaleBodyToSI(obj.body, scale),
  };
}
