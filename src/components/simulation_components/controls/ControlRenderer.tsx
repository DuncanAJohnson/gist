import Slider from './Slider';
import Toggle from './Toggle';
import type { ControlProps } from './controlTypes';

interface ControlRendererProps {
  control: ControlProps;
  value: number | boolean;
  onChange: (value: number | boolean) => void;
}

/**
 * Renders the appropriate control component based on the control type.
 * This provides type-safe rendering of controls using discriminated unions.
 */
function ControlRenderer({ control, value, onChange }: ControlRendererProps) {
  if (control.type === 'slider') {
    return (
      <Slider
        {...control}
        value={value as number}
        onChange={onChange as (value: number) => void}
      />
    );
  }

  if (control.type === 'toggle') {
    return (
      <Toggle
        {...control}
        value={value as boolean}
        onChange={onChange as (value: boolean) => void}
      />
    );
  }

  // TypeScript exhaustiveness check - if you add a new control type,
  // TypeScript will error here until you handle it
  const _exhaustive: never = control;
  return null;
}

export default ControlRenderer;

