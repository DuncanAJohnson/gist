import type { AiProviderKind } from '../config/aiProviders';
import { ENABLED_PROVIDERS, PROVIDER_LABELS } from '../config/aiProviders';

interface AiProviderSwitcherProps {
  value: AiProviderKind;
  onChange: (v: AiProviderKind) => void;
  disabled?: boolean;
}

const PROVIDERS = ENABLED_PROVIDERS.map((value) => ({ value, label: PROVIDER_LABELS[value] }));

function AiProviderSwitcher({ value, onChange, disabled = false }: AiProviderSwitcherProps) {
  if (PROVIDERS.length <= 1) return null;
  return (
    <div
      className={`inline-flex items-center gap-2 px-2 py-1 rounded-md border border-gray-300 bg-white/70 text-xs text-gray-600 shadow-sm ${disabled ? 'opacity-50' : ''}`}
      title="Pick which AI provider generates the simulation."
    >
      <span className="font-medium tracking-wide uppercase text-[10px] text-gray-500">AI Provider:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AiProviderKind)}
        disabled={disabled}
        className="bg-transparent text-xs text-gray-700 focus:outline-none cursor-pointer disabled:cursor-not-allowed"
      >
        {PROVIDERS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
    </div>
  );
}

export default AiProviderSwitcher;
