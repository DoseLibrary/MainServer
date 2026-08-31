import { useCallback, useEffect, useState } from 'react';
import { api, imageVariant, type AdminMediaItem, type TmdbTitleCandidate } from '@/lib/api';
import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

interface MediaAdminProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Filter = 'all' | 'archived';

export function MediaAdmin({ open, onOpenChange }: MediaAdminProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AdminMediaItem[]>();
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [matchFor, setMatchFor] = useState<AdminMediaItem>();
  const [confirmRemove, setConfirmRemove] = useState<string>();
  const [busyId, setBusyId] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const result = await api.adminMediaItems({
        archived: filter === 'archived' ? true : undefined,
        sort: filter === 'archived' ? 'archivedAt' : 'title',
        direction: filter === 'archived' ? 'desc' : 'asc',
        q: query,
        limit: 100,
      });
      setItems(result.items); setTotal(result.total);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load titles.'); setItems([]); }
  }, [filter, query]);
  useEffect(() => { if (!open) return; const timer = setTimeout(() => { void load(); }, query ? 250 : 0); return () => clearTimeout(timer); }, [open, load, query]);
  useEffect(() => { if (!open) queueMicrotask(() => { setMatchFor(undefined); setConfirmRemove(undefined); setNotice(undefined); }); }, [open]);

  async function remove(item: AdminMediaItem) {
    setBusyId(item.id); setNotice(undefined);
    try { await api.deleteItem(item.id); setNotice(`Removed “${item.title}”`); setConfirmRemove(undefined); await load(); }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : 'Could not remove this title.'); }
    finally { setBusyId(undefined); }
  }

  async function applyMatch(item: AdminMediaItem, tmdbId: number, label: string) {
    setBusyId(item.id); setNotice(undefined);
    try { await api.matchTmdb(item.id, tmdbId); setNotice(`Re-matched “${item.title}” to ${label}`); setMatchFor(undefined); await load(); }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : 'Could not re-match this title.'); }
    finally { setBusyId(undefined); }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent aria-describedby="media-admin-description" className="max-w-4xl">
        <ModalHeader>
          <ModalTitle className="text-xl font-semibold">Media library</ModalTitle>
          <ModalDescription id="media-admin-description">Review titles, correct a mistaken match, or remove titles. Archived titles have no files on disk and are hidden from members.</ModalDescription>
        </ModalHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Filter titles">
            {(['all', 'archived'] as const).map((value) => (
              <button key={value} type="button" aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${filter === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {value === 'all' ? 'All' : 'Archived'}
              </button>
            ))}
          </div>
          <Input aria-label="Search titles" placeholder="Search titles…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 max-w-xs flex-1" />
          <span className="ml-auto text-sm text-muted-foreground">{total} {total === 1 ? 'title' : 'titles'}</span>
        </div>

        {notice && <div role="status" className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">{notice}</div>}
        {error && <div role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

        <ul className="mt-3 max-h-[55vh] list-none space-y-2 overflow-y-auto p-0">
          {!items ? <li className="py-10 text-center text-muted-foreground"><Spinner label="Loading" className="mx-auto h-5 w-5" /></li>
            : items.length === 0 ? <li className="py-10 text-center text-muted-foreground">No titles match.</li>
            : items.map((item) => (
              <li key={item.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-muted">
                    {item.posterUrl && <img src={imageVariant(item.posterUrl, { width: 88, height: 128, fit: 'cover', format: 'webp' })} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{item.title}</span>
                      {item.archived && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">Archived</span>}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{[item.year, item.kind === 'series' ? 'Show' : 'Movie', item.library].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" disabled={busyId === item.id} onClick={() => { setConfirmRemove(undefined); setMatchFor(matchFor?.id === item.id ? undefined : item); }}>Re-match</Button>
                    {confirmRemove === item.id ? (
                      <Button variant="destructive" size="sm" disabled={busyId === item.id} onClick={() => void remove(item)}>Confirm</Button>
                    ) : (
                      <Button variant="ghost" size="sm" disabled={busyId === item.id} onClick={() => { setMatchFor(undefined); setConfirmRemove(item.id); }}>Remove</Button>
                    )}
                  </div>
                </div>
                {matchFor?.id === item.id && <RematchPanel item={item} busy={busyId === item.id} onApply={applyMatch} />}
              </li>
            ))}
        </ul>
      </ModalContent>
    </Modal>
  );
}

function RematchPanel({ item, busy, onApply }: { item: AdminMediaItem; busy: boolean; onApply: (item: AdminMediaItem, tmdbId: number, label: string) => void }) {
  const [term, setTerm] = useState(item.title);
  const [candidates, setCandidates] = useState<TmdbTitleCandidate[]>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();

  const search = useCallback(async () => {
    if (!term.trim()) return;
    setSearching(true); setError(undefined);
    try { setCandidates((await api.searchTmdb(item.kind === 'series' ? 'series' : 'movie', term.trim())).results); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'TMDB search failed.'); }
    finally { setSearching(false); }
  }, [term, item.kind]);
  useEffect(() => { queueMicrotask(() => { void search(); }); }, [search]);

  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-3">
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <Input aria-label="TMDB search" value={term} onChange={(event) => setTerm(event.target.value)} className="h-9" />
        <Button type="submit" size="sm" variant="outline" disabled={searching}>{searching ? 'Searching…' : 'Search'}</Button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      <ul className="mt-2 max-h-56 list-none space-y-1 overflow-y-auto p-0">
        {candidates?.length === 0 && <li className="py-3 text-center text-sm text-muted-foreground">No TMDB matches.</li>}
        {candidates?.map((candidate) => (
          <li key={candidate.id} className="flex items-center gap-3 rounded border bg-background p-2">
            <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
              {candidate.posterPath && <img src={`https://image.tmdb.org/t/p/w92${candidate.posterPath}`} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{candidate.title}{candidate.year ? ` (${candidate.year})` : ''}</p>
              {candidate.overview && <p className="line-clamp-2 text-xs text-muted-foreground">{candidate.overview}</p>}
            </div>
            <Button size="sm" disabled={busy} onClick={() => onApply(item, candidate.id, `${candidate.title}${candidate.year ? ` (${candidate.year})` : ''}`)}>Use this</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
