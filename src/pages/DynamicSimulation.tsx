import { useLocation, useNavigate } from 'react-router-dom';
import JsonSimulation from '../components/JsonSimulation';

interface SimulationConfig {
  title?: string;
  description?: string;
  environment?: {
    walls?: string[];
  };
  objects?: Array<any>;
  controls?: Array<any>;
  outputs?: Array<any>;
  graphs?: Array<any>;
}

function DynamicSimulation() {
  const location = useLocation();
  const navigate = useNavigate();
  const config = location.state?.config as SimulationConfig;

  if (!config) {
    return (
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="bg-white rounded-xl p-8 shadow-md">
          <h2 className="text-2xl text-gray-800 mb-4">No Simulation Loaded</h2>
          <p className="text-gray-600 mb-4">
            No simulation configuration was provided. Please create a new simulation or upload a JSON file.
          </p>
          <button
            onClick={() => navigate('/create-simulation')}
            className="bg-primary text-white px-6 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Create Simulation
          </button>
        </div>
      </div>
    );
  }

  return (
    <JsonSimulation config={config} />
  );
}

export default DynamicSimulation;

