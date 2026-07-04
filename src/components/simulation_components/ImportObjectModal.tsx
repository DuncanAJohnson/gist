import { useMemo, useRef, useState } from 'react';
import type { ManifestItem } from '../../lib/renderableManifest';
import { readZip } from '../../lib/zipReader';

/**
 * Debug-mode "Import Object" modal. Loads an SVG-generator export — the
 * "Download approved" zip (SVG files + manifest.json) or loose .svg/.json
 * files — pairs each manifest entry with its SVG, and hands the chosen pair
 * to the parent to inject into the running simulation as a new object.
 *
 * Session-only by design: the SVG never touches /public/renderables, so
 * saving a sim that references an imported object won't survive a reload.
 * This is an instrument for testing generator output, not an asset pipeline.
 */

export interface ImportCandidate {
  item: ManifestItem;
  svgText: string;
}

/**
 * Optional slider controls the user can attach at import. Keys map to slider
 * configs built in JsonSimulation.handleImportObject (property path + range);
 * this modal only collects the selection.
 */
export type ImportControlPreset = 'speed' | 'launch-angle' | 'accel-x' | 'accel-y';

const PRESET_OPTIONS: Array<{ key: ImportControlPreset; label: string }> = [
  { key: 'speed', label: 'Speed (|v|)' },
  { key: 'launch-angle', label: 'Launch angle' },
  { key: 'accel-x', label: 'Acceleration X' },
  { key: 'accel-y', label: 'Acceleration Y' },
];

interface ImportObjectModalProps {
  onClose: () => void;
  onImport: (
    candidate: ImportCandidate,
    opts: { isStatic: boolean; presets: ImportControlPreset[] },
  ) => void;
}

// The export manifest is `{ items: [...] }` (zip flow), but tolerate a bare
// entry object or a bare array so single-item downloads also work.
function parseManifestItems(text: string): ManifestItem[] {
  const data = JSON.parse(text);
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && typeof data.name === 'string') return [data];
  return [];
}

const fileStem = (filename: string) =>
  filename.replace(/^.*\//, '').replace(/\.[^.]+$/, '');

async function parseFiles(files: File[]): Promise<ImportCandidate[]> {
  const svgs = new Map<string, string>(); // stem -> svg text
  const items: ManifestItem[] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      const decoder = new TextDecoder();
      for (const entry of await readZip(await file.arrayBuffer())) {
        const entryLower = entry.name.toLowerCase();
        if (entryLower.endsWith('.svg')) {
          svgs.set(fileStem(entry.name), decoder.decode(entry.bytes));
        } else if (entryLower.endsWith('.json')) {
          items.push(...parseManifestItems(decoder.decode(entry.bytes)));
        }
      }
    } else if (lower.endsWith('.svg')) {
      svgs.set(fileStem(file.name), await file.text());
    } else if (lower.endsWith('.json')) {
      items.push(...parseManifestItems(await file.text()));
    }
  }

  const candidates: ImportCandidate[] = [];
  for (const item of items) {
    const svgText = svgs.get(item.name);
    if (svgText) candidates.push({ item, svgText });
  }
  if (candidates.length === 0 && svgs.size > 0 && items.length === 0) {
    // SVG(s) with no manifest at all: still importable — ObjectRenderer falls
    // back to a rectangle collider (and warns), which is itself useful signal
    // when testing generator output.
    for (const [stem, svgText] of svgs) {
      candidates.push({
        item: {
          name: stem,
          display_name: stem,
          status: 'approved',
          physical_properties: { collider: null },
        },
        svgText,
      });
    }
  }
  return candidates;
}

function colliderSummary(item: ManifestItem): string {
  const c = item.physical_properties?.collider;
  if (!c) return 'none — will fall back to a rectangle collider';
  if (c.type === 'convex') return `convex outline, ${c.vertices.length} vertices`;
  if (c.type === 'box') return `box ${c.width}×${c.height}, center [${c.center.join(', ')}]`;
  return `circle r=${c.radius}, center [${c.center.join(', ')}]`;
}

