import { useState, useRef, useEffect } from 'react';
import SimulationControls from './SimulationControls';
import AISimulationChat from '../AISimulationChat';

interface SimulationHeaderProps {
  title?: string;
  description?: string;
  isRunning: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onEdit?: (json: any) => void;
  onTweakJSON?: () => void;
  simulationId?: number;
  currentJSON?: any;
}

function SimulationHeader({
  title,
  description,
  isRunning,
  onPlay,
  onPause,
  onReset,
  onEdit,
  onTweakJSON,
  simulationId,
  currentJSON,
}: SimulationHeaderProps) {
  const [showEditPopup, setShowEditPopup] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showEditPopup &&
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        editButtonRef.current &&
        !editButtonRef.current.contains(event.target as Node)
      ) {
        setShowEditPopup(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEditPopup]);

  const handleJSONExtracted = (json: any) => {
    if (onEdit) {
      onEdit(json);
    }
    setShowEditPopup(false);
  };

  return (
    <div className="flex flex-row bg-gray-50 rounded-lg shadow-sm justify-between items-center relative">
      {/* Left side - Tweak JSON button */}
      <div className="flex flex-col items-start px-8 py-4 gap-4">
        <div className="flex items-center gap-4">
          {onTweakJSON && (
            <button
              onClick={onTweakJSON}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium text-sm"
            >
              Tweak Simulation JSON
            </button>
          )}
          <div>
            {title && <h1 className="m-0 text-gray-800 text-3xl font-semibold">{title}</h1>}
            {description && (
              <p className="mt-2 mb-0 text-gray-600 text-base leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>
      
      {/* Right side - Controls and Edit button */}
      <div className="flex flex-row items-center justify-center gap-4 px-8 py-4 relative">
        <SimulationControls
          isRunning={isRunning}
          onPlay={onPlay}
          onPause={onPause}
          onReset={onReset}
        />
        {onEdit && (
          <>
            <button
              ref={editButtonRef}
              onClick={() => setShowEditPopup(!showEditPopup)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-sm"
            >
              Edit
            </button>
            {showEditPopup && (
              <div
                ref={popupRef}
                className="absolute top-full right-0 mt-2 z-50"
                style={{ transform: 'translateX(0)' }}
              >
                <AISimulationChat
                  existingJSON={currentJSON}
                  onJSONExtracted={handleJSONExtracted}
                  onClose={() => setShowEditPopup(false)}
                  compact={true}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default SimulationHeader;

