import { useNavigate } from 'react-router-dom';
import AISimulationChat from '../components/AISimulationChat';
import { createSimulation } from '../lib/simulationService';

function CreateSimulation() {
  const navigate = useNavigate();

  // Handle JSON extraction from AI chat
  const handleJSONExtracted = async (json: any) => {
    try {
      const simulationId = await createSimulation(json, true, null);
      navigate(`/simulation/${simulationId}`);
    } catch (error) {
      console.error('Failed to save simulation:', error);
      alert('Failed to save simulation. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => navigate('/')} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl" style={{ height: 'calc(100vh - 100px)' }}>
        <div className="bg-primary text-white px-6 py-4 flex justify-between items-center rounded-t-xl">
          <div>
            <h2 className="text-2xl font-semibold">Create AI Simulation</h2>
            <p className="text-sm opacity-90">Describe the physics simulation you would like to create</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-white hover:text-gray-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="h-[calc(100%-80px)]">
          <AISimulationChat onJSONExtracted={handleJSONExtracted} />
        </div>
      </div>
    </div>
  );
}

export default CreateSimulation;

