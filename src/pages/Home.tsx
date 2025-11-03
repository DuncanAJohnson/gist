import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AISimulationChat from '../components/AISimulationChat';
import { getAllSimulations, createSimulation, SimulationListItem } from '../lib/simulationService';
import SimulationListItemComponent from '../components/SimulationListItem';

function Home() {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [simulations, setSimulations] = useState<SimulationListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSimulations();
  }, []);

  const loadSimulations = async () => {
    try {
      setLoading(true);
      const data = await getAllSimulations();
      setSimulations(data);
    } catch (error) {
      console.error('Failed to load simulations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJSONExtracted = async (json: any) => {
    try {
      const simulationId = await createSimulation(json, true, null);
      setShowModal(false);
      navigate(`/simulation/${simulationId}`);
    } catch (error) {
      console.error('Failed to save simulation:', error);
      alert('Failed to save simulation. Please try again.');
    }
  };

  // Group simulations by day and sort within each day by time descending
  const groupedSimulations = useMemo(() => {
    const groups: Record<string, SimulationListItem[]> = {};
    
    simulations.forEach((sim) => {
      const date = new Date(sim.created_at);
      const dayKey = date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      if (!groups[dayKey]) {
        groups[dayKey] = [];
      }
      groups[dayKey].push(sim);
    });

    // Sort simulations within each day by time descending (newest first)
    Object.keys(groups).forEach((dayKey) => {
      groups[dayKey].sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return timeB - timeA;
      });
    });

    return groups;
  }, [simulations]);

  return (
    <div className="max-w-7xl mx-auto px-8 py-8">
      <div className="text-center mb-12 mt-4">
        <h1 className="text-4xl text-gray-800 mb-4 font-semibold">
          Generative Interactive Simulations for Teaching
        </h1>
        <p className="text-xl text-gray-600">
          Create and share interactive simulations for teaching physics.
        </p>
      </div>

      {/* Sample Simulations Section */}
      {/* <div className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-800 mb-6">Sample Simulations</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-8">
          <Link 
            to="/simulation/two-boxes" 
            className="bg-white rounded-xl p-8 shadow-md no-underline text-inherit transition-all duration-200 flex flex-col hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="text-5xl mb-4">📦</div>
            <h2 className="text-2xl text-gray-800 mb-2">Two Boxes Collision</h2>
            <p className="text-gray-600 leading-relaxed flex-grow">
              Watch two boxes move toward each other and collide. 
              Control their velocities with interactive sliders.
            </p>
            <div className="flex gap-2 mt-4">
              <span className="bg-gray-100 px-3 py-1 rounded-xl text-sm text-gray-600">
                Collision
              </span>
              <span className="bg-gray-100 px-3 py-1 rounded-xl text-sm text-gray-600">
                Velocity
              </span>
            </div>
          </Link>
          <Link 
            to="/simulation/toss-ball" 
            className="bg-white rounded-xl p-8 shadow-md no-underline text-inherit transition-all duration-200 flex flex-col hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="text-5xl mb-4">⚾</div>
            <h2 className="text-2xl text-gray-800 mb-2">Toss Ball</h2>
            <p className="text-gray-600 leading-relaxed flex-grow">
              Toss a ball vertically and observe acceleration versus velocity.
            </p>
          </Link>
        </div>
      </div> */}

      {/* Create New Simulation */}
      <div className="mb-8 text-center">
        <button
          onClick={() => setShowModal(true)}
          className="bg-primary text-white px-6 py-3 rounded-lg hover:opacity-90 transition-opacity font-medium text-lg"
        >
          Create New Simulation
        </button>
      </div>

      {/* Database Simulations */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-800 mb-6">Simulation Library</h2>
        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading simulations...</div>
        ) : simulations.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No simulations yet. Create one to get started!</div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedSimulations).map(([dayKey, daySimulations]) => (
              <div key={dayKey}>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">{dayKey}</h3>
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200">
                  {daySimulations.map((sim) => (
                    <SimulationListItemComponent key={sim.id} simulation={sim} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for Creating New Simulation */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl" style={{ height: 'calc(100vh - 100px)' }}>
            <div className="bg-primary text-white px-6 py-4 flex justify-between items-center rounded-t-xl">
              <div>
                <h2 className="text-2xl font-semibold">Create AI Simulation</h2>
                <p className="text-sm opacity-90">Describe the physics simulation you would like to create</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
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
      )}
    </div>
  );
}

export default Home;

