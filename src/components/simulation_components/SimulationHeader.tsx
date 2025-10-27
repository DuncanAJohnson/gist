import SimulationControls from './SimulationControls';

interface SimulationHeaderProps {
  title?: string;
  description?: string;
  isRunning: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
}

function SimulationHeader({
  title,
  description,
  isRunning,
  onPlay,
  onPause,
  onReset,
}: SimulationHeaderProps) {
  return (
    <div className="flex flex-row bg-gray-50 rounded-lg shadow-sm justify-center">
        <div className="flex flex-col items-start px-8 py-4 gap-4">
            <div className="text-center">
                {title && <h1 className="m-0 text-gray-800 text-3xl font-semibold">{title}</h1>}
                {description && (
                <p className="mt-2 mb-0 text-gray-600 text-base leading-relaxed">
                    {description}
                </p>
                )}
            </div>
        </div>
        
        <div className="flex flex-row items-center justify-center">
            <SimulationControls
                isRunning={isRunning}
                onPlay={onPlay}
                onPause={onPause}
                onReset={onReset}
            />
        </div>
    </div>
  );
}

export default SimulationHeader;

