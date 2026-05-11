import type { AdapterOptions, PhysicsAdapter } from './types';

export type PhysicsEngineKind = 'rapier' | 'planck';

/**
 * Factory for physics adapters. Engines are dynamically imported so each
 * WASM/JS bundle is code-split and only loaded when its adapter is requested.
 */
export async function createPhysicsAdapter(
  kind: PhysicsEngineKind,
  opts: AdapterOptions = {},
): Promise<PhysicsAdapter> {
  let adapter: PhysicsAdapter;
  switch (kind) {
    case 'rapier': {
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
