import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SimulationListItem as SimulationListItemType } from '../lib/simulationService';
import SimulationPreview from './SimulationPreview';

type EndorsementDisplay = 'total' | 'with-week';

interface SimulationListItemProps {
  simulation: SimulationListItemType;
  descriptionPreviewLength?: number;
  endorsed?: boolean;
  onToggleEndorse?: (simulationId: number, nowEndorsed: boolean) => void;
  endorsementDisplay?: EndorsementDisplay;
  showProvenance?: boolean;
}

function SimulationListItem({
  simulation,
  descriptionPreviewLength = 100,
  endorsed = false,
  onToggleEndorse,
  endorsementDisplay = 'total',
  showProvenance = true,
}: SimulationListItemProps) {
  const navigate = useNavigate();
  const date = new Date(simulation.created_at);
  const timeString = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const descriptionPreview = simulation.description
    ? simulation.description.substring(0, descriptionPreviewLength) + (simulation.description.length > descriptionPreviewLength ? '...' : '')
    : 'No description';

  const handleEndorseClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleEndorse && typeof simulation.id === 'number') {
      onToggleEndorse(simulation.id, !endorsed);
    }
  };

  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const PREVIEW_W = 240;
  const PREVIEW_H = 180;

  const computePos = () => {
    const el = linkRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const margin = 12;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let left = rect.right + margin;
    if (left + PREVIEW_W + margin > viewportW) {
      left = rect.left - PREVIEW_W - margin;
    }
    left = Math.max(margin, Math.min(left, viewportW - PREVIEW_W - margin));
    let top = rect.top + rect.height / 2 - PREVIEW_H / 2;
    top = Math.max(margin, Math.min(top, viewportH - PREVIEW_H - margin));
    return { top, left };
  };

  const handleMouseEnter = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setPreviewPos(computePos());
    }, 250);
  };
  const handleMouseLeave = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    setPreviewPos(null);
  };
  useEffect(() => {
    return () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    };
  }, []);

  return (
    <Link
      ref={linkRef}
      to={`/simulation/${simulation.id}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative block bg-white rounded-lg p-4 hover:bg-gray-50 transition-colors border-b border-gray-200 last:border-b-0 no-underline text-inherit"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm text-gray-500 font-mono whitespace-nowrap">
              {timeString}
            </span>
            <h3 className="text-lg font-semibold text-gray-800 truncate">
              {simulation.title || 'Untitled Simulation'}
            </h3>
          </div>
          <p className="text-gray-600 text-sm mb-2 line-clamp-2">
            {descriptionPreview}
          </p>
          {showProvenance && (
            <div className="text-xs text-gray-500">
              {simulation.parent_id === null ? (
                <span>New Simulation</span>
              ) : (
                <span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(`/simulation/${simulation.parent_id}`);
                    }}
                    className="text-primary hover:underline bg-transparent border-0 p-0 cursor-pointer"
                  >
                    Remixed from Simulation {simulation.parent_id}
                  </button>
                  {simulation.changes_made && simulation.changes_made !== 'Loading...' && (
                    <>: {simulation.changes_made}</>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
        {onToggleEndorse && renderEndorsement({
          display: endorsementDisplay,
          endorsed,
          total: simulation.endorsement_count,
          week: simulation.week_endorsement_count,
          onClick: handleEndorseClick,
        })}
      </div>
      {previewPos && (
        <div
          className="pointer-events-none fixed z-50 hidden md:block"
          style={{ top: previewPos.top, left: previewPos.left }}
        >
          <SimulationPreview simulationId={simulation.id} width={PREVIEW_W} height={PREVIEW_H} />
        </div>
      )}
    </Link>
  );
}

interface RenderEndorsementArgs {
  display: EndorsementDisplay;
  endorsed: boolean;
  total: number;
  week: number;
  onClick: (e: React.MouseEvent) => void;
}

function renderEndorsement({ display, endorsed, total, week, onClick }: RenderEndorsementArgs) {
  const buttonBase =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border';
  const buttonColors = endorsed
    ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100';
  const ariaLabel = endorsed ? 'Remove endorsement' : 'Endorse';
  const heart = endorsed ? '♥' : '♡';

  const pill = (
    <button onClick={onClick} className={`${buttonBase} ${buttonColors}`} aria-label={ariaLabel}>
      <span aria-hidden>{heart}</span>
      <span>{total}</span>
    </button>
  );

  if (display === 'with-week') {
    return (
      <div className="flex flex-col items-end gap-1">
        {pill}
        {week > 0 && (
          <span className="text-xs font-medium text-orange-700">
            +{week} this week
          </span>
        )}
      </div>
    );
  }

  return pill;
}

export default SimulationListItem;
