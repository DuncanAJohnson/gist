import type { ComponentType } from 'react';
import type { GraphConfig, GraphRenderProps } from './types';

// Registry maps type discriminant → React component
const graphRegistry = new Map<
  string,
  ComponentType<GraphRenderProps<any>>
>();

// Called by each variant to register itself
export function registerGraph<T extends GraphConfig>(
  type: T['type'],
  component: ComponentType<GraphRenderProps<T>>
) {
  graphRegistry.set(type, component as ComponentType<GraphRenderProps<any>>);
}

// Used by GraphRenderer to get the right component
export function getGraphComponent(
  type: string
): ComponentType<GraphRenderProps<any>> | undefined {
  return graphRegistry.get(type);
}

// For debugging/validation
export function getRegisteredGraphTypes(): string[] {
  return Array.from(graphRegistry.keys());
}


