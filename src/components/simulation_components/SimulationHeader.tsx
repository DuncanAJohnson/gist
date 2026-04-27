import { useState, useRef, useEffect } from 'react';
import CreateSimulation from '../CreateSimulation';
import FeedbackModal from './FeedbackModal';
import {
  getSimulationMeta,
  publishSimulation,
  unpublishSimulation,
  endorseSimulation,
  unendorseSimulation,
  getEndorsedSimulationIds,
} from '../../lib/simulationService';
import { getBrowserId } from '../../lib/browserId';

interface SimulationHeaderProps {
  title?: string;
  description?: string;
  onEdit?: (json: any, userPrompt: string | null) => void;
  simulationId?: number;
  currentJSON?: any;
}

function SimulationHeader({
  title,
  description,
  onEdit,
  simulationId,
  currentJSON,
}: SimulationHeaderProps) {
  const [showEditPopup, setShowEditPopup] = useState(false);
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const feedbackButtonRef = useRef<HTMLButtonElement>(null);
  const feedbackPopupRef = useRef<HTMLDivElement>(null);

  const [published, setPublished] = useState(false);
  const [publishedBy, setPublishedBy] = useState<string | null>(null);
  const [endorsed, setEndorsed] = useState(false);
  const [endorsementCount, setEndorsementCount] = useState(0);
  const [metaLoaded, setMetaLoaded] = useState(false);

  // Load publish/endorse state when simulationId changes
  useEffect(() => {
    if (!simulationId) {
      setMetaLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const browserId = getBrowserId();
        const [meta, endorsedIds] = await Promise.all([
          getSimulationMeta(simulationId),
          getEndorsedSimulationIds(browserId),
        ]);
        if (cancelled) return;
        setPublished(meta.published);
        setPublishedBy(meta.published_by);
        setEndorsementCount(meta.endorsement_count);
        setEndorsed(endorsedIds.has(simulationId));
        setMetaLoaded(true);
      } catch (err) {
        console.error('Failed to load simulation meta:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [simulationId]);

  const isPublisher = published && publishedBy !== null && publishedBy === getBrowserId();

  // Close popups when clicking outside
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
      if (
        showFeedbackPopup &&
        feedbackPopupRef.current &&
        !feedbackPopupRef.current.contains(event.target as Node) &&
        feedbackButtonRef.current &&
        !feedbackButtonRef.current.contains(event.target as Node)
      ) {
        setShowFeedbackPopup(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEditPopup, showFeedbackPopup]);

  const handleJSONExtracted = (json: any, userPrompt: string | null) => {
    if (onEdit) {
      onEdit(json, userPrompt);
    }
    setShowEditPopup(false);
  };

  const handleTogglePublish = async () => {
    if (!simulationId) return;
    const browserId = getBrowserId();
    const next = !published;
    const prevPublishedBy = publishedBy;
    setPublished(next);
    setPublishedBy(next ? browserId : null);
    try {
      if (next) await publishSimulation(simulationId, browserId);
      else await unpublishSimulation(simulationId, browserId);
    } catch (err) {
      console.error('Failed to toggle publish:', err);
      setPublished(!next);
      setPublishedBy(prevPublishedBy);
    }
  };

  const handleToggleEndorse = async () => {
    if (!simulationId) return;
    const next = !endorsed;
    setEndorsed(next);
    setEndorsementCount((c) => c + (next ? 1 : -1));
    try {
      const browserId = getBrowserId();
      if (next) await endorseSimulation(simulationId, browserId);
      else await unendorseSimulation(simulationId, browserId);
    } catch (err) {
      console.error('Failed to toggle endorsement:', err);
      setEndorsed(!next);
      setEndorsementCount((c) => c + (next ? -1 : 1));
    }
  };

  return (
    <div className="flex flex-row bg-gray-50 rounded-lg shadow-sm justify-between items-center relative">
      <div className="flex flex-col items-start px-8 py-4 gap-4">
        <div className="flex items-center gap-4">
          <div>
            {title && (
              <h1 className="m-0 text-gray-800 text-3xl font-semibold">
                {title}
                {simulationId !== undefined && (
                  <span className="text-gray-400 font-normal"> - #{simulationId}</span>
                )}
              </h1>
            )}
            {description && (
              <p className="mt-2 mb-0 text-gray-600 text-base leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right side - Endorse, Feedback, and Edit button */}
      <div className="flex flex-row items-center justify-center gap-4 px-8 py-4 relative">
        {simulationId && metaLoaded && (
          <>
            {published && (
              <button
                onClick={handleToggleEndorse}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  endorsed
                    ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
                aria-label={endorsed ? 'Remove endorsement' : 'Endorse'}
              >
                <span aria-hidden>{endorsed ? '♥' : '♡'}</span>
                <span>{endorsementCount}</span>
              </button>
            )}
            {!published ? (
              <button
                onClick={handleTogglePublish}
                className="px-4 py-2 rounded-lg transition-colors font-medium text-sm bg-green-600 text-white hover:bg-green-700"
              >
                Publish
              </button>
            ) : isPublisher ? (
              <button
                onClick={handleTogglePublish}
                className="px-4 py-2 rounded-lg transition-colors font-medium text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                Published ✓
              </button>
            ) : (
              <span
                className="px-4 py-2 rounded-lg font-medium text-sm bg-gray-100 text-gray-600 border border-gray-200"
                title="Only the publisher can unpublish this simulation"
              >
                Published ✓
              </span>
            )}
          </>
        )}
        {simulationId && (
          <>
            <button
              ref={feedbackButtonRef}
              onClick={() => setShowFeedbackPopup(!showFeedbackPopup)}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium text-sm"
            >
              Give Feedback
            </button>
            {showFeedbackPopup && (
              <div
                ref={feedbackPopupRef}
                className="absolute top-full right-0 mt-2 z-50"
                style={{ transform: 'translateX(0)' }}
              >
                <FeedbackModal
                  simulationId={simulationId}
                  onClose={() => setShowFeedbackPopup(false)}
                />
              </div>
            )}
          </>
        )}
        {onEdit && (
          <>
            <button
              ref={editButtonRef}
              onClick={() => setShowEditPopup(!showEditPopup)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-sm"
            >
              Remix
            </button>
            {showEditPopup && (
              <div
                ref={popupRef}
                className="absolute top-full right-0 mt-2 z-50"
                style={{ transform: 'translateX(0)' }}
              >
                <CreateSimulation
                  isOpen={showEditPopup}
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
