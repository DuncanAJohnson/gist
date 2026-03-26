import { useRef, useCallback } from 'react';

export interface ExperimentalDataConfig {
  data: { time: number; x?: number; y?: number }[];
  origin: { x: number; y: number } | null;
  shape: 'circle' | 'rectangle';
  color: string;
  opacity: number;
  positiveX: 'right' | 'left';
  positiveY: 'up' | 'down';
  hasX: boolean;
  hasY: boolean;
  graphOverlayIndex: number | null;
  graphOverlayYField: 'x' | 'y' | null;
}

export interface ColumnMapping {
  time: number;
  x: number | null;
  y: number | null;
}

export interface ModalFormState {
  csvRows: string[][];
  headers: string[];
  columnMapping: ColumnMapping;
  positiveX: 'right' | 'left';
  positiveY: 'up' | 'down';
  shape: 'circle' | 'rectangle';
  color: string;
  opacity: number;
  graphOverlayIndex: number | null;
  graphOverlayYField: 'x' | 'y';
}

export const DEFAULT_MODAL_FORM_STATE: ModalFormState = {
  csvRows: [],
  headers: [],
  columnMapping: { time: 0, x: null, y: null },
  positiveX: 'right',
  positiveY: 'up',
  shape: 'circle',
  color: '#ff6bff',
  opacity: 0.7,
  graphOverlayIndex: null,
  graphOverlayYField: 'y',
};

interface ExperimentalDataModalProps {
  formState: ModalFormState;
  onFormStateChange: (update: Partial<ModalFormState>) => void;
  onClose: () => void;
  onConfirm: (config: ExperimentalDataConfig) => void;
  onPickPosition: () => void;
  pickedPosition: { x: number; y: number } | null;
  unitLabel: string;
  graphs?: Array<{ title?: string }>;
}

