/**
 * Loader and typed accessor for public/renderables/manifest.json.
 *
 * The manifest catalogues every approved SVG asset in /public/renderables.
 * Each entry's `physical_properties.collider` defines the collider shape in a
 * 64×64 coordinate space matching the SVG's viewBox. Object configs reference
 * an entry by name (`object.svg`); at simulation load time we read the
 * collider out of the manifest and scale it to the object's bounding box.
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
    .then((data: { items: ManifestItem[] }) => {
      const map = new Map<string, ManifestItem>();
      for (const entry of data.items ?? []) {
        if (entry.status && entry.status !== 'approved') continue;
        if (!entry.name) continue;
        map.set(entry.name, entry);
      }
      manifestCache = map;
      return map;
    });
  return manifestPromise;
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
