import type { AdapterOptions, PhysicsAdapter } from './types';
import { MatterAdapter } from './matter/MatterAdapter';

export type PhysicsEngineKind = 'matter' | 'rapier';

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
    case 'rapier':
      throw new Error('RapierAdapter not yet implemented (PR 5)');
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
