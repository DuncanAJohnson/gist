import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';

// S2.1 U-cup — inelastic capture (PHYSICS_SHAPES.md, Rung 2). A ball arcs
// into a free-to-slide cup; horizontal momentum is conserved across the
// catch, KE is not: m·u = (m + M)·v → with m=1, M=2 the pair slides at u/3.
// Cup friction is overridden near zero so ground friction doesn't eat the
// momentum before it can be read off the graph.
//
// Since 2026-07-18 (concave-colliders Phase 4) this sim is the living
// exhibit of the JSON-authored `container` field: the cup object below
// carries params only, and JsonSimulation's expansion seam
// (src/lib/containerExpansion.ts) synthesizes sprite + concave collider and
// derives width/height/svg + the grounded seat at load — the same path
// LLM-generated and DB-saved sims ride. (WagonStop/BoxCatch still call
// makeOpenContainer directly — the factory API remains a supported
// consumer.) sceneMin derives from the scene: 600 px / 100 px-per-unit = 6,
// identical to the value this sim used to hand-pass.
const config = {
  title: 'Cup Catch — Inelastic Capture (S2.1)',
  description:
    'Open-container factory sim. Launch the ball so it drops into the cup: on capture, ' +
    'horizontal momentum is conserved (m·u = (m+M)·v — watch the two vx traces converge ' +
    'on u/3) while kinetic energy is not. The cup is dynamic with near-zero friction so ' +
    'the recoil is clean. Drive with ?colliders=1 to see the decomposed 3-part compound.',
  environment: {
    walls: ['left', 'right', 'bottom'],
    gravity: 9.8,
    unit: 'm',
    pixelsPerUnit: 100,
    physicsEngine: 'rapier',
  },
  objects: [
    {
      id: 'cup',
      x: 2.5,
      y: 0, // placeholder — grounded mode derives the seated center at load
      container: { innerWidth: 0.6, wallHeight: 0.7, mode: 'grounded' },
      mass: 2,
      friction: 0.02,
      restitution: 0.05,
      showVectors: ['velocity'],
    },
    {
      id: 'ball',
      x: 1.0,
      y: 1.6,
      width: 0.25,
      height: 0.25,
      svg: 'baseball',
      velocity: { x: 4.0, y: 0 },
      mass: 1,
      restitution: 0.1,
      friction: 0.3,
      showVectors: ['velocity'],
    },
  ],
  controls: [
    {
      type: 'slider',
      label: 'Launch speed vx (m/s)',
      targetObj: 'ball',
      property: 'velocity.x',
      min: 2,
      max: 6,
      step: 0.05,
      defaultValue: 4.0,
    },
    {
      type: 'slider',
      label: 'Drop height (m)',
      targetObj: 'ball',
      property: 'position.y',
      min: 1.0,
      max: 2.5,
      step: 0.05,
      defaultValue: 1.6,
    },
  ],
  outputs: [
    {
      title: 'Momentum handoff',
      values: [
        { label: 'Ball vx', targetObj: 'ball', property: 'velocity.x', unit: 'm/s' },
        { label: 'Cup vx', targetObj: 'cup', property: 'velocity.x', unit: 'm/s' },
        { label: 'Ball speed', targetObj: 'ball', property: 'velocity.magnitude', unit: 'm/s' },
      ],
    },
  ],
  graphs: [
    {
      type: 'line',
      title: 'Horizontal velocity — before and after capture',
      yAxisRange: { min: 0, max: 6 },
      yAxisLabel: 'vx (m/s)',
      lines: [
        { label: 'Ball vx', targetObj: 'ball', property: 'velocity.x', color: '#2ecc71' },
        { label: 'Cup vx', targetObj: 'cup', property: 'velocity.x', color: '#ef4444' },
      ],
    },
  ],
};

function CupCatchSimulation() {
  return <JsonSimulation config={asLocalSimConfig(config)} localJsonEdit />;
}

export default CupCatchSimulation;
