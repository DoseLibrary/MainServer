import { useCallback, useEffect, useState } from 'react';
import { api, imageVariant, type ActivitySession } from '@/lib/api';
import { AdminShell } from './AdminShell';

const REFRESH_MS = 5_000;

function clock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(rest).padStart(2, '0')}`;
}

const METHOD_LABEL: Record<ActivitySession['playMethod'], string> = {
  direct: 'Direct play',
  remux: 'Remux',
  transcode: 'Transcode',
};

/** What the server is streaming right now. Polls while the page is open. */
export function ActivityPage() {
  const [sessions, setSessions] = useState<ActivitySession[]>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try { setSessions((await api.activity()).sessions); setError(undefined); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load activity.'); }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void load(); });
    const timer = setInterval(() => { void load(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return <AdminShell title="Activity" description="Playback happening on this server right now." wide>
    {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

    {!sessions ? <p role="status" className="py-8 text-center text-muted-foreground">Loading activity…</p>
      : sessions.length === 0 ? <p className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">Nothing is playing.</p> : (
        <ul className="space-y-3">
          {sessions.map((session) => {
            const percent = session.durationSeconds ? Math.min(100, Math.round((session.positionSeconds / session.durationSeconds) * 100)) : undefined;
            const episode = [session.item.seasonNumber != null ? `S${session.item.seasonNumber}` : undefined,
              session.item.episodeNumber != null ? `E${session.item.episodeNumber}` : undefined].filter(Boolean).join('');
            return (
              <li key={session.id} className="flex gap-4 rounded-lg border p-4">
                <div className="h-24 w-16 shrink-0 overflow-hidden rounded bg-muted">
                  {session.item.posterUrl && <img src={imageVariant(session.item.posterUrl, { width: 128, height: 192, fit: 'cover', format: 'webp' })} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{session.item.title}</p>
                    {episode && <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">{episode}</span>}
                    {session.paused && <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-xs font-medium text-amber-600">Paused</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {session.username}
                    {session.deviceName && <> · {session.deviceName}</>}
                    {' · '}{METHOD_LABEL[session.playMethod]}
                  </p>
                  {percent != null && (
                    <div className="mt-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-foreground" style={{ width: `${percent}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {clock(session.positionSeconds)} of {clock(session.durationSeconds ?? 0)} · {percent}%
                      </p>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
  </AdminShell>;
}
