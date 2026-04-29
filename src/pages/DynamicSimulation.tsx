import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import JsonSimulation from '../components/JsonSimulation';
import { getSimulation } from '../lib/simulationService';
import { useLanguage } from '../contexts/LanguageContext';

interface SimulationConfig {
  title?: string;
  description?: string;
  environment: {
    walls: string[];
    gravity: number;
  };
  objects?: Array<any>;
  controls?: Array<any>;
  outputs?: Array<any>;
  graphs?: Array<any>;
}

function DynamicSimulation() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [config, setConfig] = useState<SimulationConfig | null>(location.state?.config || null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadSimulation(parseInt(id));
    }
  }, [id]);

  const loadSimulation = async (simulationId: number) => {
    try {
      setLoading(true);
      setError(null);
      const simulationConfig = await getSimulation(simulationId);
      setConfig(simulationConfig);
    } catch (err) {
      console.error('Failed to load simulation:', err);
      setError(err instanceof Error ? err.message : 'Failed to load simulation');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="bg-white rounded-xl p-8 shadow-md text-center">
          <p className="text-gray-600">{t('dynamic.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="bg-white rounded-xl p-8 shadow-md">
          <h2 className="text-2xl text-gray-800 mb-4">{t('dynamic.noSimulationHeading')}</h2>
          <p className="text-gray-600 mb-4">
            {error || t('dynamic.noSimulationBody')}
          </p>
          <button
            onClick={() => navigate('/')}
            className="bg-primary text-white px-6 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            {t('dynamic.goHome')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <JsonSimulation config={config} simulationId={id ? parseInt(id) : undefined} />
  );
}

export default DynamicSimulation;

