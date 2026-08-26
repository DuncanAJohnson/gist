/**
 * ⇧-click info-box targets (InfoBoxes.tsx). A target is a physics object or
 * one of the environment walls — walls are not objects but are the contact
 * most friction questions are about, so they are addressable here.
 */

export type InfoTarget =
  | { kind: 'object'; id: string }
  | { kind: 'wall'; side: 'top' | 'bottom' | 'left' | 'right' };

export interface InfoAnchor {
  target: InfoTarget;
  /** Viewport (client) coordinates of the click / hover point. */
  x: number;
  y: number;
}

export function infoTargetKey(t: InfoTarget): string {
  return t.kind === 'object' ? `object:${t.id}` : `wall:${t.side}`;
}

export function sameInfoTarget(a: InfoTarget | null, b: InfoTarget | null): boolean {
  if (!a || !b) return a === b;
  return infoTargetKey(a) === infoTargetKey(b);
}

