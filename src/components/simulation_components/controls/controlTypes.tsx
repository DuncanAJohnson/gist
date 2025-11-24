export interface BaseControlProps {
  type: string;
  label: string;
  property: string;
}

export interface SliderProps extends BaseControlProps {
  type: 'slider';
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
}

export interface ToggleProps extends BaseControlProps {
  type: 'toggle';
  value: boolean;
  onChange: (value: boolean) => void;
}

export type ControlProps = SliderProps | ToggleProps;