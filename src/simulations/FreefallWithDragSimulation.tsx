import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import freefallWithDragConfig from './freefallWithDrag.json';

function FreefallWithDragSimulation() {
  return <JsonSimulation config={asLocalSimConfig(freefallWithDragConfig)} localJsonEdit />;
}

export default FreefallWithDragSimulation;
