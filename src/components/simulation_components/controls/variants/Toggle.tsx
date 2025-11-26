import { registerControl } from '../registry';
import type { ControlRenderProps } from '../types';
import type { ToggleConfig } from '../../../../schemas/simulation';

  function Toggle({ control, value, onChange }: ControlRenderProps<ToggleConfig>): React.ReactElement {
  const { label } = control;

  return (
    <div className="mb-4 flex items-center justify-between">
      <label className="text-sm text-gray-800 font-medium">
        {label}
      </label>
      <button
        type="button"
        role="switch"
        aria-checked={value as boolean}
        onClick={() => onChange(!(value as boolean))}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          value ? 'bg-primary' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            value ? 'translate-x-[0.75em]' : 'translate-x-[-0.75em]'
          }`}
        />
      </button>
    </div>
  );
}

registerControl('toggle', Toggle);

export default Toggle;
