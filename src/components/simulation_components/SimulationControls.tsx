interface SimulationControlsProps {
  isRunning: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  maxDuration: number | null;
  onMaxDurationChange: (v: number | null) => void;
  stopped: boolean;
}

function SimulationControls({ isRunning, onPlay, onPause, onReset, maxDuration, onMaxDurationChange, stopped }: SimulationControlsProps) {
  return (
    <div className="flex gap-2 items-center">
      {/* Duration input */}
      <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded-lg px-3 h-[40px]" title="Stop after this many seconds (leave blank for unlimited)">
        <span className="text-sm text-gray-600 whitespace-nowrap">Simulation Duration:</span>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="∞"
          value={maxDuration ?? ''}
          onChange={(e) => {
            const val = e.target.value;
            onMaxDurationChange(val === '' ? null : Math.max(0, Number(val)));
          }}
          className="w-14 bg-transparent text-sm text-center focus:outline-none"
        />
        <span className="text-sm text-gray-600">seconds</span>
      </div>

      {!isRunning ? (
        <button
          className={`text-white border-0 rounded px-4 py-2 text-xl transition-all duration-200 shadow-md min-w-[50px] h-[40px] flex items-center justify-center ${
            stopped
              ? 'bg-gray-400 cursor-not-allowed opacity-60'
              : 'bg-green-500 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:bg-green-600 active:translate-y-0 active:shadow-sm'
          }`}
          onClick={stopped ? undefined : onPlay}
          title={stopped ? 'Reset to play again' : 'Play'}
          disabled={stopped}
        >
          ▶
        </button>
      ) : (
        <button
          className="bg-orange-500 text-white border-0 rounded px-4 py-2 text-xl cursor-pointer transition-all duration-200 shadow-md min-w-[50px] h-[40px] flex items-center justify-center hover:-translate-y-0.5 hover:shadow-lg hover:bg-orange-600 active:translate-y-0 active:shadow-sm"
          onClick={onPause}
          title="Pause"
        >
          ⏸
        </button>
      )}
      <button
        className="bg-blue-500 text-white border-0 rounded px-4 py-2 text-xl cursor-pointer transition-all duration-200 shadow-md min-w-[50px] h-[40px] flex items-center justify-center hover:-translate-y-0.5 hover:shadow-lg hover:bg-blue-600 active:translate-y-0 active:shadow-sm"
        onClick={onReset}
        title="Reset"
      >
        ⟲
      </button>
    </div>
  );
}

export default SimulationControls;

