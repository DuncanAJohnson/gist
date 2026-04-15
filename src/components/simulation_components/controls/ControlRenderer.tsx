import { getControlComponent } from './registry';
import type { ControlConfig } from './types';

// Ensure all variants are registered
import './variants';

interface Props {
  control: ControlConfig;
  value: number | boolean;
  onChange: (value: number | boolean) => void;
  disabled?: boolean;
}

function ControlRenderer({ control, value, onChange, disabled }: Props) {
  const Component = getControlComponent(control.type);

  if (!Component) {
    console.warn(`Unknown control type: ${control.type}`);
    return null;
  }

  return <Component control={control} value={value} onChange={onChange} disabled={disabled} />;
}

export default ControlRenderer;