function ExperimentalDataModal({
  formState,
  onFormStateChange,
  onClose,
  onConfirm,
  onPickPosition,
  pickedPosition,
  unitLabel,
  graphs = [],
}: ExperimentalDataModalProps) {
  const { csvRows, headers, columnMapping, positiveX, positiveY, shape, color, opacity, graphOverlayIndex, graphOverlayYField } = formState;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasCsv = csvRows.length > 0;

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.trim().split('\n').map(line => line.split(',').map(cell => cell.trim()));
      if (lines.length < 2) return;

      const headerRow = lines[0];
      const dataRows = lines.slice(1).filter(row => row.length === headerRow.length);

      onFormStateChange({
        headers: headerRow,
        csvRows: dataRows,
        columnMapping: { time: 0, x: headerRow.length > 1 ? 1 : null, y: headerRow.length > 2 ? 2 : null },
      });
    };
    reader.readAsText(file);
  }, [onFormStateChange]);

  const handleConfirm = () => {
    const hasX = columnMapping.x !== null;
    const hasY = columnMapping.y !== null;
    if (!hasX && !hasY) return;

    const data = csvRows.map(row => {
      const point: { time: number; x?: number; y?: number } = {
        time: parseFloat(row[columnMapping.time]),
      };
      if (hasX && columnMapping.x !== null) {
        point.x = parseFloat(row[columnMapping.x]);
      }
      if (hasY && columnMapping.y !== null) {
        point.y = parseFloat(row[columnMapping.y]);
      }
      return point;
    }).filter(p => !isNaN(p.time));

    data.sort((a, b) => a.time - b.time);

    // Auto-select the available field if only one position column is mapped
    const resolvedOverlayYField = graphOverlayIndex !== null
      ? (!hasY ? 'x' : !hasX ? 'y' : graphOverlayYField)
      : null;

    onConfirm({
      data,
      origin: pickedPosition,
      shape,
      color,
      opacity,
      positiveX,
      positiveY,
      hasX,
      hasY,
      graphOverlayIndex,
      graphOverlayYField: resolvedOverlayYField,
    });
  };

  const hasX = columnMapping.x !== null;
  const hasY = columnMapping.y !== null;
  // Can confirm if: CSV loaded + at least one position column + (position picked OR graph overlay chosen)
  const canConfirm = csvRows.length > 0 && (hasX || hasY) && (pickedPosition !== null || graphOverlayIndex !== null);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-[550px] w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Import Experimental Data</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {!hasCsv && (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-gray-600 text-sm text-center">
              Upload a CSV file with a time column and one or two position columns.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium"
            >
              Choose CSV File
            </button>
          </div>
        )}

        {hasCsv && (
          <div className="flex flex-col gap-5">
            {/* CSV Preview */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Data Preview ({csvRows.length} rows)</h3>
              <div className="overflow-x-auto max-h-32 border border-gray-200 rounded">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} className="px-2 py-1 text-left font-medium text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        {row.map((cell, j) => (
                          <td key={j} className="px-2 py-1 text-gray-700">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Column Mapping */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Column Mapping</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Time</label>
                  <select
                    value={columnMapping.time}
                    onChange={(e) => onFormStateChange({ columnMapping: { ...columnMapping, time: parseInt(e.target.value) } })}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  >
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">X Position</label>
                  <select
                    value={columnMapping.x ?? 'none'}
                    onChange={(e) => onFormStateChange({ columnMapping: { ...columnMapping, x: e.target.value === 'none' ? null : parseInt(e.target.value) } })}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  >
                    <option value="none">None</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Y Position</label>
                  <select
                    value={columnMapping.y ?? 'none'}
                    onChange={(e) => onFormStateChange({ columnMapping: { ...columnMapping, y: e.target.value === 'none' ? null : parseInt(e.target.value) } })}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  >
                    <option value="none">None</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Positive Direction */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Positive Direction</h3>
              <div className="flex gap-6">
                {hasX && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">X:</span>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="radio" name="posX" checked={positiveX === 'right'} onChange={() => onFormStateChange({ positiveX: 'right' })} />
                      Right
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="radio" name="posX" checked={positiveX === 'left'} onChange={() => onFormStateChange({ positiveX: 'left' })} />
                      Left
                    </label>
                  </div>
                )}
                {hasY && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Y:</span>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="radio" name="posY" checked={positiveY === 'up'} onChange={() => onFormStateChange({ positiveY: 'up' })} />
                      Up
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="radio" name="posY" checked={positiveY === 'down'} onChange={() => onFormStateChange({ positiveY: 'down' })} />
                      Down
                    </label>
                  </div>
                )}
                {!hasX && !hasY && (
                  <p className="text-xs text-gray-400">Select at least one position column above.</p>
                )}
              </div>
            </div>

            {/* Graph Overlay */}
            {graphs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Graph Overlay <span className="font-normal text-gray-400">(optional)</span></h3>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">Overlay on:</span>
                    <select
                      value={graphOverlayIndex ?? 'none'}
                      onChange={(e) => onFormStateChange({ graphOverlayIndex: e.target.value === 'none' ? null : parseInt(e.target.value) })}
                      className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                    >
                      <option value="none">None</option>
                      {graphs.map((g, i) => (
                        <option key={i} value={i}>{g.title ?? `Graph ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                  {graphOverlayIndex !== null && hasX && hasY && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">Y-axis data:</span>
                      <select
                        value={graphOverlayYField}
                        onChange={(e) => onFormStateChange({ graphOverlayYField: e.target.value as 'x' | 'y' })}
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                      >
                        <option value="x">X position column</option>
                        <option value="y">Y position column</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Origin Position */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Starting Position on Simulation <span className="font-normal text-gray-400">(optional)</span></h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={onPickPosition}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                >
                  Pick Position
                </button>
                {pickedPosition ? (
                  <span className="text-sm text-gray-600">
                    ({pickedPosition.x.toFixed(1)}, {pickedPosition.y.toFixed(1)}) {unitLabel}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">Click to set where the object starts</span>
                )}
              </div>
            </div>

            {/* Appearance */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Appearance</h3>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Shape:</span>
                  <select
                    value={shape}
                    onChange={(e) => onFormStateChange({ shape: e.target.value as 'circle' | 'rectangle' })}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                  >
                    <option value="circle">Circle</option>
                    <option value="rectangle">Box</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Color:</span>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => onFormStateChange({ color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                  />
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-[150px]">
                  <span className="text-xs text-gray-500">Opacity:</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={opacity}
                    onChange={(e) => onFormStateChange({ opacity: parseFloat(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-500 w-8">{Math.round(opacity * 100)}%</span>
                </div>
              </div>
              {/* Preview */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-500">Preview:</span>
                <div
                  className={`w-6 h-6 ${shape === 'circle' ? 'rounded-full' : 'rounded-sm'}`}
                  style={{ backgroundColor: color, opacity }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => onFormStateChange({ csvRows: [], headers: [] })}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
              >
                Re-upload
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExperimentalDataModal;
