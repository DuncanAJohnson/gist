import type { PhysicsBody, Vec2 } from '../physics/types';
import type { VectorKind } from '../components/simulation_components/renderables/vectorTheme';

/**
 * THE per-frame value of every vector kind — one compute site, all consumers.
 *
 * Invariant #14's drag precedent, generalized: a quantity that is both fed to
 * the physics and displayed must be resolved in ONE place, or the two drift.
 * Until 2026-08-14 this if-chain lived inside `VectorArrow.ts` and served only
 * the arrows; numeric readouts could not reach any force at all. Wiring the
 * readouts by re-deriving the same values elsewhere would have created exactly
 * the drift the invariant forbids, so the resolution moved here and both the
 * arrow renderer and `JsonSimulation`'s property-path reader now call it.
 * A readout and its arrow cannot disagree because there is nothing to disagree.
 *
 * NOTHING here computes physics. Every value is either read back off the body
 * (velocity), read off `userData` where the runtime stashed it (the contact and
 * applied forces), or derived from MEASURED motion (`force-net` = m·a_derived).
 * Net force is DERIVED, never SUMMED — do not "improve" this by adding the
 * component forces together; that is the gravity double-count invariant #14
 * exists to prevent, and the component arrows' job is to be CHECKED against
 * this net, not to construct it.
 *
 * Mode-agnostic by construction: every source is either a body field or a
 * `userData` slot, and the replay loop restores both from the Frame — so these
 * values are correct in live, precompute and replay alike.
 *
 * @param gravity SI, Y-up (i.e. `{x: 0, y: -9.8}`), so `force-gravity` already
 *                points down.
 * @returns SI values — newtons for the force kinds, m/s and m/s² for the other
 *          two. Unit-scaling to display units happens at the display boundary.
 */
export function resolveVectorKind(
  body: PhysicsBody,
  kind: VectorKind,
  gravity: Vec2,
): Vec2 {
  const ud = body.userData as Record<string, Vec2 | undefined>;
  switch (kind) {
    case 'velocity':
      return { x: body.velocity.x, y: body.velocity.y };

    case 'acceleration': {
      // Finite-differenced Δv/Δt. Undefined for the first live frame, before
      // handleUpdate has run once.
      const d = ud.derivedAcceleration ?? { x: 0, y: 0 };
      return { x: d.x, y: d.y };
    }

    case 'force-net': {
      // Newton's 2nd law read BACKWARD off measured motion (invariant #14).
      const d = ud.derivedAcceleration ?? { x: 0, y: 0 };
      return { x: body.mass * d.x, y: body.mass * d.y };
    }

    case 'force-gravity':
      // Weight, m·g. `gravity` is already the Y-up SI vector, so this points down.
      return { x: body.mass * gravity.x, y: body.mass * gravity.y };

    case 'force-drag': {
      // Quadratic air resistance, vectorized as −k·|v|·v once per frame by
      // JsonSimulation. Only populated when airResistance.enabled; a body at
      // rest or in vacuum reads {0,0}.
      const f = ud.dragForce ?? { x: 0, y: 0 };
      return { x: f.x, y: f.y };
    }

    case 'force-normal': {
      // Engine-read contact normal force. Jitters at rest; zero when the body
      // is free.
      const f = ud.normalForce ?? { x: 0, y: 0 };
      return { x: f.x, y: f.y };
    }

    case 'force-friction': {
      // Engine-read contact friction force.
      const f = ud.frictionForce ?? { x: 0, y: 0 };
      return { x: f.x, y: f.y };
    }

    case 'force-applied': {
      // The RESOLVED applied force (authored + slider + debug), stashed in
      // newtons at a single site in handleUpdate. The same number becomes the
      // per-engine-step impulse, so this is the force that actually acted.
      const f = ud.appliedForce ?? { x: 0, y: 0 };
      return { x: f.x, y: f.y };
    }
  }
}

/**
 * The `force-*` property-path prefixes, derived from the kind list rather than
 * hand-listed, so a new force kind becomes readable the moment it is themed.
 *
 * This is the guard against the failure that motivated the whole change: the
 * force kinds were drawable but not readable, and the LLM — reasoning by
 * analogy from a capability surface rather than from an enumerated list —
 * emitted `force-net.x` in four of four sims (2026-08-14 drive). An asymmetric
 * surface has to be patched with prompt prose; a coherent one does not.
 */
export function isForceKindPath(path: string): boolean {
  return path.startsWith('force-');
}

/** Extract the kind from a `force-net.x` style path, or undefined if unknown. */
export function vectorKindFromPath(
  base: string,
  kinds: readonly string[],
): VectorKind | undefined {
  return kinds.includes(base) ? (base as VectorKind) : undefined;
}
