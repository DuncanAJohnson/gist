/**
 * Loader and typed accessor for public/renderables/manifest.json.
 *
 * The manifest catalogues every approved SVG asset in /public/renderables.
 * Each entry's `physical_properties.collider` defines the collider shape in the
 * sprite's own viewBox (Y down). Most sprites are 64×64, but rescaled assets
 * are non-square (e.g. `dynamics_cart` is 64×27.43), and
 * `scaleManifestColliderToShape` needs the true viewBox dims to map the
 * collider without distorting the off-64 axis. Since manifest_version 2 each
 * entry bakes them as `view_box: [minX, minY, width, height]`; entries that
 * lack the field (v1 manifests, malformed-SVG nulls) fall back to fetching
 * the sprite and parsing its viewBox attribute at load time. Object configs
 * reference an entry by name (`object.svg`); at simulation load time we read
 * the collider out of the manifest and scale it to the object's bounding box.
 */

export const MANIFEST_VIEWBOX = 64;

export type ManifestCollider =
  // 'polygon' is the manifest_version-2 tag; 'convex' the legacy v1 spelling.
  // Both mean the same thing: an outline (possibly concave) that
  // decomposePolygonShape splits into a convex compound.
  | { type: 'polygon' | 'convex'; vertices: [number, number][] }
  | { type: 'box'; width: number; height: number; center: [number, number] }
  | { type: 'circle'; radius: number; center: [number, number] };

export interface ManifestItem {
  name: string;
  display_name: string;
  status: string;
  version?: number;
  color_tag?: string | null;
  parent?: string | null;
  /**
   * The sprite's authoring viewBox, baked by the exporter since
   * manifest_version 2. Null when the exporter couldn't parse the SVG —
   * consumers fall back to fetch-and-infer for that entry.
   */
  view_box?: [number, number, number, number] | null;
  physical_properties: {
    // null in some shipped entries (e.g. "basketball") — consumers must
    // guard and fall back to a rectangle collider.
    collider: ManifestCollider | null;
  };
  /**
   * The sprite's authoring viewBox dimensions: the baked `view_box` when
   * present, else parsed from the SVG at load time. Used to scale the
   * collider per-axis (non-square sprites). Absent if both paths failed —
   * callers fall back to a square MANIFEST_VIEWBOX.
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
        const baked = viewBoxFromEntry(entry);
        if (baked) entry.viewBox = baked;
        map.set(entry.name, entry);
      }
      // Attach each sprite's true viewBox before publishing the cache, so the
      // invariant "item present ⟹ viewBox known" holds for collider scaling.
      // manifest_version 2 bakes `view_box` per entry (read above), so this
      // fetch-and-parse pass only covers entries that lack it (v1 manifests,
      // null bakes). Best-effort and parallel: a failed fetch/parse just
      // leaves viewBox undefined (mapper falls back to MANIFEST_VIEWBOX).
      await Promise.all(
        [...map.values()]
          .filter((entry) => !entry.viewBox)
          .map(async (entry) => {
            const vb = await parseViewBox(entry.name);
            if (vb) entry.viewBox = vb;
          }),
      );
      manifestCache = map;
      return map;
    });
  return manifestPromise;
}

/**
 * Read the baked `view_box` field (manifest_version 2) off an entry. The
 * origin (minX/minY) is carried in the tuple but ignored — colliders are
 * authored against an origin of (0,0), the same assumption the SVG-parse
 * path has always made. Returns null when the field is absent or malformed
 * so callers fall back to fetch-and-parse.
 */
function viewBoxFromEntry(
  entry: ManifestItem,
): { width: number; height: number } | null {
  const vb = entry.view_box;
  if (!Array.isArray(vb) || vb.length !== 4) return null;
  const [, , width, height] = vb;
  if (!Number.isFinite(width) || width <= 0) return null;
  if (!Number.isFinite(height) || height <= 0) return null;
  return { width, height };
}

// Matches `viewBox="minX minY width height"` and captures width + height.
const VIEWBOX_RE = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)/;

/**
 * Pull the viewBox width/height out of raw SVG text. Returns null when the
 * attribute is missing or the dims are non-positive.
 */
export function parseViewBoxText(
  text: string,
): { width: number; height: number } | null {
  const match = VIEWBOX_RE.exec(text);
  if (!match) return null;
  const width = parseFloat(match[1]);
  const height = parseFloat(match[2]);
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height };
}

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
    return parseViewBoxText(await res.text());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Runtime-imported renderables (debug "Import Object" feature).
//
// Entries registered here exist only in this browser session: the SVG text
// becomes a blob URL and the manifest item lives in these maps, which are
// consulted BEFORE the on-disk manifest. Saving a sim that references an
// imported name will NOT carry the SVG — on reload the name won't resolve
// and ObjectRenderer falls back to a rectangle collider.

const importedItems = new Map<string, ManifestItem>();
const importedUrls = new Map<string, string>();

/**
 * Register an SVG + manifest entry imported at runtime, making the name
 * resolvable by `getManifestItem`/`getRenderablePath` for this session.
 * Prefers the entry's baked `view_box`, else parses the viewBox out of the
 * SVG text (same invariant loadManifest maintains: item present ⟹ viewBox
 * known when derivable). Re-importing the same name replaces the previous
 * registration.
 */
export function registerImportedRenderable(
  item: ManifestItem,
  svgText: string,
): ManifestItem {
  const vb = viewBoxFromEntry(item) ?? parseViewBoxText(svgText);
  const entry: ManifestItem = { ...item, ...(vb ? { viewBox: vb } : {}) };
  const old = importedUrls.get(entry.name);
  if (old) URL.revokeObjectURL(old);
  importedUrls.set(
    entry.name,
    URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' })),
  );
  importedItems.set(entry.name, entry);
  return entry;
}

/**
 * Synchronous accessor. Returns the manifest entry for `name`, or null if the
 * manifest hasn't loaded yet or the name isn't recognised. Callers that need
 * to wait should call `loadManifest()`. Runtime-imported entries win over
 * on-disk ones.
 */
export function getManifestItem(name: string): ManifestItem | null {
  const imported = importedItems.get(name);
  if (imported) return imported;
  if (!manifestCache) return null;
  return manifestCache.get(name) ?? null;
}

/**
 * Asset path for the SVG sprite associated with an approved entry. For
 * runtime-imported entries this is a session-local blob URL.
 */
export function getRenderablePath(name: string): string {
  return importedUrls.get(name) ?? `/renderables/${name}.svg`;
}

// Eager-fetch on module import so the manifest is usually populated before
// any consumer reads it. Consumers that may run before fetch settles should
// gate on `loadManifest()`.
loadManifest().catch((err) => {
  console.error('renderableManifest: failed to load manifest', err);
});
