import { useEffect, forwardRef } from 'react';
import { usePhysics } from '../../../contexts/PhysicsContext';
import type { ObjectConfig } from './types';
import type { BodyDef, PhysicsBody, ShapeDescriptor } from '../../../physics/types';
import { getManifestItem } from '../../../lib/renderableManifest';
import { scaleManifestColliderToShape } from '../../../physics/shapeHelpers';

// Phase 2a air-resistance defaults. The per-frame quadratic drag model in
// JsonSimulation reads `userData.dragCdA` (= Cd · A, factored apart from
// air density so airDensity can vary at runtime) and multiplies by ½·ρ each
// frame to produce k.
//
// Reference-area default uses the diorama-scoped LINEAR-A rule: A is the
// body's widest horizontal extent (the bounding-box `width` in this layer),
// not the body's 2D area. Justified in the in-app "Design philosophy" doc
// and Notes_on_Air_Resistance_Refactor.md "Design rationale" section. The
// linear-A choice gives drag enough authority over motion to be visible at
// canvas-scale drops (10–30 m, 1–5 s); the trade is that absolute terminal
// velocities don't match Wikipedia, but qualitative ordering across objects
// (feather < baseball < bowling ball) is preserved.
//
// Cd default still dispatches by shape type; authors override via the
// per-object `dragCoefficient` field when they need a different value.
function defaultCd(shape: ShapeDescriptor): number {
  switch (shape.type) {
    case 'circle': return 0.47;       // smooth sphere
    case 'rectangle': return 1.05;    // cube broadside
    case 'polygon': return 1.0;       // generic
    case 'compound': return 1.0;      // generic
  }
}

const ObjectRenderer = forwardRef<PhysicsBody, ObjectConfig>(function ObjectRenderer(
  {
    id,
    x,
    y,
    width,
    height,
    svg,
    velocity,
    acceleration,
    restitution = 0.8,
    friction = 0,
    dragCoefficient,
    referenceArea,
    isStatic = false,
    angularVelocity = 0,
    angle = 0,
    mass = 1,
    inertia,
  },
  ref
) {
  const adapter = usePhysics();

  useEffect(() => {
    if (!adapter) return;

    const item = getManifestItem(svg);
    let shape: ShapeDescriptor;
    if (item && item.physical_properties.collider) {
      shape = scaleManifestColliderToShape(item.physical_properties.collider, width, height);
    } else {
      if (!item) {
        console.warn(
          `ObjectRenderer: svg "${svg}" not found in manifest; falling back to a plain rectangle collider.`,
        );
      } else {
        // Manifest entry exists but lacks a collider definition (e.g. legacy
        // "basketball" entry). Fall back so the sim still loads.
        console.warn(
          `ObjectRenderer: svg "${svg}" has no collider in manifest; falling back to a plain rectangle collider.`,
        );
      }
      shape = { type: 'rectangle', width, height };
    }

    const def: BodyDef = {
      id,
      position: { x, y },
      shape,
      angle,
      velocity,
      angularVelocity,
      mass,
      inertia,
      restitution,
      friction,
      isStatic,
    };

    const created = adapter.createBody(def);
    created.userData.derivedAcceleration = { x: 0, y: 0 };
    // Persistent acceleration applied per-step by JsonSimulation's update loop.
    // Stored on userData so the adapter stays engine-agnostic — integration
    // happens above the adapter via velocity writes, not via engine forces.
    created.userData.configuredAcceleration = acceleration
      ? { x: acceleration.x, y: acceleration.y }
      : { x: 0, y: 0 };
    // Per-body drag coefficient combination (Cd · A), factored apart from
    // air density. JsonSimulation reads this each frame when air resistance is
    // active and computes k = ½ · airDensity · dragCdA, then writes
    // `setLinearDamping((k/m)·|v|)` to mimic quadratic, mass-dependent drag
    // through the engine's stable damping integrator. dragCdA = 0 (because
    // dragCoefficient = 0 or the shape gives 0 default) opts the body out of
    // air resistance entirely.
    const effectiveCd = dragCoefficient ?? defaultCd(shape);
    const effectiveA = referenceArea ?? width;   // linear-A default: widest horizontal extent
    created.userData.dragCdA = effectiveCd * effectiveA;

    if (ref) {
      if (typeof ref === 'function') {
        ref(created);
      } else {
        ref.current = created;
      }
    }

    return () => {
      adapter.removeBody(created);
      if (ref) {
        if (typeof ref === 'function') {
          ref(null);
        } else if (ref.current) {
          ref.current = null;
        }
      }
    };
    // ref is intentionally excluded — refs are stable callbacks/objects from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, id, x, y, width, height, svg, angle, mass, isStatic]);

  return null;
});

export default ObjectRenderer;
