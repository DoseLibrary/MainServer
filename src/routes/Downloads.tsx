import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '@/components/media/Navbar';
import { UserMenu } from '@/components/media/UserMenu';
import { Button } from '@/components/ui/button';
import { downloadQueue, formatBytes, formatExpiry, offlineSource } from '@/lib/downloads';
import { isInstalledApp, storageBudget, supportsDownloads, type StorageBudget } from '@/lib/download-store';
import type { DownloadEntry } from '@/lib/download-queue';

const STATUS_LABEL: Record<DownloadEntry['status'], string> = {
  queued: 'Waiting',
  preparing: 'Preparing on the server',
  downloading: 'Downloading',
  ready: 'Ready to watch',
  paused: 'Paused',
  failed: 'Failed',
};

/**
 * Everything this device is holding.
 *
 * This is the one screen that works with no connection, so it renders entirely
 * from what the device already knows: titles, sizes, and expiry all come from
 * local metadata rather than the server.
 */
export function Downloads() {
  const [entries, setEntries] = useState<DownloadEntry[]>();
  const [budget, setBudget] = useState<StorageBudget>();
  const [notice, setNotice] = useState<string>();
  const installed = isInstalledApp();
  const supported = supportsDownloads();

  useEffect(() => {
    const queue = downloadQueue();
    if (!queue) { queueMicrotask(() => setEntries([])); return; }
    const unsubscribe = queue.subscribe(setEntries);
    void (async () => {
      // Expired copies go before anything is shown, and eviction is reported
      // rather than left looking playable.
      const expired = await queue.pruneExpired();
      const evicted = await queue.reconcile();
      const lines = [
        expired.length > 0 ? `${expired.length} ${expired.length === 1 ? 'download' : 'downloads'} expired` : undefined,
        evicted.length > 0 ? `${evicted.length} removed by the browser to free space` : undefined,
      ].filter(Boolean);
      if (lines.length > 0) setNotice(lines.join(' · '));
      setBudget(await storageBudget());
      void queue.run().catch(() => undefined);
    })();
    return () => { unsubscribe(); queue.stop(); };
  }, []);

  const act = useCallback(async (work: () => Promise<unknown>) => {
    try { await work(); } catch (error) { setNotice(error instanceof Error ? error.message : 'That did not work'); }
  }, []);

  const queue = downloadQueue();
  const ready = (entries ?? []).filter((entry) => entry.status === 'ready');
  const working = (entries ?? []).filter((entry) => entry.status !== 'ready');

  return <div className="min-h-screen bg-background text-foreground">
    <Navbar brandLabel="DOSE" brand="DOSE" brandImage={{ src: '/logo.svg', alt: '' }} brandHref="/" items={[{ id: 'library', label: 'Library', href: '/' }]} actions={<UserMenu />} />
    <main className="mx-auto min-h-0 w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Downloads</h1>
        <p className="mt-1 text-muted-foreground">
          {budget
            ? `${formatBytes(budget.usedBytes)} used · about ${formatBytes(budget.availableBytes)} free on this device`
            : 'Titles kept on this device, playable with no connection.'}
        </p>
      </div>

      {notice && <div role="status" className="mb-4 rounded-md border bg-muted/40 px-3 py-2 text-sm">{notice}</div>}

      {!supported && (
        <p className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
          This browser cannot store downloads. Try Safari on iOS or Chrome on Android.
        </p>
      )}

      {supported && !installed && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="font-medium">Install Dose first</p>
          <p className="mt-1 text-sm text-muted-foreground">
            In a browser tab, the system deletes downloaded files after about a week and offers very little space.
            Add Dose to your Home Screen — Share, then <span className="text-foreground">Add to Home Screen</span> — and open it from there.
          </p>
        </div>
      )}

      {!entries ? <p role="status" className="py-8 text-center text-muted-foreground">Loading downloads…</p>
        : entries.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center">
            <p className="text-muted-foreground">Nothing downloaded yet.</p>
            <Button asChild variant="outline" size="sm" className="mt-4"><Link to="/">Find something to take with you</Link></Button>
          </div>
        ) : (
          <div className="space-y-8">
            {working.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">In progress</h2>
                <ul className="space-y-2">
                  {working.map((entry) => {
                    const total = entry.bytesTotal ?? entry.estimatedBytes;
                    const percent = total > 0 ? Math.min(100, Math.round((entry.bytesDone / total) * 100)) : 0;
                    return (
                      <li key={entry.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{entry.title}</span>
                          <span className="text-xs text-muted-foreground">{STATUS_LABEL[entry.status]}</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-foreground transition-[width] duration-300" style={{ width: `${percent}%` }} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{formatBytes(entry.bytesDone)} of {formatBytes(total)}{entry.error ? ` · ${entry.error}` : ''}</span>
                          <span className="flex gap-2">
                            {entry.status === 'paused' || entry.status === 'failed'
                              ? <Button size="sm" variant="outline" onClick={() => void act(async () => { await queue?.resume(entry.id); await queue?.run(); })}>Resume</Button>
                              : <Button size="sm" variant="outline" onClick={() => void act(() => queue!.pause(entry.id))}>Pause</Button>}
                            <Button size="sm" variant="ghost" onClick={() => void act(() => queue!.remove(entry.id))}>Remove</Button>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {ready.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">On this device</h2>
                <ul className="space-y-2">
                  {ready.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{entry.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(entry.bytesDone)} · {entry.profile === 'hd' ? '720p' : '480p'} · {formatExpiry(entry.expiresAt)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button asChild size="sm"><Link to={`/watch/${encodeURIComponent(entry.mediaItemId)}?offline=${encodeURIComponent(offlineSource(entry))}`}>Play</Link></Button>
                        <Button size="sm" variant="ghost" onClick={() => void act(() => queue!.remove(entry.id))}>Remove</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
    </main>
  </div>;
}
