import JsonSimulation from '../components/JsonSimulation';
import projectileLaunchPolarConfig from './projectileLaunchPolar.json';

function ProjectileLaunchPolarSimulation() {
  return <JsonSimulation config={projectileLaunchPolarConfig} localJsonEdit />;
}

export default ProjectileLaunchPolarSimulation;
