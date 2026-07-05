import type { SimulationConfig } from '../components/JsonSimulation';

// The static dev-sim ingestion hook — the ONE documented cast site for the
// src/simulations/*.json path. TypeScript widens JSON literals ("m" → string),
// so imported configs can't type-check against the config prop's union types;
// nothing runtime-parses them either (see parking_lot.md → "runtime ingestion
// boundary" update 2026-07-04). If that boundary ever lands,
// SimulationConfigSchema.parse() replaces this cast and every local sim gets
// real validation for free.
export function asLocalSimConfig(json: unknown): SimulationConfig {
  return json as SimulationConfig;
}
