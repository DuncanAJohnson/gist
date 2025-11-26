import type { ComponentType } from 'react';
import type { ControlConfig, ControlRenderProps } from './types';

// Registry maps type discriminant → React component
const controlRegistry = new Map<
  string,
  ComponentType<ControlRenderProps<any>>
>();

// Called by each variant to register itself
export function registerControl<T extends ControlConfig>(
  type: T['type'],
  component: ComponentType<ControlRenderProps<T>>
) {
  controlRegistry.set(type, component as ComponentType<ControlRenderProps<any>>);
}

// Used by ControlRenderer to get the right component
export function getControlComponent(
  type: string
): ComponentType<ControlRenderProps<any>> | undefined {
  return controlRegistry.get(type);
}

// For debugging/validation
export function getRegisteredControlTypes(): string[] {
  return Array.from(controlRegistry.keys());
}