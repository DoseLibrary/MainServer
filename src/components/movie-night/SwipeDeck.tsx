import { useRef, useState } from 'react';
import { HelpCircle, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { MovieNightCard, MovieNightVote } from '@/lib/api';
import { SwipeCard, type SwipeCardHandle, type SwipeDirection } from './SwipeCard';

const VOTE_OF: Record<SwipeDirection, MovieNightVote> = { left: 'no', right: 'yes', up: 'maybe' };
const DIRECTION_OF: Record<MovieNightVote, SwipeDirection> = { no: 'left', yes: 'right', maybe: 'up' };

interface Props {
  cards: MovieNightCard[];
  index: number;
  onVote: (card: MovieNightCard, vote: MovieNightVote) => void;
  onUndo: () => void;
  canUndo: boolean;
  /** Vote of the card just undone, so it can slide back in from the right side. */
  lastUndoneVote?: MovieNightVote;
}

/** The stack: the current card on top, two peeking behind, and the vote buttons. */
export function SwipeDeck({ cards, index, onVote, onUndo, canUndo, lastUndoneVote }: Props) {
  const top = useRef<SwipeCardHandle>(null);
  const [enteringFor, setEnteringFor] = useState<{ id: string; from: SwipeDirection } | undefined>();
  const visible = cards.slice(index, index + 3);
  const done = index >= cards.length;

  function undo() {
    if (!canUndo) return;
    const previous = cards[index - 1];
    if (previous && lastUndoneVote) setEnteringFor({ id: previous.id, from: DIRECTION_OF[lastUndoneVote] });
    onUndo();
  }

  return (
    <div className="relative h-full w-full">
      <div data-testid="swipe-stack" className="absolute inset-x-4 top-[calc(max(1rem,env(safe-area-inset-top))+2.5rem)] bottom-28">
        {done
          ? <div data-testid="deck-done" className="flex h-full flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-2xl font-bold">You're through the deck</p>
            <p className="mt-2 text-white/70">Waiting for the others to finish.</p>
          </div>
          : [...visible].reverse().map((card, i) => {
            const depth = (visible.length - 1 - i) as 0 | 1 | 2;
            return <SwipeCard key={card.id} ref={depth === 0 ? top : undefined} card={card} depth={depth} interactive={depth === 0}
              entering={enteringFor?.id === card.id ? enteringFor.from : undefined}
              onSwipe={(direction) => onVote(card, VOTE_OF[direction])} />;
          })}
      </div>
      <div className="absolute inset-x-0 z-20 flex items-center justify-center gap-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button type="button" aria-label="Undo" disabled={!canUndo} onClick={undo}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/80 disabled:opacity-30"><RotateCcw className="h-5 w-5" aria-hidden="true" /></button>
        <button type="button" aria-label="No" disabled={done} onClick={() => top.current?.fly('left')}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/15 text-rose-400 ring-2 ring-rose-500/60 active:scale-95 disabled:opacity-30"><ThumbsDown className="h-7 w-7" aria-hidden="true" /></button>
        <button type="button" aria-label="Maybe" disabled={done} onClick={() => top.current?.fly('up')}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/15 text-amber-300 ring-2 ring-amber-400/60 active:scale-95 disabled:opacity-30"><HelpCircle className="h-6 w-6" aria-hidden="true" /></button>
        <button type="button" aria-label="Yes" disabled={done} onClick={() => top.current?.fly('right')}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-2 ring-emerald-500/60 active:scale-95 disabled:opacity-30"><ThumbsUp className="h-7 w-7" aria-hidden="true" /></button>
      </div>
    </div>
  );
}
