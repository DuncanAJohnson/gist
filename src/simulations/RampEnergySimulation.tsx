import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import rampEnergyConfig from './rampEnergy.json';

// GPE→KE on a frictionless mirrored incline — the second ramp+seatOn living
// exhibit (SO-A). See RampSlideSimulation for the seam notes; here dragging
// the seated ball along the ramp changes the release height (and the √(2gΔh)
// prediction) while the seam keeps it flush.
function RampEnergySimulation() {
  return <JsonSimulation config={asLocalSimConfig(rampEnergyConfig)} localJsonEdit />;
}

export default RampEnergySimulation;
