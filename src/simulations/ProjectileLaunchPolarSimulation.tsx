import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import projectileLaunchPolarConfig from './projectileLaunchPolar.json';

function ProjectileLaunchPolarSimulation() {
  return <JsonSimulation config={asLocalSimConfig(projectileLaunchPolarConfig)} localJsonEdit />;
}

export default ProjectileLaunchPolarSimulation;
