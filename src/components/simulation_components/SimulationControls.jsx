import React from 'react';
import './SimulationControls.css';

function SimulationControls({ isRunning, onPlay, onPause, onReset }) {
  return (
    <div className="simulation-controls-buttons">
      {!isRunning ? (
        <button className="control-button play-button" onClick={onPlay} title="Play">
          ▶
        </button>
      ) : (
        <button className="control-button pause-button" onClick={onPause} title="Pause">
          ⏸
        </button>
      )}
      <button className="control-button reset-button" onClick={onReset} title="Reset">
        ⟲
      </button>
    </div>
  );
}

export default SimulationControls;

