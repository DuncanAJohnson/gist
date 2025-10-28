import { Link } from 'react-router-dom';

function Navigation() {
  return (
    <nav className="bg-primary shadow-md sticky top-0 z-[100]">
      <div className="max-w-7xl mx-auto px-8 py-4 flex justify-between items-center">
        <Link 
          to="/" 
          className="text-2xl font-bold text-white no-underline transition-opacity duration-200 hover:opacity-90"
        >
          Physics Simulations
        </Link>
        <div className="flex gap-6">
          <Link 
            to="/" 
            className="text-white no-underline font-medium transition-colors duration-200 px-4 py-2 rounded hover:bg-white/10"
          >
            Home
          </Link>
          <Link 
            to="/simulation/two-boxes" 
            className="text-white no-underline font-medium transition-colors duration-200 px-4 py-2 rounded hover:bg-white/10"
          >
            Two Boxes
          </Link>
          <Link 
            to="/simulation/toss-ball" 
            className="text-white no-underline font-medium transition-colors duration-200 px-4 py-2 rounded hover:bg-white/10"
          >
            Toss Ball
          </Link>
          <Link 
            to="/create-simulation" 
            className="text-white no-underline font-medium transition-colors duration-200 px-4 py-2 rounded hover:bg-white/10"
          >
            Create AI Simulation
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default Navigation;

