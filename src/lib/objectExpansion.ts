/**
 * Unified object-expansion seam (ramps & tracks SO-A, scoped 2026-08-05 —
 * Notes_on_Ramps_and_Tracks_Refactor.md, decisions SO1–SO7).
 *
 * One entry point, three ordered passes over the authored objects, all at
 * the runtime ingestion boundary directly ahead of scaleObjectToSI:
 *
 *   1. RAMP pass — objects carrying a `ramp` field author the incline
 *      PARAMS (angle/rise/run/slopeLength, highSide, colors); this pass
 *      delegates to makeRamp to synthesize sprite + collider and derive
 *      y/width/height/svg (grounded, static). Mirrors the container pass.
 *   2. CONTAINER pass — the existing expandContainerObjects, unchanged
 *      (also the completeness gate that drops width/height/svg-less
 *      objects). Runs after ramps so freshly-expanded ramps read complete.
 *   3. SEAT pass — objects carrying `seatOn: "<rampId>"` get y and angle
 *      DERIVED from their authored x: flush contact on the named ramp's
 *      surface. Runs last so any complete object — including an expanded
 *      container (wagon-on-ramp) — can ride.
 *
 * `seatOn` is a START-POSE / EDIT-TIME relation, never a runtime constraint
 * (ratified 2026-08-05): at t > 0 the rider is free and departure from the
 * surface stays emergent contact physics. Because this seam re-runs on every
 * config re-expansion, drag-snap needs no editor logic — the editor persists
 * the dragged x, the next expansion re-derives y/angle, and ramp resizes
 * re-seat their riders (the stale-seat class from the first drive dies here).
 *
 * SO2 amendment (in-build, 2026-08-05): authored y/angle on a seatOn rider
 * are overridden SILENTLY, not bus-badged as scoped — the drag editor
 * legitimately writes y back into the config on every move, so a derived-wins
 * badge would be permanent noise on any dragged rider. The bus reports only
 * genuine authoring problems: dangling refs and off-span clamps.
 *
 * Since SO-C (2026-08-06) `ramp` and `seatOn` are real schema fields on
 * ObjectConfig — three places moved together (schema + prompt + docs).
 *
 * Angle units (SO-C decision): `ramp.angle` is authored in the environment
 * angleUnit, exactly like `velocity.angle` — one rule for every authored
 * angle. The seam converts via env.angleScale (authored → radians, the same
 * multiplier scaleObjectToSI uses) before handing makeRamp its degrees.
 */

import type { ObjectConfig, ExpandedObjectConfig } from '../schemas/simulation';
import { expandContainerObjects, type ExpansionEnv } from './containerExpansion';
import { makeRamp, type Ramp } from './ramp';
import { isPolarVector } from './unitConversion';
import { reportDiagnostic } from './diagnosticsBus';

export interface ObjectExpansionEnv extends ExpansionEnv {
  /** Authored-angle → radians multiplier (angleUnitToRadians(env.angleUnit)). */
  angleScale: number;
}

const RAD_TO_DEG = 180 / Math.PI;

/** Per-ramp-id cache of the last factory result, keyed by a full input
 *  signature — same contract as the container cache (hits skip makeRamp:
 *  no re-registration, no new blob URL). */
const rampCache = new Map<string, { sig: string; result: Ramp }>();

/** Exposed for tests/harnesses only. */
export function clearRampExpansionCache(): void {
  rampCache.clear();
}

function expandRampObjects(objects: ObjectConfig[], angleScale: number): {
  objects: ObjectConfig[];
  ramps: Map<string, Ramp>;
} {
  const ramps = new Map<string, Ramp>();
  const out: ObjectConfig[] = [];

  for (const obj of objects) {
    const r = obj.ramp;
    if (!r) {
      out.push(obj);
      continue;
    }

    // Authoring checks outside the cache (bus cleared per re-expansion;
    // keyed dedupe keeps repeats to one entry) — container-pass precedent.
    if (obj.width !== undefined || obj.height !== undefined || obj.svg !== undefined || obj.y !== undefined) {
      reportDiagnostic(
        `ramp-derived-wins:${obj.id}`,
        `expandRampObjects: ramp "${obj.id}" also authors width/height/svg/y — ` +
          `derived values win; the authored ones are ignored.`,
      );
    }
    if (obj.isStatic === false) {
      reportDiagnostic(
        `ramp-not-static:${obj.id}`,
        `expandRampObjects: ramp "${obj.id}" authors isStatic:false — ramps are static ` +
          `environment geometry in v1 (dynamic wedges are out of scope); forced static.`,
      );
    }

    const sig = JSON.stringify([
      obj.id, r.angle, r.rise, r.run, r.slopeLength, r.highSide, r.fill, r.stroke,
      obj.x, obj.friction, obj.restitution, angleScale,
    ]);
    const cached = rampCache.get(obj.id);
    let result: Ramp;
    if (cached && cached.sig === sig) {
      result = cached.result;
    } else {
      try {
        result = makeRamp({
          id: obj.id,
          x: obj.x,
          friction: obj.friction,
          restitution: obj.restitution,
          ...r,
          // Authored angle is in env.angleUnit; makeRamp's API is degrees.
          ...(r.angle !== undefined ? { angle: r.angle * angleScale * RAD_TO_DEG } : {}),
        });
      } catch (err) {
        reportDiagnostic(
          `ramp-synthesize-failed:${obj.id}`,
          `expandRampObjects: ramp "${obj.id}" failed to synthesize — dropped ` +
            `(${String(err)}).`,
          err,
        );
        continue;
      }
      rampCache.set(obj.id, { sig, result });
    }
    ramps.set(obj.id, result);

    out.push({
      ...obj,
      y: result.object.y,
      width: result.object.width,
      height: result.object.height,
      svg: result.object.svg,
      friction: result.object.friction,
      restitution: result.object.restitution,
      isStatic: true,
    });
  }

  return { objects: out, ramps };
}

