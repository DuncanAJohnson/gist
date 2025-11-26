import type { BodyConfig, BodyFactory } from './types';

// Registry maps body type discriminant → factory function
const bodyRegistry = new Map<string, BodyFactory<any>>();

// Called by each body variant to register itself
export function registerBody<T extends BodyConfig>(
  type: T['type'],
  factory: BodyFactory<T>
) {
  bodyRegistry.set(type, factory as BodyFactory<any>);
}

// Used by ObjectRenderer to get the right factory
export function getBodyFactory(
  type: string
): BodyFactory<any> | undefined {
  return bodyRegistry.get(type);
}

// For debugging/validation
export function getRegisteredBodyTypes(): string[] {
  return Array.from(bodyRegistry.keys());
}

