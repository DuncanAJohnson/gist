import { useRef, useState } from 'react';

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
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  replayFrameIndex: number;
  totalFrames: number;
  onSeek: (frameIndex: number) => void;
}

const SPEED_PRESETS: { value: number; label: string }[] = [
  { value: 0.25, label: '¼x' },
  { value: 0.5, label: '½x' },
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 4, label: '4x' },
];

function formatSeconds(frames: number): string {
  return (frames / 60).toFixed(2);
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
  playbackSpeed,
  onPlaybackSpeedChange,
  replayFrameIndex,
  totalFrames,
  onSeek,
}: SimulationControlsProps) {
  const [scrubbing, setScrubbing] = useState(false);
  const [localFrame, setLocalFrame] = useState(0);
  const wasPlayingRef = useRef(false);

  const startScrub = () => {
    setScrubbing(true);
    setLocalFrame(replayFrameIndex);
    wasPlayingRef.current = isRunning;
    if (isRunning) onPause();
  };

  const endScrub = () => {
    if (!scrubbing) return;
    setScrubbing(false);
    if (wasPlayingRef.current) onPlay();
    wasPlayingRef.current = false;
  };

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
            className="h-full bg-green-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  const showScrub = precomputeState === 'ready' && totalFrames > 0;
  const displayFrame = scrubbing ? localFrame : replayFrameIndex;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        {/* Duration input */}
        <div
          className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded-lg px-3 h-[40px]"
          title="Stop after this many seconds (minimum 1). Editing this invalidates the pre-computed cache."
        >
          <span className="text-sm text-gray-600 whitespace-nowrap">Simulation Duration:</span>
          <input
            type="number"
            min="1"
            step="1"
            value={maxDuration}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') return;
              const n = Number(raw);
              if (Number.isFinite(n)) {
                onMaxDurationChange(Math.max(1, n));
              }
            }}
            className="w-14 bg-transparent text-sm text-center focus:outline-none"
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

        {/* Playback speed selector */}
        <div
          className="flex items-center bg-gray-100 border border-gray-300 rounded-lg h-[40px] overflow-hidden"
          title="Playback speed (affects replay only)"
        >
          {SPEED_PRESETS.map((preset, i) => {
            const selected = playbackSpeed === preset.value;
            return (
              <button
                key={preset.value}
                onClick={() => onPlaybackSpeedChange(preset.value)}
                className={`px-2.5 h-full text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-blue-500 text-white'
                    : 'bg-transparent text-gray-700 hover:bg-gray-200'
                } ${i > 0 ? 'border-l border-gray-300' : ''}`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {showScrub && (
        <div className="flex items-center gap-3 px-1">
          <input
            type="range"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            step={1}
            value={displayFrame}
            onMouseDown={startScrub}
            onTouchStart={startScrub}
            onMouseUp={endScrub}
            onTouchEnd={endScrub}
            onTouchCancel={endScrub}
            onBlur={endScrub}
            onChange={(e) => {
              const n = Number(e.target.value);
              setLocalFrame(n);
              onSeek(n);
            }}
            className="flex-1 accent-blue-500 cursor-pointer"
          />
          <span className="text-xs text-gray-600 font-mono tabular-nums whitespace-nowrap min-w-[90px] text-right">
            {formatSeconds(displayFrame)}s / {formatSeconds(totalFrames - 1)}s
          </span>
        </div>
      )}
    </div>
  );
}

export default SimulationControls;
