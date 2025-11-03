import { Link } from 'react-router-dom';
import { useCreateSimulation } from '../contexts/CreateSimulationContext';

function Navigation() {
  const { openModal } = useCreateSimulation();

  return (
    <nav className="bg-primary shadow-md sticky top-0 z-[100]">
      <div className="max-w-7xl mx-auto px-8 py-4 flex justify-between items-center">
        <Link 
          to="/" 
          className="text-2xl font-bold text-white no-underline transition-opacity duration-200 hover:opacity-90"
        >
          Generative Interactive Simulations for Teaching
        </Link>
        <div className="flex gap-6">
          <Link 
            to="/" 
            className="text-white no-underline font-medium transition-colors duration-200 px-4 py-2 rounded hover:bg-white/10"
          >
            Simulation Library
          </Link>
          <button 
            onClick={openModal}
            className="text-white no-underline font-medium transition-colors duration-200 px-4 py-2 rounded hover:bg-white/10"
          >
            Create New Simulation
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Navigation;

