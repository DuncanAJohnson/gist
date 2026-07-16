import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import { makeOpenContainer } from '../lib/openContainer';

// S2.3 wagon / cart — Newton's first law (PHYSICS_SHAPES.md, Rung 2). Wagon
// and payload ride right together; the wagon stops abruptly at the right
// wall; the unsecured payload keeps moving (over the low front wall) — the
// twin vx traces diverge at the stop. `grounded` seats the wagon on the
// floor and `dims.floorTopY` seats the payload inside it, no hand-computed
// viewBox arithmetic. Low friction plays the wheels the wagon doesn't have.
const wagon = makeOpenContainer({
  id: 'wagon',
  innerWidth: 1.2,
  wallHeight: 0.12,
  walls:'left',
  mode: 'grounded',
  x: 2.0,
  sceneMin: 6,
  mass: 4,
  friction: 0,
  restitution: 0.05,
  fill: '#2563eb',
  stroke: '#1e40af',
  showVectors: ['velocity'],
});

const BALL_RADIUS = 0.15;

const config = {
  title: 'Wagon Stop — Newton’s First Law (S2.3)',
  description:
    'Open-container factory sim. Wagon and payload start moving together (keep the two ' +
    'speed sliders equal); the wagon slams into the right wall and stops, the unsecured ' +
    'payload keeps its velocity and escapes over the low front wall. Watch the twin vx ' +
    'traces diverge at the stop — that gap is inertia.',
  environment: {
    walls: ['left', 'right', 'bottom'],
    gravity: 9.8,
    unit: 'm',
    pixelsPerUnit: 100,
    physicsEngine: 'rapier',
  },
  objects: [
    wagon.object,
    {
      id: 'payload',
      x: 1.8,
      y: wagon.dims.floorTopY + BALL_RADIUS,
      width: BALL_RADIUS * 2,
      height: BALL_RADIUS * 2,
      svg: 'cannonball',
      velocity: { x: 3, y: 0 },
      mass: 1,
      restitution: 0.05,
      friction: 0,
      showVectors: ['velocity'],
    },
    {
      id: 'stopper',
      x: 6,
      y: 0.1,
      width: 0.2,
      height: 0.2,
      svg: 'crate',
      mass: 1,
      restitution: 0.05,
      isStatic: true,
    },
  ],
  controls: [
    {
      type: 'slider',
      label: 'Wagon speed vx (m/s)',
      targetObj: 'wagon',
      property: 'velocity.x',
      min: 1,
      max: 5,
      step: 0.1,
      defaultValue: 3,
    },
    {
      type: 'slider',
      label: 'Payload speed vx (m/s)',
      targetObj: 'payload',
      property: 'velocity.x',
      min: 1,
      max: 5,
      step: 0.1,
      defaultValue: 3,
    },
  ],
  outputs: [
    {
      title: 'Inertia',
      values: [
        { label: 'Wagon vx', targetObj: 'wagon', property: 'velocity.x', unit: 'm/s' },
        { label: 'Payload vx', targetObj: 'payload', property: 'velocity.x', unit: 'm/s' },
      ],
    },
  ],
  graphs: [
    {
      type: 'line',
      title: 'Twin vx traces — diverging at the stop',
      yAxisRange: { min: -1, max: 5 },
      yAxisLabel: 'vx (m/s)',
      lines: [
        { label: 'Wagon vx', targetObj: 'wagon', property: 'velocity.x', color: '#2563eb' },
        { label: 'Payload vx', targetObj: 'payload', property: 'velocity.x', color: '#2ecc71' },
      ],
    },
  ],
};

function WagonStopSimulation() {
  return <JsonSimulation config={asLocalSimConfig(config)} localJsonEdit />;
}

export default WagonStopSimulation;
