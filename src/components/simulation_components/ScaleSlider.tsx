import { useEffect, useState } from 'react';
import { UNIT_ABBREV, type UnitType } from '../../lib/unitConversion';

interface ScaleSliderProps {
  value: number;
  onChange: (v: number) => void;
  unit: UnitType;
  /** The pixelsPerUnit declared on the simulation's JSON. Shown as a reset target. */
  defaultValue: number;
}

const SCALE_MAX = 40;

/**
 * Session-local zoom slider. Drives the render scale (pixels per user unit)
 * without mutating environment.pixelsPerUnit on the persisted config.
 *
 * The slider's range defaults to [defaultValue, max(SCALE_MAX, defaultValue)]
 * — zoom-IN only — but the min/max number inputs let the user widen the range
 * if they really want to. To make the simulated world itself larger, edit
 * environment.pixelsPerUnit in the JSON instead; the slider is purely visual.
 */
function ScaleSlider({ value, onChange, unit, defaultValue }: ScaleSliderProps) {
  const [minBound, setMinBound] = useState<number>(defaultValue);
  const [maxBound, setMaxBound] = useState<number>(Math.max(SCALE_MAX, defaultValue));

  // Keep `value` inside the active bounds. Snapping to the nearest edge is
  // less surprising than letting the slider thumb sit at a number it can't
  // actually slide back to.
  useEffect(() => {
    if (value < minBound) onChange(minBound);
    else if (value > maxBound) onChange(maxBound);
  }, [minBound, maxBound, value, onChange]);

  const unitLabel = UNIT_ABBREV[unit];
  // Floor the slider at defaultValue so zooming out never shrinks the play
  // area inside the canvas (which would leave empty space around it). Users
  // who want a larger world should edit environment.pixelsPerUnit in the JSON.
  // The min text-input still accepts smaller values for transparency, but
  // the slider itself won't honor them.
  const safeMin = Math.max(defaultValue, Math.min(minBound, maxBound));
  const safeMax = Math.max(safeMin, maxBound);

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 bg-white border border-gray-300 rounded-lg shadow-md w-[220px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold tracking-wide uppercase text-[10px] text-gray-500">
          Scale
        </span>
        <span className="font-mono text-xs text-gray-800">
          {value} px / {unitLabel}
        </span>
      </div>
      <input
        type="range"
        min={safeMin}
        max={safeMax}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
      />
      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
        <label className="flex items-center gap-1">
          min
          <input
            type="number"
            value={minBound}
            min={1}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) setMinBound(n);
            }}
            className="w-12 border border-gray-300 rounded px-1 py-0.5 text-right text-gray-700"
          />
        </label>
        <label className="flex items-center gap-1">
          max
          <input
            type="number"
            value={maxBound}
            min={1}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) setMaxBound(n);
            }}
            className="w-12 border border-gray-300 rounded px-1 py-0.5 text-right text-gray-700"
          />
        </label>
      </div>
      {value !== defaultValue && (
        <button
          onClick={() => onChange(defaultValue)}
          className="text-[10px] text-gray-500 hover:text-gray-800 self-end"
          title="Reset to the value from the simulation's JSON"
        >
          Reset to {defaultValue}
        </button>
      )}
    </div>
  );
}

export default ScaleSlider;
