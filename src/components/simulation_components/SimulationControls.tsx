export type PrecomputeState = 'idle' | 'precomputing' | 'ready';

export interface PrecomputeProgress {
  framesDone: number;
  totalFrames: number;
  estimatedMsRemaining: number;
}

interface SimulationControlsProps {
  isRunning: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  maxDuration: number;
  onMaxDurationChange: (v: number) => void;
  precomputeState: PrecomputeState;
  precomputeProgress: PrecomputeProgress | null;
}

function SimulationControls({
  isRunning,
  onPlay,
  onPause,
  onReset,
  maxDuration,
  onMaxDurationChange,
  precomputeState,
  precomputeProgress,
}: SimulationControlsProps) {
  if (precomputeState === 'precomputing') {
    const percent = precomputeProgress && precomputeProgress.totalFrames > 0
      ? Math.min(100, Math.round((precomputeProgress.framesDone / precomputeProgress.totalFrames) * 100))
      : 0;
    const secondsRemaining = precomputeProgress
      ? Math.max(0, Math.ceil(precomputeProgress.estimatedMsRemaining / 1000))
      : null;
    return (
      <div className="flex flex-col gap-1 min-w-[260px]">
        <div className="text-xs text-gray-700 font-medium">
          Pre-computing… {percent}%
          {secondsRemaining !== null && precomputeProgress!.framesDone > 0 && (
            <span className="text-gray-500"> (~{secondsRemaining}s remaining)</span>
          )}
        </div>
        <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-150"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  const durationDisabled = precomputeState === 'ready';

  return (
    <div className="flex gap-2 items-center">
      {/* Duration input */}
      <div
        className={`flex items-center gap-2 bg-gray-100 border border-gray-300 rounded-lg px-3 h-[40px] ${
          durationDisabled ? 'opacity-60' : ''
        }`}
        title={
          durationDisabled
            ? 'Reset to change the simulation duration'
            : 'Stop after this many seconds (minimum 1)'
        }
      >
        <span className="text-sm text-gray-600 whitespace-nowrap">Simulation Duration:</span>
        <input
          type="number"
          min="1"
          step="1"
          value={maxDuration}
          disabled={durationDisabled}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return;
            const n = Number(raw);
            if (Number.isFinite(n)) {
              onMaxDurationChange(Math.max(1, n));
            }
          }}
          className="w-14 bg-transparent text-sm text-center focus:outline-none disabled:cursor-not-allowed"
        />
        <span className="text-sm text-gray-600">seconds</span>
      </div>

      {!isRunning ? (
        <button
          className="bg-green-500 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:bg-green-600 active:translate-y-0 active:shadow-sm text-white border-0 rounded px-4 py-2 text-xl transition-all duration-200 shadow-md min-w-[50px] h-[40px] flex items-center justify-center"
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
        title={precomputeState === 'ready' ? 'Reset & clear pre-computed cache' : 'Reset'}
      >
        ⟲
      </button>
    </div>
  );
}

export default SimulationControls;
