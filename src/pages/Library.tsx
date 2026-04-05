import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getPublishedSimulations,
  endorseSimulation,
  unendorseSimulation,
  getEndorsedSimulationIds,
  SimulationListItem,
  SortOption,
  WindowOption,
} from '../lib/simulationService';
import SimulationListItemComponent from '../components/SimulationListItem';
import { getBrowserId } from '../lib/browserId';

function isSortOption(v: string | null): v is SortOption {
  return v === 'recent' || v === 'endorsed';
}

function isWindowOption(v: string | null): v is WindowOption {
  return v === 'week' || v === 'all';
}

function Library() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sort: SortOption = isSortOption(searchParams.get('sort'))
    ? (searchParams.get('sort') as SortOption)
    : 'endorsed';
  const timeWindow: WindowOption = isWindowOption(searchParams.get('window'))
    ? (searchParams.get('window') as WindowOption)
    : 'week';

  const [simulations, setSimulations] = useState<SimulationListItem[]>([]);
  const [endorsedIds, setEndorsedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const browserId = getBrowserId();
      const [sims, endorsed] = await Promise.all([
        getPublishedSimulations({ sort, window: timeWindow }),
        getEndorsedSimulationIds(browserId),
      ]);
      setSimulations(sims);
      setEndorsedIds(endorsed);
    } catch (error) {
      console.error('Failed to load library:', error);
    } finally {
      setLoading(false);
    }
  }, [sort, timeWindow]);

  useEffect(() => {
    load();
  }, [load]);

  const updateParams = (updates: Partial<{ sort: SortOption; window: WindowOption }>) => {
    const next = new URLSearchParams(searchParams);
    if (updates.sort) next.set('sort', updates.sort);
    if (updates.window) next.set('window', updates.window);
    setSearchParams(next);
  };

  const handleToggleEndorse = async (simulationId: number, nowEndorsed: boolean) => {
    const browserId = getBrowserId();
    setEndorsedIds((prev) => {
      const next = new Set(prev);
      if (nowEndorsed) next.add(simulationId);
      else next.delete(simulationId);
      return next;
    });
    setSimulations((prev) =>
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
      load();
    }
  };

  const pillBase =
    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border';
  const pillActive = 'bg-primary text-white border-primary';
  const pillInactive = 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50';

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      <h1 className="text-3xl font-semibold text-gray-800 mb-6">Simulation Library</h1>

      <div className="flex flex-wrap gap-6 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 font-medium">Sort:</span>
          <button
            onClick={() => updateParams({ sort: 'endorsed' })}
            className={`${pillBase} ${sort === 'endorsed' ? pillActive : pillInactive}`}
          >
            Most Endorsed
          </button>
          <button
            onClick={() => updateParams({ sort: 'recent' })}
            className={`${pillBase} ${sort === 'recent' ? pillActive : pillInactive}`}
          >
            Recent
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 font-medium">Window:</span>
          <button
            onClick={() => updateParams({ window: 'week' })}
            className={`${pillBase} ${timeWindow === 'week' ? pillActive : pillInactive}`}
          >
            This Week
          </button>
          <button
            onClick={() => updateParams({ window: 'all' })}
            className={`${pillBase} ${timeWindow === 'all' ? pillActive : pillInactive}`}
          >
            All Time
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-8">Loading simulations...</div>
      ) : simulations.length === 0 ? (
        <div className="text-center text-gray-500 py-8 bg-white rounded-lg border border-gray-200">
          No published simulations yet.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200">
          {simulations.map((sim) => (
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
  );
}

export default Library;
