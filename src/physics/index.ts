import type { AdapterOptions, PhysicsAdapter } from './types';
import { MatterAdapter } from './matter/MatterAdapter';

export type PhysicsEngineKind = 'matter' | 'rapier' | 'planck';

/**
 * Factory for physics adapters. Rapier is loaded via dynamic import so the
 * WASM bundle is code-split and Matter-only sims don't pay the cost.
 */
export async function createPhysicsAdapter(
  kind: PhysicsEngineKind,
  opts: AdapterOptions = {},
): Promise<PhysicsAdapter> {
  let adapter: PhysicsAdapter;
  switch (kind) {
    case 'matter':
      adapter = new MatterAdapter(opts);
      break;
    case 'rapier': {
      // Dynamic import so the ~2 MB Rapier WASM bundle is code-split away
      // from Matter-only sims and only loaded on demand.
      const { RapierAdapter } = await import('./rapier/RapierAdapter');
      adapter = new RapierAdapter(opts);
      break;
    }
    case 'planck': {
      const { PlanckAdapter } = await import('./planck/PlanckAdapter');
      adapter = new PlanckAdapter(opts);
      break;
    }
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown physics engine kind: ${_exhaustive}`);
    }
  }
  await adapter.init();
  return adapter;
}

export type { PhysicsAdapter, PhysicsBody, BodyDef, WallDef, ShapeDescriptor, Vec2, WorldSnapshot } from './types';
export { MatterAdapter } from './matter/MatterAdapter';

/**
 * Temporary bridge used during migration (PRs 2–3): extract the underlying
 * Matter.js engine from a PhysicsAdapter. Throws if the adapter is not a
 * MatterAdapter. Will be removed once all call sites use the engine-agnostic
 * adapter API directly.
 */
export function getMatterEngine(adapter: PhysicsAdapter): import('matter-js').Engine {
  if (adapter.kind !== 'matter') {
    throw new Error(`getMatterEngine: adapter is '${adapter.kind}', expected 'matter'`);
  }
  return (adapter as MatterAdapter).matterEngine;
}
