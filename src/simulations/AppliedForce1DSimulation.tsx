import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import appliedForce1DConfig from './appliedForce1D.json';

// THE applied-force test case (Bill, 2026-08-09 — authored and drive-validated
// the day Goal-2 Phase 1 landed; hardwired here so the force-authoring surface
// in Phase 2 has a fixture to be tested against rather than a fresh scene).
//
// Drive it with `?simdebug=1&forces=1`, set the debug panel's "Applied force"
// and point "Force on" at `block`. There is no force in the JSON — Phase 1 is
// debug-panel only, deliberately (no schema field, no prompt).
//
// WHY THESE NUMBERS: µ = 0.51 with m = 5 kg and g = 9.8 puts breakaway at
// µ·m·g = 24.99 N, so the dropdown's ±25 N step straddles it — the sim is
// built around the one force value the menu can put right on the threshold.
// (g is exactly 9.8 everywhere: schema default + both adapter fallbacks.)
//
// Headless verification (both engines, 2026-08-09):
//   • sliding regime a = (F − µmg)/m — 0.01% error at +50 N and +100 N. Exact.
//   • breakaway — Planck 25 N (+0.04%), Rapier 24 N (−3.96%). The Rapier gap
//     is not a breakaway error: its static friction is COMPLIANT, creeping
//     0.2 / 5.5 / 14.7 mm over 5 s at 20 / 22 / 24 N, so it drifts across a
//     1 cm criterion before it truly breaks. Planck's is rigid — exactly
//     0.0 mm at every sub-threshold force. At pixelsPerUnit 100 that creep is
//     1.5 px over 5 s, i.e. invisible; Bill's read was "within the noise".
//
// KNOWN START TRANSIENT, deliberately NOT tuned away: `y: 0.25` with
// `height: 0.5` does NOT rest the block on the floor. `ice_block`'s manifest
// collider is 98.6% of its bounding box, leaving a 3.75 mm gap, so on Rapier
// the block free-falls for 27.7 ms (measured vy at 17 ms = −0.163 m/s, exactly
// g·t) and the net-force arrow swings either side of horizontal for the first
// ~70 ms. Planck never drops — its 10 mm polygon skin already spans the gap,
// which is also why it rests 11.25 mm higher. Author `y: 0.2462` for a clean
// start; the value here is kept as driven, and the transient is a useful
// specimen of the collider-inset trap in its own right.
function AppliedForce1DSimulation() {
  return <JsonSimulation config={asLocalSimConfig(appliedForce1DConfig)} localJsonEdit />;
}

export default AppliedForce1DSimulation;
