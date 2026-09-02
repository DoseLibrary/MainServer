import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MatchOverlay } from '@/components/movie-night/MatchOverlay';
import { MovieCardFace } from '@/components/movie-night/MovieCardFace';
import { api, ApiError, type CatalogCategorySummary, type MovieNightFilters, type MovieNightLeader, type MovieNightMessage, type MovieNightState } from '@/lib/api';
import { useMovieNightSocket } from '@/lib/movie-night';

const HOST_KEY = 'dose.movieNight.host';
type Screen = 'loading' | 'setup' | 'session' | 'ended';

/** The TV: filters → lobby with QR → live board → match or ranked fallback. */
export function MovieNightTv() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [genres, setGenres] = useState<CatalogCategorySummary[]>([]);
  const [filters, setFilters] = useState<MovieNightFilters>({});
  const [count, setCount] = useState<number>();
  const [countError, setCountError] = useState(false);
  const [countRetry, setCountRetry] = useState(0);
  const [error, setError] = useState<string>();
  const [code, setCode] = useState<string>();
  const [state, setState] = useState<MovieNightState>();
  const [qr, setQr] = useState<string>();
  const [progress, setProgress] = useState<Record<string, { done: number; total: number }>>({});
  const [leaders, setLeaders] = useState<MovieNightLeader[]>([]);
  const [busy, setBusy] = useState(false);

  const activeMatch = useMemo(() => {
    if (!state) return undefined;
    const open = state.matches.filter((card) => !state.dismissed.includes(card.id));
    return open.length > 0 ? open[open.length - 1] : undefined;
  }, [state]);
  const showFallback = !!state && state.phase === 'swiping' && state.allDone && !activeMatch;

  const syncRequestRef = useRef(0);
  const sync = useCallback(async (session: string) => {
    const requestId = ++syncRequestRef.current;
    const { state: next } = await api.movieNight.state(session);
    if (syncRequestRef.current !== requestId) return;
    setState(next); setCode(session); setScreen('session');
    if (next.phase === 'swiping') {
      try {
        const { entries } = await api.movieNight.leaders(session);
        if (syncRequestRef.current === requestId) setLeaders(entries);
      } catch { /* not fatal */ }
    }
  }, []);

  // Signed-in check, then rejoin a stored session or show the setup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await api.me(); } catch { window.location.assign('/'); return; }
      const stored = sessionStorage.getItem(HOST_KEY);
      if (stored) {
        try { await sync(stored); return; }
        catch { sessionStorage.removeItem(HOST_KEY); }
      }
      if (!cancelled) setScreen('setup');
    })();
    return () => { cancelled = true; };
  }, [sync]);

  useEffect(() => {
    if (screen !== 'setup') return;
    void api.catalogCategories().then(({ categories }) => setGenres(categories)).catch(() => setGenres([]));
  }, [screen]);

  // Live count as the filters change (or a Retry is clicked after a failure).
  const countRequestRef = useRef(0);
  useEffect(() => {
    if (screen !== 'setup') return;
    const requestId = ++countRequestRef.current;
    void api.movieNight.count(filters)
      .then(({ count: n }) => { if (countRequestRef.current === requestId) { setCount(n); setCountError(false); } })
      .catch(() => { if (countRequestRef.current === requestId) { setCount(undefined); setCountError(true); } });
  }, [filters, screen, countRetry]);

  // QR for the lobby, generated locally.
  useEffect(() => {
    if (!code || state?.phase !== 'lobby') return;
    let cancelled = false;
    const url = new URL(`/movie-night/join?code=${code}`, window.location.origin).href;
    void QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0B0B0F', light: '#F2EFE6' } })
      .then((data) => { if (!cancelled) setQr(data); })
      .catch(() => { if (!cancelled) setQr(undefined); });
    return () => { cancelled = true; setQr(undefined); };
  }, [code, state?.phase]);

  const allDoneRequestRef = useRef(0);
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
    if (incoming.type === 'progress') setProgress((p) => ({ ...p, [incoming.participantId]: { done: incoming.done, total: incoming.total } }));
    if (incoming.type === 'leaders') setLeaders(incoming.entries);
    if (incoming.type === 'participant.left') setProgress((p) => { const next = { ...p }; delete next[incoming.participantId]; return next; });
    // allDone is server-derived; refetch it whenever votes or the roster move. A slower,
    // earlier request must not clobber a newer response, so only the latest one applies.
    if ((incoming.type === 'progress' || incoming.type === 'participant.left' || incoming.type === 'match.dismissed') && code) {
      const requestId = ++allDoneRequestRef.current;
      void api.movieNight.state(code)
        .then(({ state: next }) => { if (allDoneRequestRef.current === requestId) setState((cur) => cur ? { ...cur, allDone: next.allDone } : cur); })
        .catch(() => undefined);
    }
    if (incoming.type === 'ended') { sessionStorage.removeItem(HOST_KEY); setScreen('ended'); }
  }, [code]);
  const onClose = useCallback(() => { sessionStorage.removeItem(HOST_KEY); setScreen('ended'); }, []);
  const onOpen = useCallback(() => { if (code) void sync(code).catch(() => undefined); }, [code, sync]);
  useMovieNightSocket(screen === 'session' ? code : undefined, undefined, onMessage, onClose, onOpen);

  async function create() {
    setBusy(true); setError(undefined);
    try {
      const created = await api.movieNight.create(filters);
      sessionStorage.setItem(HOST_KEY, created.code);
      await sync(created.code);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not create the movie night.'); }
    finally { setBusy(false); }
  }
  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }
  async function dismissMatch(session: string, cardId: string) {
    setBusy(true); setError(undefined);
    try {
      await api.movieNight.dismiss(session, cardId);
      setState((current) => current ? { ...current, dismissed: [...current.dismissed, cardId] } : current);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }
  const number = (value: string) => value === '' ? undefined : Number(value);

  if (screen === 'loading') return <main className="flex min-h-screen items-center justify-center bg-background text-muted-foreground"><p role="status">Loading…</p></main>;

  if (screen === 'ended') return <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background text-foreground">
    <h1 className="text-4xl font-bold">Night ended</h1>
    <Button onClick={() => { setState(undefined); setCode(undefined); setLeaders([]); setProgress({}); setError(undefined); setCount(undefined); setScreen('setup'); }}>Start another</Button>
    <Button asChild variant="ghost"><Link to="/">Back to the library</Link></Button>
  </main>;

  if (screen === 'setup') return <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 bg-background px-6 py-12 text-foreground">
    <div className="text-center">
      <h1 className="text-4xl font-bold tracking-tight">Movie night</h1>
      <p className="mt-2 text-muted-foreground">Everyone swipes the same deck on their phone. The first film all of you say yes to wins.</p>
    </div>
    <div className="grid grid-cols-2 gap-4 rounded-2xl border p-6">
      <label className="col-span-2 space-y-1 text-sm"><span>Genre</span><select aria-label="Genre" className="h-11 w-full rounded-md border bg-background px-3" value={filters.genre ?? ''} onChange={(e) => setFilters((old) => ({ ...old, genre: e.target.value || undefined }))}><option value="">Any</option>{genres.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span>From year</span><Input aria-label="From year" type="number" min={1888} max={2200} value={filters.yearMin ?? ''} onChange={(e) => setFilters((old) => ({ ...old, yearMin: number(e.target.value) }))} /></label>
      <label className="space-y-1 text-sm"><span>To year</span><Input aria-label="To year" type="number" min={1888} max={2200} value={filters.yearMax ?? ''} onChange={(e) => setFilters((old) => ({ ...old, yearMax: number(e.target.value) }))} /></label>
      <label className="space-y-1 text-sm"><span>Minimum rating</span><Input aria-label="Minimum rating" type="number" min={0} max={10} step={0.1} value={filters.ratingMin ?? ''} onChange={(e) => setFilters((old) => ({ ...old, ratingMin: number(e.target.value) }))} /></label>
      <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" aria-label="Unwatched only" checked={!!filters.unwatchedOnly} onChange={(e) => setFilters((old) => ({ ...old, unwatchedOnly: e.target.checked || undefined }))} className="h-5 w-5" /><span>Unwatched only</span></label>
    </div>
    {countError ? <div className="flex flex-col items-center gap-2">
      <p role="alert" className="text-center text-lg text-destructive">Could not count the deck</p>
      <Button variant="outline" onClick={() => setCountRetry((n) => n + 1)}>Retry</Button>
    </div> : <p role="status" className="text-center text-lg">{count == null ? 'Counting…' : `${count} movies in the deck`}</p>}
    {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
    <Button size="lg" className="mx-auto" disabled={busy || !count || countError} onClick={() => void create()}>Create movie night</Button>
    <Button asChild variant="ghost" className="mx-auto"><Link to="/">Cancel</Link></Button>
  </main>;

  // screen === 'session'
  const participants = state?.participants ?? [];
  return <main className="min-h-screen bg-background px-8 py-10 text-foreground">
    {state?.phase === 'lobby' && code && <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-3xl border bg-[#F2EFE6] p-4">
          {qr ? <img src={qr} alt={`QR code linking to /movie-night/join?code=${code}`} className="h-72 w-72" /> : <div className="flex h-72 w-72 items-center justify-center text-sm text-[#0B0B0F]/60">Generating…</div>}
        </div>
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Or enter this code</p>
        <p className="font-mono text-5xl font-bold tracking-[0.2em]">{code}</p>
        <p className="text-sm text-muted-foreground">at {window.location.host}/movie-night/join</p>
      </div>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-4xl font-bold">Scan to join</h1>
          <p className="mt-2 text-muted-foreground">{state.deckSize} movies in the deck. Start once everyone is in.</p>
        </div>
        <ul className="flex flex-wrap gap-3" aria-label="Participants">
          {participants.map((p) => <li key={p.id} className="flex items-center gap-2 rounded-full border bg-muted px-4 py-2 text-lg motion-safe:animate-[zoomIn_300ms_ease-out]">
            <span>{p.nickname}</span>
            <button type="button" aria-label={`Remove ${p.nickname}`} onClick={() => void act(() => api.movieNight.leave(code, p.id))} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" aria-hidden="true" /></button>
          </li>)}
          {participants.length === 0 && <li className="text-muted-foreground">Nobody yet…</li>}
        </ul>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-3">
          <Button size="lg" disabled={busy || participants.length < 2} onClick={() => void act(() => api.movieNight.start(code))}>Start swiping</Button>
          <Button size="lg" variant="ghost" onClick={() => void act(() => api.movieNight.end(code))}>Cancel</Button>
        </div>
      </div>
    </div>}

    {state?.phase === 'swiping' && code && <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(16rem,1fr)_2fr]">
      <section>
        <h1 className="text-3xl font-bold">Swiping…</h1>
        <ul className="mt-6 space-y-4" aria-label="Progress">
          {participants.map((p) => {
            const done = progress[p.id]?.done ?? 0; const total = progress[p.id]?.total ?? state.deckSize;
            return <li key={p.id}>
              <div className="flex justify-between text-lg"><span>{p.nickname}</span><span className="tabular-nums text-muted-foreground">{`${done} / ${total}`}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-foreground transition-[width] duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
            </li>;
          })}
        </ul>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <Button variant="ghost" className="mt-8" onClick={() => void act(() => api.movieNight.end(code))}>End night</Button>
      </section>
      <section>
        <h2 className="text-xl font-semibold text-muted-foreground">{showFallback ? 'No unanimous pick — the crowd favourites' : 'Leading so far'}</h2>
        {showFallback && <p className="mt-1 text-sm text-muted-foreground">Everyone finished the deck. Tap a title to play it.</p>}
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {leaders.map(({ card, yes, maybe }) => <li key={card.id} className="aspect-[2/3]">
            {showFallback
              ? <Link to={`/watch/${encodeURIComponent(card.id)}`} aria-label={`${card.title}: ${yes} yes, ${maybe} maybe`} className="block h-full rounded-3xl ring-offset-background transition hover:ring-4 hover:ring-foreground"><MovieCardFace card={card} /></Link>
              : <div className="relative h-full"><MovieCardFace card={card} /><span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2 py-0.5 text-sm font-bold text-black">{yes} yes</span></div>}
          </li>)}
          {leaders.length === 0 && <li className="col-span-full text-muted-foreground">No votes yet.</li>}
        </ul>
      </section>
    </div>}

    {activeMatch && code && <MatchOverlay card={activeMatch} open subtitle="Everyone said yes" actions={<>
      <Button asChild size="lg"><Link to={`/watch/${encodeURIComponent(activeMatch.id)}`}>Play now</Link></Button>
      <Button size="lg" variant="secondary" disabled={busy} onClick={() => void dismissMatch(code, activeMatch.id)}>Keep swiping</Button>
      <Button size="lg" variant="ghost" disabled={busy} onClick={() => void act(() => api.movieNight.end(code))}>End night</Button>
    </>} />}
  </main>;
}
