import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import { makeOpenContainer } from '../lib/openContainer';

// S2.2 open box / ballistic pendulum — COLLISION PHASE ONLY (PHYSICS_SHAPES.md,
// Rung 2). The thrown ball embeds in a heavy open box: momentum conservation
// sets the post-capture speed (m·u = (m+M)·V), then ground friction dissipates
// the remaining KE over a slide distance d = V²/(2µg) — two laws, in sequence,
// one valid per phase. The canonical swing phase needs a rod joint (J1) and is
// gated on the joints workstream.
const box = makeOpenContainer({
  id: 'box',
  innerWidth: 1.0,
  wallHeight: 0.5,
  mode: 'grounded',
  x: 3.0,
  sceneMin: 6,
  mass: 6,
  friction: 0.35,
  restitution: 0.05,
  fill: '#a16207',
  stroke: '#713f12',
  showVectors: ['velocity'],
});

const config = {
  title: 'Box Catch — Momentum then Energy (S2.2, collision phase)',
  description:
    'Open-container factory sim. Throw the ball into the heavy open box: capture speed ' +
    'follows m·u = (m+M)·V (m=1, M=6 → V = u/7), then friction converts the remaining KE ' +
    'into a finite slide — read the slide distance off the box-position graph. The swing ' +
    'phase of the full ballistic pendulum is gated on the joints workstream (J1).',
  environment: {
    walls: ['left', 'right', 'bottom'],
    gravity: 9.8,
    unit: 'm',
    pixelsPerUnit: 100,
    physicsEngine: 'rapier',
  },
  objects: [
    box.object,
    {
      id: 'ball',
      x: 0.6,
      y: 1.4,
      width: 0.3,
      height: 0.3,
      svg: 'cannonball',
      velocity: { x: 6.9, y: 0 },
      mass: 1,
      restitution: 0.05,
      friction: 0.3,
      showVectors: ['velocity'],
    },
  ],
  controls: [
    {
      type: 'slider',
      label: 'Throw speed vx (m/s)',
      targetObj: 'ball',
      property: 'velocity.x',
      min: 4,
      max: 10,
      step: 0.1,
      defaultValue: 6.9,
    },
  ],
  outputs: [
    {
      title: 'Two phases',
      values: [
        { label: 'Ball vx', targetObj: 'ball', property: 'velocity.x', unit: 'm/s' },
        { label: 'Box vx', targetObj: 'box', property: 'velocity.x', unit: 'm/s' },
        { label: 'Box x', targetObj: 'box', property: 'position.x', unit: 'm' },
      ],
    },
  ],
  graphs: [
    {
      type: 'line',
      title: 'Horizontal velocity — capture, then friction',
      yAxisRange: { min: 0, max: 10 },
      yAxisLabel: 'vx (m/s)',
      lines: [
        { label: 'Ball vx', targetObj: 'ball', property: 'velocity.x', color: '#2ecc71' },
        { label: 'Box vx', targetObj: 'box', property: 'velocity.x', color: '#a16207' },
      ],
    },
    {
      type: 'line',
      title: 'Box position — slide distance after capture',
      yAxisRange: { min: 0, max: 8 },
      yAxisLabel: 'x (m)',
      lines: [
        { label: 'Box x', targetObj: 'box', property: 'position.x', color: '#7c3aed' },
      ],
    },
  ],
};

function BoxCatchSimulation() {
  return <JsonSimulation config={asLocalSimConfig(config)} localJsonEdit />;
}

export default BoxCatchSimulation;
