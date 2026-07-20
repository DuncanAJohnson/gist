import { useState, useSyncExternalStore } from 'react';
import type { PhysicsEngineKind } from '../../physics';
import EngineSwitcher from './EngineSwitcher';
import {
  subscribeDiagnostics,
  getDiagnosticsSnapshot,
} from '../../lib/diagnosticsBus';

// Seam-diagnostics badge is dev-gated, like the warns it surfaces (the CC2
// producer only fires in dev builds anyway). Same idiom as shapeHelpers for
// reading Vite env without vite/client types.
const DEV = Boolean((import.meta as any).env?.DEV);

export type AirResistanceMode = 'off' | 'quadratic';

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
  airResistanceMode: AirResistanceMode;
  onAirResistanceModeChange: (mode: AirResistanceMode) => void;
  showGrid: boolean;
  onShowGridChange: (v: boolean) => void;
  showColliders: boolean;
  onShowCollidersChange: (v: boolean) => void;
  onTweakJSON?: () => void;
  onImportObject?: () => void;
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
  airResistanceMode,
  onAirResistanceModeChange,
  showGrid,
  onShowGridChange,
  showColliders,
  onShowCollidersChange,
  onTweakJSON,
  onImportObject,
}: AdvancedDebugPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  // Seam diagnostics bus (module-level session store) — subscribe so the
  // amber badge appears the moment a producer reports, without prop plumbing.
  const diagnostics = useSyncExternalStore(
    subscribeDiagnostics,
    getDiagnosticsSnapshot,
  );
  const showDiagnostics = DEV && diagnostics.length > 0;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="px-3 py-1.5 bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors text-xs font-medium shadow-sm"
        aria-expanded={expanded}
      >
        Debug Mode {expanded ? '▾' : '▸'}
        {showDiagnostics && (
          <span
            title={`${diagnostics.length} seam diagnostic(s) — expand Debug Mode for details`}
            className="ml-2 inline-flex items-center justify-center min-w-[18px] px-1 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-bold leading-none"
          >
            {diagnostics.length}
          </span>
        )}
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 md:gap-3 px-3 py-2 md:px-4 md:py-3 bg-white border border-gray-300 rounded-lg shadow-md text-sm min-w-[200px] md:min-w-[240px]">
          <div className="font-semibold tracking-wide uppercase text-[10px] text-gray-500">
            Advanced Debug
          </div>
          {showDiagnostics && (
            <div className="rounded-md border border-amber-300 bg-amber-50">
              {/* The global base-layer `button` style (index.css: bg-primary
                  text-white, hover:bg-primary-dark) bleeds through any button
                  that doesn't set its own bg — so, per the codebase idiom,
                  pair an explicit bg-* AND hover:bg-* below. Dark amber text
                  reads against both light-amber states. */}
              <button
                onClick={() => setDiagnosticsOpen((o) => !o)}
                aria-expanded={diagnosticsOpen}
                title="Load-time authoring warnings from the gist seams (over-cap colliders, container-expansion drops). Same messages as the console warns."
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs font-medium bg-amber-50 text-amber-900 hover:bg-amber-100 rounded-md transition-colors"
              >
                <span>⚠ Diagnostics ({diagnostics.length})</span>
                <span>{diagnosticsOpen ? '▾' : '▸'}</span>
              </button>
              {diagnosticsOpen && (
                <ul className="px-2 pb-2 flex flex-col gap-1.5 max-h-48 max-w-[320px] overflow-y-auto">
                  {diagnostics.map((d) => (
                    <li
                      key={d.key}
                      className="text-[11px] leading-snug text-amber-900 break-words border-t border-amber-200 pt-1.5 first:border-t-0 first:pt-0"
                    >
                      {d.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
              title="Phase-1 air-resistance toggle. Quadratic mode writes per-frame linearDamping = (k/m)·|v| to mimic mass-dependent v² drag, with k derived from each body's shape."
            >
              Air resistance
            </span>
            <select
              value={airResistanceMode}
              onChange={(e) => onAirResistanceModeChange(e.target.value as AirResistanceMode)}
              className="px-2 py-1 rounded-md border border-gray-300 bg-white text-xs text-gray-700 focus:outline-none cursor-pointer"
            >
              <option value="off">Off</option>
              <option value="quadratic">Quadratic (v²)</option>
            </select>
          </div>
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
          <div className="flex items-center justify-between gap-3">
            <span
              className="text-xs text-gray-600"
              title="Collider observation overlay: draws each body's engine-truth collider geometry (the decomposed compound, for concave colliders) with per-part colors and vertex counts — red above Planck's silent 12-vertex cap. Also available as ?colliders=1."
            >
              Show colliders
            </span>
            <input
              type="checkbox"
              checked={showColliders}
              onChange={(e) => onShowCollidersChange(e.target.checked)}
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
          {onImportObject && (
            <button
              onClick={onImportObject}
              title="Load an SVG-generator export (zip or .svg + manifest .json) and drop it into this sim as a test object. Session-only."
              className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors text-xs font-medium"
            >
              Import Object
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default AdvancedDebugPanel;
