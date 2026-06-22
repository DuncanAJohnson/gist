import JsonSimulation from '../components/JsonSimulation';
import ballIntoCupDropConfig from './ballIntoCupDrop.json';

function BallIntoCupDropSimulation() {
  return <JsonSimulation config={ballIntoCupDropConfig} localJsonEdit />;
}

export default BallIntoCupDropSimulation;
