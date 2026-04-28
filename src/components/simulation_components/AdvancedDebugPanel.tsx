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
  solverIterations: number;
  onSolverIterationsChange: (iters: number) => void;
  solverIterationsDisabled: boolean;
  positionIterations: number;
  onPositionIterationsChange: (iters: number) => void;
  positionIterationsDisabled: boolean;
  showGrid: boolean;
  onShowGridChange: (v: boolean) => void;
  onTweakJSON?: () => void;
}

const TIMESTEP_OPTIONS = [60, 120, 240, 480, 960, 1920];
const ITER_OPTIONS = [1, 2, 3, 4, 8, 16, 32, 64];

function IterRow({
  label,
  title,
  value,
  onChange,
  disabled,
}: {
  label: string;
  title: string;
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-600" title={title}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        title={title}
        className={`px-2 py-1 rounded-md border border-gray-300 bg-white text-xs text-gray-700 focus:outline-none cursor-pointer disabled:cursor-not-allowed ${disabled ? 'opacity-50' : ''}`}
      >
        {ITER_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

function AdvancedDebugPanel({
  engine,
  onEngineChange,
  engineDisabled,
  timestepHz,
  onTimestepChange,
  timestepDisabled,
  solverIterations,
  onSolverIterationsChange,
  solverIterationsDisabled,
  positionIterations,
  onPositionIterationsChange,
  positionIterationsDisabled,
  showGrid,
  onShowGridChange,
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
        <div className="flex flex-col gap-2 md:gap-3 px-3 py-2 md:px-4 md:py-3 bg-white border border-gray-300 rounded-lg shadow-md text-sm min-w-[200px] md:min-w-[240px]">
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
          {engine === 'rapier' && (
            <IterRow
              label="Solver iters"
              title="Rapier integrationParameters.numSolverIterations (default 4). Higher = more stable, more CPU."
              value={solverIterations}
              onChange={onSolverIterationsChange}
              disabled={solverIterationsDisabled}
            />
          )}
          {engine === 'planck' && (
            <>
              <IterRow
                label="Velocity iters"
                title="Planck velocityIterations (default 8). Resolves contact and joint velocities."
                value={solverIterations}
                onChange={onSolverIterationsChange}
                disabled={solverIterationsDisabled}
              />
              <IterRow
                label="Position iters"
                title="Planck positionIterations (default 3). Resolves penetration and constraint drift."
                value={positionIterations}
                onChange={onPositionIterationsChange}
                disabled={positionIterationsDisabled}
              />
            </>
          )}
          <div className="flex items-center justify-between gap-3">
            <span
              className="text-xs text-gray-600"
              title="Background graph-paper grid with axis labels in the configured unit."
            >
              Show grid
            </span>
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => onShowGridChange(e.target.checked)}
              className="cursor-pointer"
            />
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
