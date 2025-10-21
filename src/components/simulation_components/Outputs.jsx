import React from 'react';
import './Outputs.css';

function Outputs({ label, value, unit = '' }) {
  const displayValue = typeof value === 'number' ? value.toFixed(2) : value;
  
  return (
    <div className="output-container">
      <span className="output-label">{label}:</span>
      <span className="output-value">
        {displayValue} {unit}
      </span>
    </div>
  );
}

export default Outputs;

