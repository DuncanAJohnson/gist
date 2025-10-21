import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

function Home() {
  return (
    <div className="home">
      <div className="home-header">
        <h1>Physics Simulations with Matter.js</h1>
        <p className="home-subtitle">
          Explore interactive physics simulations built with React and Matter.js
        </p>
      </div>

      <div className="simulations-grid">
        <Link to="/simulation/two-boxes" className="simulation-card">
          <div className="card-icon">📦</div>
          <h2>Two Boxes Collision</h2>
          <p>
            Watch two boxes move toward each other and collide. 
            Control their velocities with interactive sliders.
          </p>
          <div className="card-footer">
            <span className="card-tag">Collision</span>
            <span className="card-tag">Velocity</span>
          </div>
        </Link>

        <div className="simulation-card coming-soon">
          <div className="card-icon">🎯</div>
          <h2>Coming Soon</h2>
          <p>More simulations will be added here</p>
        </div>
      </div>
    </div>
  );
}

export default Home;

