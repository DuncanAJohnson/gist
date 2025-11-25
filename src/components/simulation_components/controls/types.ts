import type { ControlConfig, SliderConfig, ToggleConfig } from '../../../schemas/simulation';

export type { ControlConfig, SliderConfig, ToggleConfig };

export interface ControlRenderProps<T extends ControlConfig = ControlConfig> {
  control: T;
  value: number | boolean;
  onChange: (value: number | boolean) => void;
}
