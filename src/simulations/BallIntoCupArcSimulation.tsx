import JsonSimulation from '../components/JsonSimulation';
import ballIntoCupArcConfig from './ballIntoCupArc.json';

function BallIntoCupArcSimulation() {
  return <JsonSimulation config={ballIntoCupArcConfig} localJsonEdit />;
}

export default BallIntoCupArcSimulation;
