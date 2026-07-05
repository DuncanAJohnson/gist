import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import ballIntoCupDropConfig from './ballIntoCupDrop.json';

function BallIntoCupDropSimulation() {
  return <JsonSimulation config={asLocalSimConfig(ballIntoCupDropConfig)} localJsonEdit />;
}

export default BallIntoCupDropSimulation;
