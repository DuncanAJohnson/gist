import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import twoBoxesConfig from './twoBoxes.json';

function TwoBoxesSimulation() {
  return <JsonSimulation config={asLocalSimConfig(twoBoxesConfig)} />;
}

export default TwoBoxesSimulation;

