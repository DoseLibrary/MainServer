import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MatchOverlay } from '@/components/movie-night/MatchOverlay';
import { SwipeDeck } from '@/components/movie-night/SwipeDeck';
import { api, ApiError, type MovieNightCard, type MovieNightMessage, type MovieNightState, type MovieNightVote } from '@/lib/api';
import { clearParticipant, loadParticipant, saveParticipant, useMovieNightSocket, type StoredParticipant } from '@/lib/movie-night';

type Phase = 'entry' | 'joining' | 'waiting' | 'swiping' | 'ended' | 'error';

/**
 * The phone. Reached by scanning the QR on the TV; no Dose account involved.
 * A stored participant token lets a reload rejoin silently.
 */
export function MovieNightJoin() {
  const [search] = useSearchParams();
  const codeFromScan = (search.get('code') ?? '').toUpperCase();
  const [code, setCode] = useState(codeFromScan);
  const [nickname, setNickname] = useState('');
  const [participant, setParticipant] = useState<StoredParticipant | undefined>(() => (codeFromScan ? loadParticipant(codeFromScan) : undefined));
  const [phase, setPhase] = useState<Phase>(() => (codeFromScan && loadParticipant(codeFromScan) ? 'joining' : 'entry'));
  const [message, setMessage] = useState<string>();
  const [state, setState] = useState<MovieNightState>();
  const [cards, setCards] = useState<MovieNightCard[]>([]);
  const [votes, setVotes] = useState<Record<string, MovieNightVote>>({});
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<Array<{ id: string; vote: MovieNightVote }>>([]);

  const activeMatch = useMemo(() => {
    const open = state?.matches.filter((card) => !state.dismissed.includes(card.id)) ?? [];
    return open.length > 0 ? open[open.length - 1] : undefined;
  }, [state]);

  /** Refetch state + deck; used after join, on reconnect, and on phase changes. */
  const sync = useCallback(async (session: string, auth: { participantId: string; token: string }) => {
    const [{ state: next }, { cards: deck }] = await Promise.all([api.movieNight.state(session, auth.token), api.movieNight.deck(session, auth.token)]);
    setState(next); setCards(deck);
    const own = next.votes ?? {};
    setVotes(own);
    const first = deck.findIndex((card) => !own[card.id]);
    setIndex(first === -1 ? deck.length : first);
    setPhase(next.phase === 'lobby' ? 'waiting' : next.phase === 'swiping' ? 'swiping' : 'ended');
  }, []);

  // Silent rejoin from a stored token: participant/phase already reflect it from initial
  // state above, so this effect only needs to fire off the confirming sync, once. Seed the
  // guard as already-fired when there was no stored token at mount, so a later join() (which
  // also sets `participant`) never re-triggers this effect and double-syncs.
  const rejoinAttempted = useRef(!(codeFromScan && loadParticipant(codeFromScan)));
  useEffect(() => {
    if (!codeFromScan || !participant || rejoinAttempted.current) return;
    rejoinAttempted.current = true;
    void sync(codeFromScan, participant).catch(() => { clearParticipant(codeFromScan); setParticipant(undefined); setPhase('entry'); });
  }, [codeFromScan, participant, sync]);

  async function join(event: FormEvent) {
    event.preventDefault();
    const session = code.trim().toUpperCase();
    if (!session || !nickname.trim()) return;
    setPhase('joining'); setMessage(undefined);
    try {
      const joined = await api.movieNight.join(session, nickname);
      saveParticipant(session, joined);
      setParticipant(joined); setCode(session);
      await sync(session, joined);
    } catch (caught) {
      setPhase('entry');
      setMessage(caught instanceof ApiError && caught.status === 404 ? 'No movie night with that code.'
        : caught instanceof ApiError && caught.status === 409 ? (caught.message || 'That name is taken.')
          : caught instanceof Error ? caught.message : 'Could not join.');
    }
  }

  const onMessage = useCallback((incoming: MovieNightMessage) => {
    setState((current) => {
      if (!current) return current;
      switch (incoming.type) {
        case 'participant.joined': return { ...current, participants: [...current.participants.filter((p) => p.id !== incoming.participant.id), incoming.participant] };
        case 'participant.left': return { ...current, participants: current.participants.filter((p) => p.id !== incoming.participantId) };
        case 'phase.changed': return { ...current, phase: incoming.phase };
        case 'match': return { ...current, matches: [...current.matches, incoming.card] };
        case 'match.dismissed': return { ...current, dismissed: [...current.dismissed, incoming.cardId] };
        default: return current;
      }
    });
    if (incoming.type === 'phase.changed') {
      if (incoming.phase === 'swiping') setPhase('swiping');
      else if (incoming.phase === 'lobby') setPhase('waiting');
      else if (incoming.phase === 'ended') { if (code) clearParticipant(code); setPhase('ended'); }
    }
    if (incoming.type === 'ended') { if (code) clearParticipant(code); setPhase('ended'); }
  }, [code]);
  const onClose = useCallback((closeCode: number) => { if (closeCode === 4000 || closeCode === 4404) { if (code) clearParticipant(code); setPhase('ended'); } }, [code]);
  const onOpen = useCallback(() => { if (participant && code) void sync(code, participant).catch(() => undefined); }, [participant, code, sync]);
  useMovieNightSocket(participant ? code : undefined, participant?.token, onMessage, onClose, onOpen);

  async function vote(card: MovieNightCard, value: MovieNightVote) {
    if (!participant) return;
    setVotes((v) => ({ ...v, [card.id]: value }));
    setHistory((h) => [...h, { id: card.id, vote: value }]);
    setIndex((i) => i + 1);
    try { await api.movieNight.vote(code, participant.token, card.id, value); }
    catch { void sync(code, participant).catch(() => undefined); }
  }
  async function undo() {
    const last = history.length > 0 ? history[history.length - 1] : undefined;
    if (!last || !participant) return;
    setHistory((h) => h.slice(0, -1));
    setVotes((v) => { const next = { ...v }; delete next[last.id]; return next; });
    setIndex((i) => Math.max(0, i - 1));
    try { await api.movieNight.undo(code, participant.token, last.id); }
    catch { void sync(code, participant).catch(() => undefined); }
  }
  async function leave() {
    if (participant) { try { await api.movieNight.leave(code, participant.participantId, participant.token); } catch { /* ignore */ } }
    clearParticipant(code); setParticipant(undefined); setPhase('entry'); setState(undefined);
  }

  const others = state?.participants.filter((p) => p.id !== participant?.participantId) ?? [];
  const lastUndoneVote = history.length > 0 ? history[history.length - 1].vote : undefined;

  return <main className="flex min-h-[100dvh] flex-col bg-[#0B0B0F] px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-white">
    {phase === 'entry' && <form onSubmit={join} className="m-auto flex w-full max-w-sm flex-col gap-4">
      <img src="/logo.svg" alt="" className="mx-auto h-12 w-12" />
      <h1 className="text-center text-3xl font-bold">Movie night</h1>
      <p className="text-center text-white/70">Pick a name and start swiping. Everyone sees the same deck.</p>
      {!codeFromScan && <label className="space-y-1 text-sm"><span>Code from the TV</span><Input aria-label="Code from the TV" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" autoCapitalize="characters" /></label>}
      <label className="space-y-1 text-sm"><span>Your name</span><Input aria-label="Your name" value={nickname} maxLength={24} onChange={(e) => setNickname(e.target.value)} autoFocus /></label>
      {message && <p role="alert" className="text-sm text-rose-400">{message}</p>}
      <Button type="submit" size="lg" disabled={!code.trim() || !nickname.trim()}>Join</Button>
    </form>}

    {phase === 'joining' && <p role="status" className="m-auto text-white/70">Joining…</p>}

    {phase === 'waiting' && <div className="m-auto flex w-full max-w-sm flex-col items-center gap-4 text-center">
      <p className="text-2xl font-bold">Waiting for the host…</p>
      <p className="text-white/70">{state?.deckSize ?? 0} movies in the deck.</p>
      {others.length > 0 && <p className="text-sm text-white/60">Also here: {others.map((p) => p.nickname).join(', ')}</p>}
      <Button variant="ghost" onClick={() => void leave()}>Leave</Button>
    </div>}

    {phase === 'swiping' && <div className="flex flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between text-sm text-white/60">
        <span>{Object.keys(votes).length} / {cards.length}</span>
        <button type="button" onClick={() => void leave()} className="underline-offset-2 hover:underline">Leave</button>
      </div>
      <div className="flex-1"><SwipeDeck cards={cards} index={index} onVote={(card, value) => void vote(card, value)} onUndo={() => void undo()} canUndo={history.length > 0} lastUndoneVote={lastUndoneVote} /></div>
    </div>}

    {phase === 'ended' && <div className="m-auto text-center">
      <p className="text-2xl font-bold">Night over</p>
      <p className="mt-2 text-white/70">Thanks for swiping.</p>
    </div>}

    {activeMatch && phase !== 'ended' && <MatchOverlay card={activeMatch} open subtitle="Look at the TV" />}
  </main>;
}
