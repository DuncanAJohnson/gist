import React from 'react';
import './ControlPanel.css';

function ControlPanel({ title, children, className = '' }) {
  return (
    <div className={`control-panel ${className}`}>
      {title && <h3 className="control-panel-title">{title}</h3>}
      <div className="control-panel-content">
        {children}
      </div>
    </div>
  );
}

export default ControlPanel;

