import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import rampSlideConfig from './rampSlide.json';

// S0.1 box on incline — the ramp+seatOn living exhibit, now the
// tilt-until-slip µ demo (ramp-dimension slider, 2026-08-06). The `ramp` and
// `seatOn` fields in rampSlide.json expand at the ingestion seam
// (src/lib/objectExpansion.ts); the "Ramp angle" slider binds `ramp.angle`,
// which overrides the synthesis param ahead of expansion — the 5 m board
// tilts at fixed slopeLength (the first-authored companion rule), the block
// re-seats flush at every angle, and breakaway lands at tan θ = µ ≈ 21.8°.
function RampSlideSimulation() {
  return <JsonSimulation config={asLocalSimConfig(rampSlideConfig)} localJsonEdit />;
}

export default RampSlideSimulation;
