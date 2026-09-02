import { Star } from 'lucide-react';
import type { MovieNightCard } from '@/lib/api';
import { cn } from '@/lib/utils';

export function formatRuntime(minutes?: number): string | undefined {
  if (!minutes) return undefined;
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Poster-first face shared by the swipe deck, the match screens and the leaders grid. */
export function MovieCardFace({ card, expanded = false, onToggleExpand }: { card: MovieNightCard; expanded?: boolean; onToggleExpand?: () => void }) {
  const meta = [card.year, card.rating != null ? `★ ${card.rating.toFixed(1)}` : undefined, formatRuntime(card.runtimeMinutes)].filter(Boolean).join(' · ');
  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl bg-neutral-900 text-white shadow-2xl">
      {card.posterUrl
        ? <img src={card.posterUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none object-cover" />
        : <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950 text-6xl font-black opacity-30">{card.title.slice(0, 1)}</div>}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-5 pb-5 pt-24">
        <h2 className="text-2xl font-bold leading-tight drop-shadow">{card.title}</h2>
        {meta && <p className="mt-1 flex items-center gap-1 text-sm text-white/80"><Star className="h-3.5 w-3.5 fill-current text-amber-400" aria-hidden="true" />{meta}</p>}
        {card.overview && (
          <p onClick={onToggleExpand} className={cn('mt-2 text-sm text-white/75', !expanded && 'line-clamp-3', onToggleExpand && 'cursor-pointer')}>{card.overview}</p>
        )}
      </div>
    </div>
  );
}
