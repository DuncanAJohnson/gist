/**
 * Seam diagnostics bus (scoped 2026-07-19, Notes_on_Concave_Colliders_Refactor.md).
 *
 * Load-time authoring warnings at the gist-owned seams (over-cap colliders,
 * container-expansion drops, future ingestion-boundary checks) used to reach
 * only the dev console — a pull channel. The baseball-on-Planck drive proved
 * the channel fails even when the guard works: the CC2 warn fired correctly
 * and the invisible rehulled collider was still diagnosed by physics
 * reasoning, not the console. This bus is the push channel: producers call
 * `reportDiagnostic()`, which still console.warns AND records a keyed entry
 * in this module-level session store; the debug panel surfaces the store as
 * an amber badge + expandable list (dev-gated there, not here — the CC2
 * producer is already DEV-gated at its callsite, and the container-expansion
 * warns have always fired in all builds; this module preserves both).
 *
 * One mechanism, many producers: initial producers are the CC2 over-cap warn
 * (shapeHelpers.warnOnOverCapParts) and the container-expansion seam's
 * warn/drop cases (containerExpansion.ts). The parked dup-id warning and
 * ingestion-boundary checks will surface here too when they land — the bus
 * is the surface, not the fix.
 *
 * Keyed entries dedupe for free: React StrictMode double-invokes the
 * render-time seams, so the same diagnostic reports twice with the same key —
 * the store keeps the first and ignores repeats (the console.warn passthrough
 * still fires every call, preserving pre-bus console behavior). Same
 * singleton pattern as registerImportedRenderable: plain module state, no
 * React dependency, safe in headless tsx harnesses (no import.meta reads).
 */

export interface SeamDiagnostic {
  /** Stable dedupe key — same underlying condition must produce the same key. */
  key: string;
  /** Human-readable message, the same text handed to console.warn. */
  message: string;
}

const store = new Map<string, SeamDiagnostic>();
const listeners = new Set<() => void>();
/**
 * Cached immutable snapshot for useSyncExternalStore — must keep a stable
 * reference between mutations or React re-renders forever.
 */
let snapshot: readonly SeamDiagnostic[] = [];

/**
 * Producers (and the expansion memo's clear) run during render on purpose, so
 * notifying subscribers synchronously would setState another component
 * mid-render. Coalesce into one microtask: safe ordering AND a burst of
 * reports from one expansion becomes a single badge update.
 */
let notifyScheduled = false;
function notify(): void {
  if (notifyScheduled) return;
  notifyScheduled = true;
  queueMicrotask(() => {
    notifyScheduled = false;
    listeners.forEach((l) => l());
  });
}

/**
 * Report a diagnostic: console.warn(message, ...consoleArgs) unconditionally
 * (extra args keep inspectable objects, e.g. a caught error), then record it
 * under `key` unless an entry with that key already exists.
 */
export function reportDiagnostic(
  key: string,
  message: string,
  ...consoleArgs: unknown[]
): void {
  console.warn(message, ...consoleArgs);
  if (store.has(key)) return;
  store.set(key, { key, message });
  snapshot = Array.from(store.values());
  notify();
}

/** Subscribe to store changes (useSyncExternalStore-compatible). */
export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current entries, insertion-ordered; reference-stable between changes. */
export function getDiagnosticsSnapshot(): readonly SeamDiagnostic[] {
  return snapshot;
}

/**
 * Empty the store — called by the expansion memo at each config re-expansion
 * so diagnostics always describe the CURRENT config (a fixed sim must drop
 * its stale badge without a page reload), and by tests/harnesses.
 */
export function clearDiagnostics(): void {
  if (store.size === 0) return;
  store.clear();
  snapshot = [];
  notify();
}
