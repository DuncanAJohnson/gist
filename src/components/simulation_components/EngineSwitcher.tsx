import type { PhysicsEngineKind } from '../../physics';
import { ENABLED_ENGINES } from '../../config/engines';

interface EngineSwitcherProps {
  value: PhysicsEngineKind;
  onChange: (v: PhysicsEngineKind) => void;
  disabled: boolean;
}

const ENGINE_LABELS: Record<PhysicsEngineKind, string> = {
  rapier: 'Rapier',
  matter: 'Matter',
  planck: 'Planck',
};

const ENGINES = ENABLED_ENGINES.map((value) => ({ value, label: ENGINE_LABELS[value] }));

function EngineSwitcher({ value, onChange, disabled }: EngineSwitcherProps) {
  // Nothing to switch between if the site admin enabled only one engine.
  if (ENGINES.length <= 1) return null;
  return (
    <div
      className={`inline-flex items-center gap-2 px-2 py-1 rounded-md border border-gray-300 bg-white/70 text-xs text-gray-600 shadow-sm ${disabled ? 'opacity-50' : ''}`}
      title="Dev-only: swap the physics engine for this session. Reloads reset to the config default."
    >
      <span className="font-medium tracking-wide uppercase text-[10px] text-gray-500">Engine</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PhysicsEngineKind)}
        disabled={disabled}
        className="bg-transparent text-xs text-gray-700 focus:outline-none cursor-pointer disabled:cursor-not-allowed"
      >
        {ENGINES.map((e) => (
          <option key={e.value} value={e.value}>{e.label}</option>
        ))}
      </select>
    </div>
  );
}

export default EngineSwitcher;
