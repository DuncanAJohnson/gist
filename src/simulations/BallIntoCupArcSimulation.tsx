import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import ballIntoCupArcConfig from './ballIntoCupArc.json';

function BallIntoCupArcSimulation() {
  return <JsonSimulation config={asLocalSimConfig(ballIntoCupArcConfig)} localJsonEdit />;
}

export default BallIntoCupArcSimulation;
