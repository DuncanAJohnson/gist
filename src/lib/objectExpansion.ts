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

import type { ObjectConfig, ExpandedObjectConfig, ControlConfig } from '../schemas/simulation';
import { expandContainerObjects, type ExpansionEnv } from './containerExpansion';
import { makeRamp, type Ramp } from './ramp';
import { isPolarVector } from './unitConversion';
import { reportDiagnostic } from './diagnosticsBus';

export interface ObjectExpansionEnv extends ExpansionEnv {
  /** Authored-angle → radians multiplier (angleUnitToRadians(env.angleUnit)). */
  angleScale: number;
  /** environment.airResistance?.enabled — read by the chapter-split check
   *  below (drag is a force; forceless acceleration alongside it is the
   *  mixed-chapter case). */
  airResistanceEnabled: boolean;
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

    // Max-rule friction masking (Bill, 2026-08-06 remix drive): the engines
    // combine contact friction as max-of-the-pair, so a rider whose µ is
    // BELOW its surface's µ is silently governed by the surface — and any
    // friction slider bound to the rider is dead across [0, surface µ). The
    // seatOn pair is the declared contact, so this is live config-state
    // truth (the bus's semantic). Deliberately a DIAGNOSTIC, not a prompt
    // change: how GIST represents pair friction to users and the LLM is a
    // held design question (see the ramps note, Open questions).
    const riderMu = obj.friction ?? 0;
    const surfaceMu = target.object.friction;
    if (riderMu < surfaceMu) {
      reportDiagnostic(
        `seat-friction-masked:${obj.id}`,
        `seatRiders: "${obj.id}" has friction ${riderMu}, but its seatOn surface ` +
          `"${obj.seatOn}" has ${surfaceMu} (delta ${Math.round((riderMu - surfaceMu) * 1e4) / 1e4}). ` +
          `Engines take the MAX of the pair, so the contact runs at µ = ${surfaceMu} — ` +
          `the rider's own friction, and any friction slider bound to it, do nothing ` +
          `below ${surfaceMu}. For a slider-governed contact, author the surface at 0 ` +
          `and put µ on the rider.`,
      );
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
 * CHAPTER-SPLIT CHECK (ratified 2026-08-09, Bill — Notes_on_Applied_Forces_
 * Refactor.md "The chapter split"). `ObjectConfig.acceleration` is a KINEMATIC
 * STIPULATION: "this body accelerates at a", cause unmodelled, integrated
 * app-side on top of gravity (invariant #9). It exists for the kinematics
 * chapter, which physics teachers reach BEFORE Newton's laws — so a sim can
 * show constant acceleration without owing anyone a force story.
 *
 * That makes it silently surprising in a DYNAMICS scene. Motion it injects is
 * real — the finite difference sees it, so force-net renders m·a for it — but
 * NO component arrow explains it, because there is no force behind it. The
 * free-body diagram cannot close, and the discrepancy looks like a physics bug
 * rather than an authoring choice. Bill's framing: "unexpected if you don't
 * know it's there."
 *
 * So: not an error, not a drop, not a silent override — a BUS ENTRY, fired
 * when forceless acceleration shares a body with real forces. Gravity is
 * deliberately NOT a trigger: additivity over gravity is the field's ratified
 * contract (invariant #9) and the prompt already teaches the gravity
 * double-count separately. Triggers are the forces that put the scene in the
 * OTHER chapter: friction, air resistance, and (once it lands) applied force.
 *
 * Authored config state only, never runtime — the ratified bus semantic.
 */
/**
 * Magnitude of an authored vector in EITHER form. The seam's diagnostics run
 * pre-normalization, so every "is this field non-zero?" test has to survive a
 * polar authoring (velocity, acceleration and appliedForce all accept it).
 * Returns 0 for an absent field, which is what "not authored" means here.
 */
function vectorMagnitude(v: ObjectConfig['acceleration']): number {
  if (!v) return 0;
  return isPolarVector(v) ? Math.abs(v.magnitude) : Math.hypot(v.x, v.y);
}

/** Render an authored vector back in the form its author wrote it in. */
function describeVector(v: ObjectConfig['acceleration']): string {
  if (!v) return '(none)';
  return isPolarVector(v)
    ? `{magnitude: ${v.magnitude}, angle: ${v.angle}}`
    : `{x: ${v.x}, y: ${v.y}}`;
}

function checkChapterSplit(
  objects: ExpandedObjectConfig[],
  airResistanceEnabled: boolean,
): void {
  for (const obj of objects) {
    // Runs BEFORE scaleObjectToSI, so vectors here are still in the authoring
    // union — polar or cartesian. Compare magnitudes, never raw .x/.y (a polar
    // {magnitude, angle} has no .x, so the old component test read undefined
    // and silently never fired).
    const a = vectorMagnitude(obj.acceleration);
    if (a === 0) continue;

    const reasons: string[] = [];
    // Authored non-zero µ. Nothing runs Zod at runtime (invariant #1), so an
    // absent field really is absent — an explicit author, not a default.
    if ((obj.friction ?? 0) !== 0) reasons.push(`friction ${obj.friction}`);
    // dragCoefficient 0 is the documented per-body opt-out of air resistance.
    if (airResistanceEnabled && obj.dragCoefficient !== 0) reasons.push('air resistance');
    // The sharpest case of all (landed with applied-forces Phase 2): the body
    // carries BOTH a forceless kinematic stipulation and the named force that
    // its author probably meant to reach for instead.
    if (vectorMagnitude(obj.appliedForce) !== 0) reasons.push('an applied force');

    if (reasons.length === 0) continue;

    reportDiagnostic(
      `kinematic-acceleration-in-force-scene:${obj.id}`,
      `checkChapterSplit: "${obj.id}" authors acceleration ${describeVector(obj.acceleration)} ` +
        `(a forceless KINEMATIC stipulation, added on top of gravity) while also ` +
        `carrying ${reasons.join(' and ')}. The acceleration is applied as authored ` +
        `and shows up in force-net as m·a, but no force arrow accounts for it, so a ` +
        `free-body diagram on this body will NOT close. That is expected for a ` +
        `kinematics-chapter sim and surprising in a forces sim — ` +
        (vectorMagnitude(obj.appliedForce) !== 0
          ? `and this body ALREADY names its cause as appliedForce ` +
            `${describeVector(obj.appliedForce)}. The two superpose ` +
            `(a_total = a_authored + F/m), so the body accelerates faster than F/m ` +
            `predicts and the mass slider no longer tells the whole story. If the ` +
            `lesson is Newton's 2nd law, drop the acceleration and let the force ` +
            `do the work.`
          : `if you meant "a force pushes this", author appliedForce instead of ` +
            `the acceleration.`),
    );
  }
}

/**
 * FRICTION-SLIDER MASKING (scoped 2026-08-09, Bill — the friction-representation
 * hold's interim instrument, broadened).
 *
 * Both engines combine contact friction as MAX of the pair, so a friction
 * slider bound to object X is DEAD across [slider.min, µ_other] for any object
 * whose µ exceeds the slider's floor: the contact runs at the other body's µ
 * and the student's slider does nothing until it climbs past it. Not an error
 * — a silently deadened control, which is worse.
 *
 * This generalizes `seat-friction-masked` (seatRiders above), which only ever
 * covered the DECLARED seatOn contact pair and therefore missed every other
 * geometry — the case that actually bit us was a remix that raised a ramp's µ
 * to 0.6 over a slider-governed rider's 0.4.
 *
 * SCOPE (Bill's call): compare against EVERY other object in the sim, not just
 * static ones. We cannot know at config time which bodies will touch, and
 * guessing from geometry would be a contact inference the seam has no business
 * making. The rule this encodes is a dev-facing EXPECTATION instead — while
 * exploring forces, **the friction slider's value should be the operative µ for
 * all object interactions in the scene.** Anything that could override it is
 * worth surfacing, and the broad net deliberately sets the stage for the
 * pair-friction discussion rather than pre-empting it.
 *
 * Config-state truth only, never runtime — the ratified bus semantic. A slider
 * DRAG does not re-evaluate this (matching seat-friction-masked).
 */
export function checkFrictionSliderMasking(
  objects: ExpandedObjectConfig[],
  controls: readonly ControlConfig[],
): void {
  for (const c of controls) {
    if (c.type !== 'slider' || c.property !== 'friction') continue;

    const floor = c.min;
    const offenders = objects
      .filter((o) => o.id !== c.targetObj && (o.friction ?? 0) > floor)
      .map((o) => ({ id: o.id, mu: o.friction as number }))
      .sort((a, b) => b.mu - a.mu);
    if (offenders.length === 0) continue;

    const highest = offenders[0].mu;
    // µ ≥ slider max means the control is inert across its ENTIRE range, not
    // merely floored — worth saying differently, it reads as a broken sim.
    const whollyDead = highest >= c.max;
    const list = offenders.map((o) => `"${o.id}" (µ ${o.mu})`).join(', ');

    reportDiagnostic(
      `friction-slider-masked:${c.targetObj}`,
      `checkFrictionSliderMasking: the "${c.label}" slider drives friction on ` +
        `"${c.targetObj}" over [${c.min}, ${c.max}], but ${list} ` +
        `${offenders.length === 1 ? 'carries' : 'carry'} a higher µ. Engines take ` +
        `the MAX of a contact pair, so ` +
        (whollyDead
          ? `this slider does NOTHING anywhere in its range — every contact with ` +
            `those bodies runs at µ = ${highest}.`
          : `the slider is dead from ${c.min} to ${highest}: below ${highest} the ` +
            `contact still runs at µ = ${highest}.`) +
        ` For the slider to be the operative µ for all interactions, author the ` +
        `other objects' friction as 0 and put µ only on "${c.targetObj}".`,
    );
  }
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
  const seated = seatRiders(complete, ramped.ramps, env.angleScale);
  // Runs last, on settled ids, and mutates nothing — a pure authoring check.
  checkChapterSplit(seated, env.airResistanceEnabled);
  return seated;
}
