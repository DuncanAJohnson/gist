import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import monkeyAndAppleConfig from './monkeyAndApple.json';

function MonkeyAndAppleSimulation() {
  return <JsonSimulation config={asLocalSimConfig(monkeyAndAppleConfig)} localJsonEdit />;
}

export default MonkeyAndAppleSimulation;
