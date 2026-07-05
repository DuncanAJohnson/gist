import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import polarAuthoredVelocityConfig from './polarAuthoredVelocity.json';

function PolarAuthoredVelocitySimulation() {
  return <JsonSimulation config={asLocalSimConfig(polarAuthoredVelocityConfig)} localJsonEdit />;
}

export default PolarAuthoredVelocitySimulation;
