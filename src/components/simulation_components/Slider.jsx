import React from 'react';
import './Slider.css';

function Slider({ label, value, onChange, min, max, step }) {
  return (
    <div className="slider-container">
      <label className="slider-label">
        {label}: <span className="slider-value">{value.toFixed(2)}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="slider-input"
      />
    </div>
  );
}

export default Slider;

