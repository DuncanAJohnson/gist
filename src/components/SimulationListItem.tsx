import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SimulationListItem as SimulationListItemType } from '../lib/simulationService';
import SimulationPreview from './SimulationPreview';
import { useLanguage } from '../contexts/LanguageContext';
import type { TranslationKey } from '../locales';

interface SimulationListItemProps {
  simulation: SimulationListItemType;
  descriptionPreviewLength?: number;
  endorsed?: boolean;
  onToggleEndorse?: (simulationId: number, nowEndorsed: boolean) => void;
  showProvenance?: boolean;
}

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

function formatRelativeTime(from: Date, now: number, t: Translator): string {
  const seconds = Math.max(0, Math.floor((now - from.getTime()) / 1000));
  if (seconds < 60) return t('time.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t(minutes === 1 ? 'time.minAgo' : 'time.minsAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(hours === 1 ? 'time.hrAgo' : 'time.hrsAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t(days === 1 ? 'time.dayAgo' : 'time.daysAgo', { n: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t(weeks === 1 ? 'time.wkAgo' : 'time.wksAgo', { n: weeks });
  const months = Math.floor(days / 30);
  if (months < 12) return t(months === 1 ? 'time.moAgo' : 'time.mosAgo', { n: months });
  const years = Math.floor(days / 365);
  return t(years === 1 ? 'time.yrAgo' : 'time.yrsAgo', { n: years });
}

function SimulationListItem({
  simulation,
  descriptionPreviewLength = 100,
  endorsed = false,
  onToggleEndorse,
  showProvenance = true,
}: SimulationListItemProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const date = new Date(simulation.published_at ?? simulation.created_at);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const timeString = formatRelativeTime(date, now, t);

  const descriptionPreview = simulation.description
    ? simulation.description.substring(0, descriptionPreviewLength) + (simulation.description.length > descriptionPreviewLength ? '...' : '')
    : t('list.noDescription');

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
            <span className="text-sm text-gray-500 whitespace-nowrap">
              {timeString}
            </span>
            <h3 className="text-lg font-semibold text-gray-800 truncate">
              {simulation.title || t('list.untitled')}
            </h3>
          </div>
          <p className="text-gray-600 text-sm mb-2 line-clamp-2">
            {descriptionPreview}
          </p>
          {showProvenance && (
            <div className="text-xs text-gray-500">
              {simulation.parent_id === null ? (
                <span>{t('list.newSimulation')}</span>
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
                    {t('list.remixedFrom', { id: simulation.parent_id })}
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
          endorsed,
          total: simulation.endorsement_count,
          onClick: handleEndorseClick,
          t,
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
  endorsed: boolean;
  total: number;
  onClick: (e: React.MouseEvent) => void;
  t: Translator;
}

function renderEndorsement({ endorsed, total, onClick, t }: RenderEndorsementArgs) {
  const buttonBase =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border';
  const buttonColors = endorsed
    ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100';
  const ariaLabel = endorsed ? t('list.removeEndorsement') : t('list.endorse');
  const heart = endorsed ? '♥' : '♡';

  return (
    <button onClick={onClick} className={`${buttonBase} ${buttonColors}`} aria-label={ariaLabel}>
      <span aria-hidden>{heart}</span>
      <span>{total}</span>
    </button>
  );
}

export default SimulationListItem;
