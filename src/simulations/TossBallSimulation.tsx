import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import tossBallConfig from './tossBall.json';

function TossBallSimulation() {
  return <JsonSimulation config={asLocalSimConfig(tossBallConfig)} />;
}

export default TossBallSimulation;

