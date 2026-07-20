/**
 * Duplicate-object-id guard (parking_lot.md "Duplicate object ids kill the
 * page", parked 2026-07-15 — fix path 1, landed 2026-07-20).
 *
 * Both adapters correctly THROW on a duplicate body id, but nothing above
 * the adapter catches it: the second ObjectRenderer's body-build effect
 * throws, and with no error boundary the whole React tree unmounts — a dead
 * white page from a JSON typo. The refusal is right; the blast radius is
 * the bug.
 *
 * This guard runs at the seams instead: rename each LATER occurrence of a
 * duplicated id (`payload` → `payload-2`) and report to the seam
 * diagnostics bus. Renaming the later occurrence keeps property bindings
 * (controls/outputs/graphs target objects by id) resolving to the FIRST —
 * the "first wins" intuition; the bus badge makes the rename loud so
 * bindings meant for the renamed object aren't silently rewired.
 *
 * Two-layer architecture (decided with Bill 2026-07-20):
 *  - COMMIT boundaries REJECT: the Tweak-JSON editor (JsonEditor) and the
 *    paste-to-create path (CreateSimulation) block saving JSON with
 *    duplicate ids via `findDuplicateObjectIds`, exactly like a parse
 *    error — you literally can't persist one.
 *  - The RUNTIME seam RENAMES as a backstop: JsonSimulation's expansion
 *    memo runs `dedupeObjectIds` so a sim that arrives broken from
 *    elsewhere (legacy DB rows, paths that predate the editor guard)
 *    renders best-effort with a bus diagnostic instead of white-paging.
 *    That badge is LIVE truth — the loaded config really does carry
 *    duplicates — which keeps the diagnostics bus free of past-event
 *    notices. When the runtime ingestion boundary lands (parking_lot.md),
 *    both checks move there.
 */

import { reportDiagnostic } from './diagnosticsBus';

/**
 * Ids that appear more than once (each listed once), for commit-boundary
 * rejection. Non-string ids are ignored — this guard owns only uniqueness.
 */
export function findDuplicateObjectIds(objects: Array<{ id?: unknown }>): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const obj of objects) {
    if (typeof obj?.id !== 'string') continue;
    if (seen.has(obj.id)) dups.add(obj.id);
    else seen.add(obj.id);
  }
  return [...dups];
}

/**
 * Return `objects` with later duplicate ids renamed to the first free
 * `<id>-N` (N ≥ 2, also dodging ids that appear later in the array).
 * Reference-preserving when there is nothing to rename, so memo consumers
 * don't churn. Objects without a string id pass through untouched — they
 * fail elsewhere; this guard owns only uniqueness.
 */
export function dedupeObjectIds<T extends { id: string }>(objects: T[]): T[] {
  const all = new Set<string>();
  for (const obj of objects) {
    if (typeof obj.id === 'string') all.add(obj.id);
  }
  const used = new Set<string>();
  let renamed = false;
  const out = objects.map((obj) => {
    if (typeof obj.id !== 'string') return obj;
    if (!used.has(obj.id)) {
      used.add(obj.id);
      return obj;
    }
    let n = 2;
    let candidate = `${obj.id}-${n}`;
    while (used.has(candidate) || all.has(candidate)) {
      n += 1;
      candidate = `${obj.id}-${n}`;
    }
    used.add(candidate);
    renamed = true;
    reportDiagnostic(
      `dup-id-renamed:${obj.id}->${candidate}`,
      `Duplicate object id "${obj.id}" — this later occurrence was renamed to ` +
        `"${candidate}" (duplicate ids would crash the physics engine). Controls/` +
        `outputs/graphs bound to "${obj.id}" resolve to the FIRST object; if they ` +
        `were meant for this one, fix the ids in the JSON.`,
    );
    return { ...obj, id: candidate };
  });
  return renamed ? out : objects;
}
