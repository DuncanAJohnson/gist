/**
 * Loader and typed accessor for public/renderables/manifest.json.
 *
 * The manifest catalogues every approved SVG asset in /public/renderables.
 * Each entry's `physical_properties.collider` defines the collider shape in the
 * sprite's own viewBox (Y down). Most sprites are 64×64, but rescaled assets
 * are non-square (e.g. `dynamics_cart` is 64×27.43) — so at load time we also
 * fetch each sprite and record its true `viewBox` dims, which
 * `scaleManifestColliderToShape` needs to map the collider without distorting
 * the off-64 axis. Object configs reference an entry by name (`object.svg`);
 * at simulation load time we read the collider out of the manifest and scale
 * it to the object's bounding box.
 */

export const MANIFEST_VIEWBOX = 64;

export type ManifestCollider =
  | { type: 'convex'; vertices: [number, number][] }
  | { type: 'box'; width: number; height: number; center: [number, number] }
  | { type: 'circle'; radius: number; center: [number, number] };

export interface ManifestItem {
  name: string;
  display_name: string;
  status: string;
  version?: number;
  color_tag?: string | null;
  parent?: string | null;
  physical_properties: {
    collider: ManifestCollider;
  };
  /**
   * The sprite's authoring viewBox dimensions, parsed from the SVG at load
   * time. Used to scale the collider per-axis (non-square sprites). Absent if
   * the SVG fetch/parse failed — callers fall back to a square MANIFEST_VIEWBOX.
   */
  viewBox?: { width: number; height: number };
}

let manifestPromise: Promise<Map<string, ManifestItem>> | null = null;
let manifestCache: Map<string, ManifestItem> | null = null;

/**
 * Kick off (or return the in-flight) fetch of the manifest. Resolves with a
 * Map keyed by entry `name`. Approved entries only.
 */
export function loadManifest(): Promise<Map<string, ManifestItem>> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch('/renderables/manifest.json')
    .then((r) => r.json())
    .then(async (data: { items: ManifestItem[] }) => {
      const map = new Map<string, ManifestItem>();
      for (const entry of data.items ?? []) {
        if (entry.status && entry.status !== 'approved') continue;
        if (!entry.name) continue;
        map.set(entry.name, entry);
      }
      // Attach each sprite's true viewBox before publishing the cache, so the
      // invariant "item present ⟹ viewBox known" holds for collider scaling.
      // Best-effort and parallel: a failed fetch/parse just leaves viewBox
      // undefined (mapper falls back to a square MANIFEST_VIEWBOX).
      await Promise.all(
        [...map.values()].map(async (entry) => {
          const vb = await parseViewBox(entry.name);
          if (vb) entry.viewBox = vb;
        }),
      );
      manifestCache = map;
      return map;
    });
  return manifestPromise;
}

// Matches `viewBox="minX minY width height"` and captures width + height.
const VIEWBOX_RE = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)/;

/**
 * Fetch a sprite and pull its viewBox width/height. Returns null on any
 * failure (network, missing attribute, non-positive dims) so the caller can
 * fall back to the square default.
 */
async function parseViewBox(
  name: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(getRenderablePath(name));
    if (!res.ok) return null;
    const match = VIEWBOX_RE.exec(await res.text());
    if (!match) return null;
    const width = parseFloat(match[1]);
    const height = parseFloat(match[2]);
    if (!(width > 0) || !(height > 0)) return null;
    return { width, height };
  } catch {
    return null;
  }
}

/**
 * Synchronous accessor. Returns the manifest entry for `name`, or null if the
 * manifest hasn't loaded yet or the name isn't recognised. Callers that need
 * to wait should call `loadManifest()`.
 */
export function getManifestItem(name: string): ManifestItem | null {
  if (!manifestCache) return null;
  return manifestCache.get(name) ?? null;
}

/**
 * Asset path for the SVG sprite associated with an approved entry.
 */
export function getRenderablePath(name: string): string {
  return `/renderables/${name}.svg`;
}

// Eager-fetch on module import so the manifest is usually populated before
// any consumer reads it. Consumers that may run before fetch settles should
// gate on `loadManifest()`.
loadManifest().catch((err) => {
  console.error('renderableManifest: failed to load manifest', err);
});