function ImportObjectModal({ onClose, onImport }: ImportObjectModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [isStatic, setIsStatic] = useState(false);
  const [presets, setPresets] = useState<ImportControlPreset[]>([]);
  const [error, setError] = useState<string | null>(null);

  const togglePreset = (key: ImportControlPreset) =>
    setPresets((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );

  const selected =
    candidates.find((c) => c.item.name === selectedName) ?? candidates[0] ?? null;

  // Data URL keeps the preview leak-free (no blob URL to revoke) — the real
  // blob URL is only minted on confirm, by registerImportedRenderable.
  const previewSrc = useMemo(
    () =>
      selected
        ? `data:image/svg+xml;utf8,${encodeURIComponent(selected.svgText)}`
        : null,
    [selected],
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    try {
      const parsed = await parseFiles(files);
      if (parsed.length === 0) {
        setError(
          'No importable objects found. Expected a generator export zip, or an .svg plus its manifest .json (matched by name).',
        );
        setCandidates([]);
        return;
      }
      setError(null);
      setCandidates(parsed);
      setSelectedName(parsed[0].item.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCandidates([]);
    } finally {
      // Allow re-selecting the same file after a Re-upload.
      e.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-[480px] w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Import Object</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.svg,.json"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />

        {candidates.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-gray-600 text-sm text-center">
              Load an SVG-generator export: the "Download approved" .zip, or a
              loose .svg together with its manifest .json.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium"
            >
              Choose Export File(s)
            </button>
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          </div>
        )}

        {selected && (
          <div className="flex flex-col gap-5">
            {candidates.length > 1 && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Object ({candidates.length} in export)
                </label>
                <select
                  value={selected.item.name}
                  onChange={(e) => setSelectedName(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                >
                  {candidates.map((c) => (
                    <option key={c.item.name} value={c.item.name}>
                      {c.item.display_name || c.item.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-4 items-start">
              <div className="w-24 h-24 shrink-0 border border-gray-200 rounded bg-gray-50 flex items-center justify-center overflow-hidden">
                {previewSrc && (
                  <img
                    src={previewSrc}
                    alt={selected.item.display_name || selected.item.name}
                    className="max-w-full max-h-full"
                  />
                )}
              </div>
              <div className="text-sm text-gray-700 flex flex-col gap-1 min-w-0">
                <div className="font-semibold truncate">
                  {selected.item.display_name || selected.item.name}
                </div>
                <div className="text-xs text-gray-500">name: {selected.item.name}</div>
                <div
                  className={`text-xs ${selected.item.physical_properties?.collider ? 'text-gray-500' : 'text-amber-600'}`}
                >
                  collider: {colliderSummary(selected.item)}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Body Type</h3>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="importBodyType"
                    checked={!isStatic}
                    onChange={() => setIsStatic(false)}
                  />
                  Dynamic (moves, falls)
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="importBodyType"
                    checked={isStatic}
                    onChange={() => setIsStatic(true)}
                  />
                  Static (immovable)
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Attach Slider Controls
                <span className="ml-1.5 font-normal text-xs text-gray-400">optional</span>
              </h3>
              {isStatic ? (
                <p className="text-xs text-gray-400">
                  Static bodies ignore velocity/acceleration — switch to
                  Dynamic to attach controls.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {PRESET_OPTIONS.map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={presets.includes(key)}
                          onChange={() => togglePreset(key)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Sliders land in the control panel bound to this object;
                    ranges are auto-derived, defaults match the initial state.
                  </p>
                </>
              )}
            </div>

            <p className="text-xs text-gray-400">
              Session-only: the SVG lives in browser memory. Saving this sim
              won't carry the imported artwork. Drag/resize the object on the
              canvas while the sim is at rest.
            </p>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => {
                  setCandidates([]);
                  setSelectedName(null);
                  setError(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
              >
                Re-upload
              </button>
              <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">
                Cancel
              </button>
              <button
                onClick={() => onImport(selected, { isStatic, presets: isStatic ? [] : presets })}
                className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium text-sm"
              >
                Add to Simulation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ImportObjectModal;
