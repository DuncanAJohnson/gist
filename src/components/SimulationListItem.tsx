import { Link, useNavigate } from 'react-router-dom';
import { SimulationListItem as SimulationListItemType } from '../lib/simulationService';

interface SimulationListItemProps {
  simulation: SimulationListItemType;
  descriptionPreviewLength?: number;
  endorsed?: boolean;
  onToggleEndorse?: (simulationId: number, nowEndorsed: boolean) => void;
}

function SimulationListItem({
  simulation,
  descriptionPreviewLength = 100,
  endorsed = false,
  onToggleEndorse,
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

  return (
    <Link
      to={`/simulation/${simulation.id}`}
      className="block bg-white rounded-lg p-4 hover:bg-gray-50 transition-colors border-b border-gray-200 last:border-b-0 no-underline text-inherit"
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
                : {simulation.changes_made || 'Loading...'}
              </span>
            )}
          </div>
        </div>
        {onToggleEndorse && (
          <button
            onClick={handleEndorseClick}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              endorsed
                ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
            aria-label={endorsed ? 'Remove endorsement' : 'Endorse'}
          >
            <span aria-hidden>{endorsed ? '♥' : '♡'}</span>
            <span>{simulation.endorsement_count}</span>
          </button>
        )}
      </div>
    </Link>
  );
}

export default SimulationListItem;
