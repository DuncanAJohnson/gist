import type { VisualDrawFn } from './types';

const visualRegistry = new Map<string, VisualDrawFn>();

export function registerVisual(type: string, draw: VisualDrawFn) {
  visualRegistry.set(type, draw);
}

export function getVisualDrawer(type: string): VisualDrawFn | undefined {
  return visualRegistry.get(type);
}
