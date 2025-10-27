interface SimulationControlsProps {
  isRunning: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
}

function SimulationControls({ isRunning, onPlay, onPause, onReset }: SimulationControlsProps) {
  return (
    <div className="flex gap-2 items-center">
      {!isRunning ? (
        <button 
          className="bg-green-500 text-white border-0 rounded px-4 py-2 text-xl cursor-pointer transition-all duration-200 shadow-md min-w-[50px] h-[40px] flex items-center justify-center hover:-translate-y-0.5 hover:shadow-lg hover:bg-green-600 active:translate-y-0 active:shadow-sm" 
          onClick={onPlay} 
          title="Play"
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

