import JsonSimulation from '../components/JsonSimulation';
import { asLocalSimConfig } from './localSimConfig';
import projectileVelocityComponentsConfig from './projectileVelocityComponents.json';

function ProjectileVelocityComponentsSimulation() {
  return <JsonSimulation config={asLocalSimConfig(projectileVelocityComponentsConfig)} localJsonEdit />;
}

export default ProjectileVelocityComponentsSimulation;
