import type { ToggleProps } from './controlTypes';

export interface ToggleComponent extends React.FC<ToggleProps> {
  (props: ToggleProps): React.ReactElement;
}

function Toggle({ label, value, onChange }: ToggleProps): React.ReactElement {
  return (
    <div className="mb-4">
      <label className="block text-sm mb-2 text-gray-800 font-medium">
        {label}: <span className="text-primary font-semibold">{value ? 'On' : 'Off'}</span>
      </label>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="w-full h-1.5 rounded-full bg-gray-300 outline-none cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-colors [&::-webkit-slider-thumb]:hover:bg-primary-dark [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:transition-colors [&::-moz-range-thumb]:hover:bg-primary-dark"
      />
    </div>
  );
}

export default Toggle as ToggleComponent;

