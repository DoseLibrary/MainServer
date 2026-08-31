import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '@/components/media/Navbar';
import { UserMenu } from '@/components/media/UserMenu';
import { Button } from '@/components/ui/button';
import { api, imageVariant, type HistoryEntry } from '@/lib/api';

function watchedWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) return `Today at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (days === 1) return `Yesterday at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
}

/** Everything this account has played, newest first. */
export function History() {
  const [history, setHistory] = useState<HistoryEntry[]>();
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [confirmingClear, setConfirmingClear] = useState(false);

  const load = useCallback(async () => {
    setError(undefined);
    try { setHistory((await api.history()).history); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load your history.'); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  async function forget(entry?: HistoryEntry) {
    setBusyId(entry?.id ?? 'all');
    try { await api.forgetHistory(entry?.item.id); setConfirmingClear(false); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update your history.'); }
    finally { setBusyId(undefined); }
  }

  return <div className="min-h-screen bg-background text-foreground">
    <Navbar brandLabel="DOSE" brand="DOSE" brandImage={{ src: '/logo.svg', alt: '' }} brandHref="/" items={[{ id: 'library', label: 'Library', href: '/' }]} actions={<UserMenu />} />
    <main className="mx-auto min-h-0 w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Watch history</h1>
          <p className="mt-1 text-muted-foreground">What you have played, most recent first. Only you can see this.</p>
        </div>
        <div className="flex gap-2">
          {history && history.length > 0 && (confirmingClear
            ? <>
              <Button variant="destructive" size="sm" disabled={busyId === 'all'} onClick={() => void forget()}>Clear everything</Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmingClear(false)}>Keep it</Button>
            </>
            : <Button variant="outline" size="sm" onClick={() => setConfirmingClear(true)}>Clear history</Button>)}
          <Button asChild variant="outline" size="sm"><Link to="/profile">Back</Link></Button>
        </div>
      </div>

      {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {!history ? <p role="status" className="py-8 text-center text-muted-foreground">Loading history…</p>
        : history.length === 0 ? <p className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">Nothing watched yet.</p> : (
          <ul className="space-y-2">
            {history.map((entry) => {
              const episode = [entry.item.seasonNumber != null ? `S${entry.item.seasonNumber}` : undefined,
                entry.item.episodeNumber != null ? `E${entry.item.episodeNumber}` : undefined].filter(Boolean).join('');
              const percent = entry.durationSeconds ? Math.min(100, Math.round((entry.positionSeconds / entry.durationSeconds) * 100)) : undefined;
              return (
                <li key={entry.id} className="flex items-center gap-4 rounded-lg border p-3">
                  <Link to={`/media/${encodeURIComponent(entry.item.id)}`} className="h-20 w-14 shrink-0 overflow-hidden rounded bg-muted">
                    {entry.item.posterUrl && <img src={imageVariant(entry.item.posterUrl, { width: 112, height: 160, fit: 'cover', format: 'webp' })} alt="" className="h-full w-full object-cover" />}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/media/${encodeURIComponent(entry.item.id)}`} className="truncate font-medium hover:underline">{entry.item.title}</Link>
                      {episode && <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">{episode}</span>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {watchedWhen(entry.watchedAt)}
                      {entry.deviceName && <> · {entry.deviceName}</>}
                      {percent != null && <> · {percent === 100 ? 'Finished' : `${percent}% in`}</>}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" disabled={busyId === entry.id} onClick={() => void forget(entry)}>Remove</Button>
                </li>
              );
            })}
          </ul>
        )}
    </main>
  </div>;
}
