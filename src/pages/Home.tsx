import { Link } from 'react-router-dom';

function Home() {
  return (
    <div className="max-w-7xl mx-auto px-8 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl text-gray-800 mb-4 font-semibold">
          Physics Simulations with Matter.js
        </h1>
        <p className="text-xl text-gray-600">
          Explore interactive physics simulations built with React and Matter.js
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-8 mb-16">
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
      </div>
    </div>
  );
}

export default Home;

