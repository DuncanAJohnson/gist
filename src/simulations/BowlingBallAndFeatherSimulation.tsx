import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import bowlingBallAndFeatherConfig from './bowlingBallAndFeather.json';

function BowlingBallAndFeatherSimulation() {
  return <JsonSimulation config={asLocalSimConfig(bowlingBallAndFeatherConfig)} localJsonEdit />;
}

export default BowlingBallAndFeatherSimulation;
