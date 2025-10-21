import React from 'react';
import { Link } from 'react-router-dom';
import './Navigation.css';

function Navigation() {
  return (
    <nav className="navigation">
      <div className="nav-container">
        <Link to="/" className="nav-brand">
          Physics Simulations
        </Link>
        <div className="nav-links">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/simulation/two-boxes" className="nav-link">Two Boxes</Link>
        </div>
      </div>
    </nav>
  );
}

export default Navigation;

