import { useEffect, useState } from 'react';
import { UNIT_ABBREV, type UnitType } from '../../lib/unitConversion';

interface ScaleSliderProps {
  value: number;
  onChange: (v: number) => void;
  unit: UnitType;
  /** The pixelsPerUnit declared on the simulation's JSON. Shown as a reset target. */
  defaultValue: number;
}

/**
 * Session-local zoom slider. Drives the render scale (pixels per user unit)
 * without mutating environment.pixelsPerUnit on the persisted config.
 *
 * The slider's range defaults to [defaultValue, defaultValue * 10] — zoom-IN
 * only, up to 10x — but the min/max number inputs let the user widen the
 * range if they really want to. To make the simulated world itself larger,
 * edit environment.pixelsPerUnit in the JSON instead; the slider is purely
 * visual.
 */
function ScaleSlider({ value, onChange, unit, defaultValue }: ScaleSliderProps) {
  const initialMin = defaultValue;
  const initialMax = defaultValue * 10;

  const [minBound, setMinBound] = useState<number>(initialMin);
  const [maxBound, setMaxBound] = useState<number>(initialMax);

  // Draft strings hold what's typed; bounds only commit on blur or Enter.
  // Per-keystroke commits would let intermediate values like "0" (while
  // typing "20") drive the canvas to zero size mid-edit.
  const [minDraft, setMinDraft] = useState<string>(String(initialMin));
  const [maxDraft, setMaxDraft] = useState<string>(String(initialMax));

  const commitMin = () => {
    const n = Number(minDraft);
    if (Number.isFinite(n) && n > 0) setMinBound(n);
    else setMinDraft(String(minBound));
  };
  const commitMax = () => {
    const n = Number(maxDraft);
    if (Number.isFinite(n) && n > 0) setMaxBound(n);
    else setMaxDraft(String(maxBound));
  };

  // Slider effective range. safeMin floors at defaultValue so zooming out
  // never shrinks the play area inside the canvas; safeMax keeps the upper
  // edge sensible even if the user typed something silly.
  const safeMin = Math.max(defaultValue, Math.min(minBound, maxBound));
  const safeMax = Math.max(safeMin, maxBound);

  // Snap value into the active SAFE range when bounds change. Using safeMin/
  // safeMax (not raw minBound/maxBound) prevents a stray maxBound below the
  // floor from pulling the canvas down to a sub-default zoom.
  useEffect(() => {
    if (value < safeMin) onChange(safeMin);
    else if (value > safeMax) onChange(safeMax);
  }, [safeMin, safeMax, value, onChange]);

  const unitLabel = UNIT_ABBREV[unit];

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
            value={minDraft}
            min={1}
            onChange={(e) => setMinDraft(e.target.value)}
            onBlur={commitMin}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="w-12 border border-gray-300 rounded px-1 py-0.5 text-right text-gray-700"
          />
        </label>
        <label className="flex items-center gap-1">
          max
          <input
            type="number"
            value={maxDraft}
            min={1}
            onChange={(e) => setMaxDraft(e.target.value)}
            onBlur={commitMax}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
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
