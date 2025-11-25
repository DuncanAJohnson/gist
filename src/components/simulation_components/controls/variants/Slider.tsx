import { registerControl } from '../registry';
import type { ControlRenderProps } from '../types';
import type { SliderConfig } from '../../../../schemas/simulation';

function Slider({ control, value, onChange }: ControlRenderProps<SliderConfig>): React.ReactElement {
  const { label, min, max, step } = control;

  return (
    <div className="mb-4">
      <label className="block text-sm mb-2 text-gray-800 font-medium">
        {label}: <span className="text-primary font-semibold">{value as number}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value as number}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full bg-gray-300 outline-none cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-colors [&::-webkit-slider-thumb]:hover:bg-primary-dark [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:transition-colors [&::-moz-range-thumb]:hover:bg-primary-dark"
      />
    </div>
  );
}

registerControl('slider', Slider);

export default Slider;

