import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { api, type DeviceSession } from '@/lib/api';

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  return date.toLocaleDateString();
}

/** Signed-in devices for the current account, with revoke. */
export function DeviceList() {
  const [sessions, setSessions] = useState<DeviceSession[]>();
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try { setSessions((await api.sessions()).sessions); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load your devices.'); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  async function revoke(session: DeviceSession) {
    setBusyId(session.id);
    try { await api.revokeSession(session.id); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not sign that device out.'); }
    finally { setBusyId(undefined); }
  }

  return <div>
    {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
    {!sessions ? <p role="status" className="text-sm text-muted-foreground">Loading devices…</p> : (
      <ul className="space-y-2">
        {sessions.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0">
              <p className="font-medium">
                {session.deviceName ?? 'Unknown device'}
                {session.current && <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">This device</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {session.createdVia === 'device' ? 'Paired with a code' : 'Signed in with a password'} · last used {formatWhen(session.lastSeenAt)}
              </p>
            </div>
            {!session.current && (
              <Button size="sm" variant="outline" disabled={busyId === session.id} onClick={() => void revoke(session)}>
                {busyId === session.id ? 'Signing out…' : 'Sign out'}
              </Button>
            )}
          </li>
        ))}
      </ul>
    )}
    <div className="mt-4 flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm"><Link to="/link">Authorize a device</Link></Button>
    </div>
  </div>;
}