/**
 * Flush pose on `ramp`'s surface for a rider whose CENTER x is `x` (Bill's
 * drag contract: x stays where you put it, y snaps). The contact point P is
 * found by backing the half-height normal offset out of x, clamping P onto
 * the surface span (SO4 — a clamp moves the center back on-surface), then
 * re-deriving the center. Equivalent to seatOnRamp's crest-distance
 * parameterization; the harness asserts the two agree.
 */
function seatAtX(
  ramp: Ramp,
  x: number,
  objHeight: number,
): { x: number; y: number; angle: number; clamped: boolean } {
  const { crest, foot, angleRad, surfaceAngle, highSide } = ramp.dims;
  const dirX = highSide === 'left' ? 1 : -1;
  const half = objHeight / 2;
  let px = x - half * dirX * Math.sin(angleRad);
  const lo = Math.min(crest.x, foot.x);
  const hi = Math.max(crest.x, foot.x);
  let clamped = false;
  if (px < lo) { px = lo; clamped = true; }
  else if (px > hi) { px = hi; clamped = true; }
  const py = crest.y - (px - crest.x) * dirX * Math.tan(angleRad);
  return {
    x: px + half * dirX * Math.sin(angleRad),
    y: py + half * Math.cos(angleRad),
    angle: surfaceAngle,
    clamped,
  };
}

/**
 * Down-slope direction of a ramp's surface, radians CCW from +X: −θ for
 * highSide 'left' (descending rightward), θ − π for 'right'.
 */
function downSlopeAngleRad(ramp: Ramp): number {
  const { angleRad, highSide } = ramp.dims;
  return highSide === 'left' ? -angleRad : angleRad - Math.PI;
}

function seatRiders(
  objects: ExpandedObjectConfig[],
  ramps: Map<string, Ramp>,
  angleScale: number,
): ExpandedObjectConfig[] {
  const out: ExpandedObjectConfig[] = [];

  for (const obj of objects) {
    if (!obj.seatOn) {
      out.push(obj);
      continue;
    }

    const target = ramps.get(obj.seatOn);
    if (!target) {
      if (typeof obj.y === 'number') {
        reportDiagnostic(
          `seat-target-missing:${obj.id}`,
          `seatRiders: "${obj.id}" seats on "${obj.seatOn}", which is not a ramp-field ` +
            `object in this sim — left un-seated at its authored y.`,
        );
        out.push(obj);
      } else {
        reportDiagnostic(
          `seat-target-missing:${obj.id}`,
          `seatRiders: "${obj.id}" seats on "${obj.seatOn}", which is not a ramp-field ` +
            `object in this sim — dropped (no authored y to fall back to).`,
        );
      }
      continue;
    }

    const pose = seatAtX(target, obj.x, obj.height);
    if (pose.clamped) {
      reportDiagnostic(
        `seat-off-span:${obj.id}`,
        `seatRiders: "${obj.id}" at x=${obj.x} is past the "${obj.seatOn}" surface span — ` +
          `seated at the nearest edge (x=${pose.x}). Remove seatOn to place it freely.`,
      );
    }

    // Direction seeding (SO-C gate finding, 2026-08-06): a rider at rest
    // carries no direction, so a `velocity.magnitude` slider ("initial speed
    // along the incline") would launch it HORIZONTALLY — atan2(0,0) falls
    // back to +X. Rewrite an absent or cartesian-zero velocity as
    // polar-zero aimed DOWN-SLOPE (in the env angleUnit): the held-polar
    // seeding in JsonSimulation then launches the first magnitude drag along
    // the surface. An explicit polar author (any magnitude — including
    // {magnitude: 0, angle: …} for up-slope launches) and any non-zero
    // cartesian velocity are preserved untouched.
    const v = obj.velocity;
    const directionless =
      v === undefined || (!isPolarVector(v) && v.x === 0 && v.y === 0);
    const velocity = directionless
      ? { magnitude: 0, angle: downSlopeAngleRad(target) / angleScale }
      : v;

    out.push({ ...obj, x: pose.x, y: pose.y, angle: pose.angle, velocity });
  }

  return out;
}

