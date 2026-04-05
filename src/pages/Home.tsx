import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CreateSimulation from '../components/CreateSimulation';
import {
  getTopEndorsedThisWeek,
  createSimulation,
  endorseSimulation,
  unendorseSimulation,
  getEndorsedSimulationIds,
  SimulationListItem,
} from '../lib/simulationService';
import SimulationListItemComponent from '../components/SimulationListItem';
import { getBrowserId } from '../lib/browserId';

function Home() {
  const navigate = useNavigate();
  const [topSimulations, setTopSimulations] = useState<SimulationListItem[]>([]);
  const [endorsedIds, setEndorsedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTop();
  }, []);

  const loadTop = async () => {
    try {
      setLoading(true);
      const browserId = getBrowserId();
      const [sims, endorsed] = await Promise.all([
        getTopEndorsedThisWeek(3),
        getEndorsedSimulationIds(browserId),
      ]);
      setTopSimulations(sims);
      setEndorsedIds(endorsed);
    } catch (error) {
      console.error('Failed to load top simulations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJSONExtracted = async (json: any) => {
    try {
      const simulationId = await createSimulation(json, true, null);
      navigate(`/simulation/${simulationId}`);
    } catch (error) {
      console.error('Failed to save simulation:', error);
      alert('Failed to save simulation. Please try again.');
    }
  };

  const handleToggleEndorse = async (simulationId: number, nowEndorsed: boolean) => {
    const browserId = getBrowserId();
    // Optimistic update
    setEndorsedIds((prev) => {
      const next = new Set(prev);
      if (nowEndorsed) next.add(simulationId);
      else next.delete(simulationId);
      return next;
    });
    setTopSimulations((prev) =>
      prev.map((s) =>
        s.id === simulationId
          ? { ...s, endorsement_count: s.endorsement_count + (nowEndorsed ? 1 : -1) }
          : s
      )
    );
    try {
      if (nowEndorsed) {
        await endorseSimulation(simulationId, browserId);
      } else {
        await unendorseSimulation(simulationId, browserId);
      }
    } catch (error) {
      console.error('Failed to toggle endorsement:', error);
      // Revert on failure
      loadTop();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      {/* Hero prompt */}
      <div className="text-center mb-8 mt-4">
        <h1 className="text-4xl text-gray-800 mb-8 font-semibold">
          What physics concept do you want to simulate today?
        </h1>
        <div className="max-w-2xl mx-auto">
          <CreateSimulation
            isOpen={true}
            onClose={() => {}}
            onJSONExtracted={handleJSONExtracted}
            compact={true}
          />
        </div>
      </div>

      {/* Top 3 This Week */}
      <div className="mt-16">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-2xl font-semibold text-gray-800">
            Top Endorsed This Week
          </h2>
          <Link
            to="/library"
            className="text-primary hover:underline text-sm font-medium"
          >
            Browse all published simulations →
          </Link>
        </div>
        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : topSimulations.length === 0 ? (
          <div className="text-center text-gray-500 py-8 bg-white rounded-lg border border-gray-200">
            No endorsed simulations yet this week. Create one and endorse it to get started!
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200">
            {topSimulations.map((sim) => (
              <SimulationListItemComponent
                key={sim.id}
                simulation={sim}
                endorsed={endorsedIds.has(sim.id)}
                onToggleEndorse={handleToggleEndorse}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;
