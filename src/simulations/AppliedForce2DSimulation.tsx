import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import appliedForce2DConfig from './appliedForce2D.json';

// The Phase 2 fixture: applied force as an AUTHORED schema field, in 2D, with
// polar authoring and force-family sliders. Sibling of
// `appliedForce1D` (the Phase 1 debug-panel fixture) — that one proves the
// delivery path with no JSON field at all, this one proves the authoring
// surface on top of it.
//
// THE LESSON — pull angle. m = 5 kg, µ = 0.8, g = 9.8. The force needed to
// break the crate loose depends on the angle you pull at:
//
//     F* = µmg / (cosθ + µ·sinθ)        minimised at θ = arctan(µ) = 38.66°
//
//   θ = −15° → 51.62 N   θ = 0° → 39.20 N   θ = 38.66° → 30.61 N ← cheapest
//   θ = 60°  → 32.86 N   θ = 70° → 35.84 N
//
// With the pull FIXED at the default 35 N, the crate therefore moves over a
// WINDOW of angles — everywhere F* (θ) ≤ 35 N — and there are three distinct
// angles worth naming. **Do not confuse them** (this comment did, until Bill
// drove it on 2026-08-13 and measured the first one at ~10°):
//
//   • θ ≈ 9.65°  — BREAKAWAY. The crate is stuck at 0° and lets go here. This
//                  is what a student finds first, and it is NOT arctan(µ).
//   • θ = 38.66° — MAXIMUM ACCELERATION (1.12 m/s²). arctan(µ) is where the
//                  REQUIRED force is smallest, so at a fixed 35 N the surplus
//                  F − F*(θ) is largest here. Not a threshold at all.
//   • θ ≈ 67.67° — RE-STICKS. Keep tilting and the horizontal component dies
//                  faster than friction does; the crate stops again.
//
// So the honest description is a window [9.65°, 67.67°] with a performance peak
// in the middle, not a single "it starts moving at arctan µ" threshold. That is
// a richer lesson than the one this fixture was built for, and it is genuinely
// 2D: it cannot be posed at all with a 1D force.
//
// Verified against both engines (3 s of pull, dx in metres):
//   θ:        0°     9°    9.72°   15°    38.66°   60°    67.6°   70°
//   rapier: 0.005  0.022   0.102  1.799   5.081   2.314   0.046  0.018
//   planck: 0.000  0.000   0.023  1.670   5.063   2.295   0.023  0.000
// (Rapier's sub-threshold millimetres are its compliant-friction creep, not
// motion — see the breakaway-criterion note in GIST_Physics_System_Topics.md.)
//
// WHY µ = 0.8 AND NOT THE 1D FIXTURE'S 0.51: the width of the usable window is
// `F*(0)/F*(θ_opt) = √(1 + µ²)`, so a low µ makes the whole lesson happen in a
// sliver. At µ = 0.51 the window is 12% and a force inside it accelerates the
// crate at ~0.17 m/s² — about 2 m over a full 5 s run, which reads as "nothing
// happened". At µ = 0.8 the window is 28% and the peak gives 1.12 m/s².
// The two fixtures are tuned for different jobs: 1D is built so the debug
// dropdown's ±25 N step lands exactly on breakaway; this one is built so the
// angle slider produces motion you can SEE.
//
// The mass slider is the other half of Newton's second law — same force,
// heavier crate, smaller acceleration — and it also moves breakaway, since µmg
// scales with m. **It also LIFTS:** max the force, max the angle, drop the mass
// (60 N at 60° on 2 kg) and the vertical component 51.96 N beats mg = 19.6 N,
// so the crate leaves the floor. That is the move a student makes in the first
// thirty seconds, and it is how Bill found the Rapier mass-setter bug on
// 2026-08-13 — the crate stayed at its authored 5 kg and refused to lift under
// a force that should have lifted it. See RapierAdapter's `set mass`.
//
// Headless verification of the 2D delivery path (both engines, 2026-08-13,
// driven through the real adapters at the app's 8×(1/480 s) cadence — measured
// on the 1D fixture's µ = 0.51 so it isolates delivery, not this scene's tuning):
//   • sliding, a = (F·cosθ − µ(mg − F·sinθ))/m — ≤0.02% error at every angle
//     in {−15, 0, 15, 27.02, 30, 45}, on BOTH engines. This is the important
//     one: it is the coupled case, where the force's y-component changes the
//     normal force and therefore the friction that resists its x-component.
//   • breakaway, Planck — matches F* to +0.0% at every angle, at every motion
//     criterion. Planck's static friction is rigid, so this is a
//     threshold-free test of the delivery rule, and the rule passes in 2D.
//   • breakaway, Rapier — its static friction is COMPLIANT, so the measured
//     number is whatever the "did it move?" bar says: −18% at a 1 mm/5 s
//     criterion, −8% at 10 mm, and +0.0% at 50 mm. Its true threshold is
//     exact; the apparent error is entirely the creep tail crossing the bar.
//     (This also refines the 1D Phase 1 note, which recorded −3.96% as if it
//     were a property of the engine rather than of the measurement.)
//
// SEATING: `y: 0.2462`, not `height/2`. `ice_block`'s manifest collider is
// 98.6% of its bounding box, so `y: 0.25` leaves a 3.75 mm gap and the crate
// free-falls for ~28 ms before it lands — see the 1D fixture, which keeps the
// transient on purpose as a specimen. This one is seated flush instead, so the
// free-body diagram is clean from frame 1.
function AppliedForce2DSimulation() {
  return <JsonSimulation config={asLocalSimConfig(appliedForce2DConfig)} localJsonEdit />;
}

export default AppliedForce2DSimulation;