/** Triangle params a control slider may drive. */
export type RampControlParam = 'angle' | 'rise' | 'run' | 'slopeLength';
const RAMP_PARAM_PRIORITY: RampControlParam[] = ['angle', 'rise', 'run', 'slopeLength'];

/**
 * Ramp-dimension sliders (2026-08-06): a slider bound to "ramp.angle" /
 * "ramp.rise" / "ramp.run" / "ramp.slopeLength" doesn't touch the physics
 * body — it overrides the authoring params AHEAD of the expansion seam, and
 * re-expansion does the rest (collider re-synthesis, rider re-seat, rider
 * velocity re-aim; the replay cache invalidates because control values are
 * in the frame-cache key).
 *
 * The companion rule — a triangle needs exactly two params, so an override
 * replaces its own param and keeps the FIRST AUTHORED param (in priority
 * angle > rise > run > slopeLength) that isn't the overridden one; all
 * others drop. The author therefore picks the slider's invariant by
 * choosing what to author: {angle, slopeLength} + an angle slider = a
 * fixed-length board being tilted (the classic tilt-until-slip µ demo);
 * {angle, rise} + a rise slider = a hill growing at fixed slope.
 */
export function applyRampControlOverrides(
  objects: ObjectConfig[],
  overrides: Record<string, Partial<Record<RampControlParam, number>>>,
): ObjectConfig[] {
  const ids = Object.keys(overrides);
  if (ids.length === 0) return objects;

  return objects.map((obj) => {
    const over = obj.ramp && overrides[obj.id];
    if (!over || !obj.ramp) return obj;
    const entries = (Object.entries(over) as [RampControlParam, number][]).filter(
      ([, v]) => typeof v === 'number' && Number.isFinite(v),
    );
    if (entries.length === 0) return obj;

    let params = obj.ramp;
    for (const [param, value] of entries) {
      const companion = RAMP_PARAM_PRIORITY.find(
        (p) => p !== param && params[p] !== undefined,
      );
      params = {
        ...params,
        angle: undefined,
        rise: undefined,
        run: undefined,
        slopeLength: undefined,
        [param]: value,
        ...(companion ? { [companion]: params[companion] } : {}),
      };
    }
    return { ...obj, ramp: params };
  });
}

/**
 * Edit back-feed — the INVERSE of the ramp pass, for EditOverlay commits
 * (SO-B drive finding 2026-08-06: resizing a ramp "didn't take" because the
 * commit wrote width/height and the next expansion's derived-wins reverted
 * them). For a `ramp`-field object, a handle-drag maps EXACTLY onto the
 * authoring params — the full-viewBox contract makes the AABB run × rise —
 * so a resize rewrites `ramp.run`/`ramp.rise` (dropping the now-stale
 * angle/slopeLength; the angle becomes derived) and a move rewrites only x
 * (y is grounded-derived; writing it would just earn the derived-wins
 * badge). Ordinary objects take the commit verbatim. Resize-vs-move is told
 * by comparing the committed box against the cached factory dims.
 */
export function applyEditCommitToObject(
  obj: ObjectConfig,
  partial: { x: number; y: number; width: number; height: number },
): ObjectConfig {
  if (!obj.ramp) return { ...obj, ...partial };

  const cached = rampCache.get(obj.id)?.result;
  const eps = 1e-6;
  const resized =
    !cached ||
    Math.abs(partial.width - cached.dims.run) > eps ||
    Math.abs(partial.height - cached.dims.rise) > eps;
  if (!resized) return { ...obj, x: partial.x };

  const { angle: _angle, slopeLength: _slopeLength, ...kept } = obj.ramp;
  void _angle;
  void _slopeLength;
  return {
    ...obj,
    x: partial.x,
    ramp: { ...kept, rise: partial.height, run: partial.width },
  };
}

/**
 * The seam entry point — JsonSimulation calls this (post dedupeObjectIds)
 * instead of expandContainerObjects directly. Ordinary complete objects pass
 * through all three passes untouched.
 */
export function expandObjects(
  objects: ObjectConfig[],
  env: ObjectExpansionEnv,
): ExpandedObjectConfig[] {
  const ramped = expandRampObjects(objects, env.angleScale);
  const complete = expandContainerObjects(ramped.objects, env);
  return seatRiders(complete, ramped.ramps, env.angleScale);
}
