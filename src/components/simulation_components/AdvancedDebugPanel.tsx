import { useState } from 'react';
import type { PhysicsEngineKind } from '../../physics';
import EngineSwitcher from './EngineSwitcher';

interface AdvancedDebugPanelProps {
  engine: PhysicsEngineKind;
  onEngineChange: (engine: PhysicsEngineKind) => void;
  engineDisabled: boolean;
  timestepHz: number;
  onTimestepChange: (hz: number) => void;
  timestepDisabled: boolean;
  onTweakJSON?: () => void;
}

const TIMESTEP_OPTIONS = [60, 120, 240, 480, 960, 1920];

function AdvancedDebugPanel({
  engine,
  onEngineChange,
  engineDisabled,
  timestepHz,
  onTimestepChange,
  timestepDisabled,
  onTweakJSON,
}: AdvancedDebugPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="px-3 py-1.5 bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors text-xs font-medium shadow-sm"
        aria-expanded={expanded}
      >
        Debug Mode {expanded ? '▾' : '▸'}
      </button>
      {expanded && (
        <div className="flex flex-col gap-3 px-4 py-3 bg-white border border-gray-300 rounded-lg shadow-md text-sm min-w-[240px]">
          <div className="font-semibold tracking-wide uppercase text-[10px] text-gray-500">
            Advanced Debug
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-600">Engine</span>
            <EngineSwitcher
              value={engine}
              onChange={onEngineChange}
              disabled={engineDisabled}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-600" title="Physics integration step size used during precompute. Does not affect playback speed.">
              Timestep
            </span>
            <select
              value={timestepHz}
              onChange={(e) => onTimestepChange(Number(e.target.value))}
              disabled={timestepDisabled}
              className={`px-2 py-1 rounded-md border border-gray-300 bg-white text-xs text-gray-700 focus:outline-none cursor-pointer disabled:cursor-not-allowed ${timestepDisabled ? 'opacity-50' : ''}`}
            >
              {TIMESTEP_OPTIONS.map((hz) => (
                <option key={hz} value={hz}>
                  {hz} Hz (1/{hz} s)
                </option>
              ))}
            </select>
          </div>
          {onTweakJSON && (
            <button
              onClick={onTweakJSON}
              className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors text-xs font-medium"
            >
              Tweak Simulation JSON
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default AdvancedDebugPanel;
