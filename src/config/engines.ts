import type { PhysicsEngineKind } from '../physics';

/**
 * Site-admin config: which physics engines are available in this deployment.
 *
 * - `ENABLED_ENGINES` controls which options appear in the in-app EngineSwitcher
 *   and which engines a simulation config is allowed to request. A config that
 *   names a disabled engine transparently falls back to `DEFAULT_ENGINE`.
 * - `DEFAULT_ENGINE` is used when a simulation config omits `environment.physicsEngine`
 *   and when the requested engine is disabled. Must be one of `ENABLED_ENGINES`.
 *
 * To disable an engine site-wide, remove it from `ENABLED_ENGINES`. Both fields
 * are imported at build time, so changes require a redeploy.
 */
export const ENABLED_ENGINES: readonly PhysicsEngineKind[] = [
  'rapier',
  'planck',
] as const;

export const DEFAULT_ENGINE: PhysicsEngineKind = 'rapier';

export function isEngineEnabled(kind: PhysicsEngineKind): boolean {
  return ENABLED_ENGINES.includes(kind);
}

/** Resolve a possibly-disabled engine choice to one that's actually enabled. */
export function resolveEngine(requested: PhysicsEngineKind | undefined): PhysicsEngineKind {
  if (requested && isEngineEnabled(requested)) return requested;
  return DEFAULT_ENGINE;
}
