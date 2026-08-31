import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/media/Navbar';
import { UserMenu } from '@/components/media/UserMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError, type DeviceAuthRequest } from '@/lib/api';

type Phase = 'entry' | 'confirm' | 'approved' | 'denied' | 'error';

/**
 * Phone side of QR pairing. Reached by scanning the code on a TV (the code
 * arrives in the query string) or by typing the code by hand.
 */
export function LinkDevice() {
  const [search] = useSearchParams();
  const codeFromScan = search.get('code') ?? '';
  const [code, setCode] = useState(codeFromScan);
  const [pending, setPending] = useState<DeviceAuthRequest>();
  const [phase, setPhase] = useState<Phase>('entry');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const lookup = useCallback(async (value: string) => {
    setBusy(true); setMessage(undefined);
    try {
      const { request } = await api.deviceRequest(value);
      setPending(request); setPhase('confirm');
    } catch (caught) {
      setPhase('error');
      setMessage(caught instanceof ApiError && caught.status === 410 ? 'That code expired. Ask the device for a new one.'
        : caught instanceof ApiError && caught.status === 409 ? 'That code was already used.'
          : caught instanceof ApiError && caught.status === 404 ? 'No device is waiting for that code.'
            : caught instanceof Error ? caught.message : 'Could not look up that code.');
    } finally { setBusy(false); }
  }, []);

  // A scanned link carries the code, so skip straight to the confirmation.
  useEffect(() => { if (codeFromScan) queueMicrotask(() => { void lookup(codeFromScan); }); }, [codeFromScan, lookup]);

  async function decide(decision: 'approve' | 'deny') {
    setBusy(true); setMessage(undefined);
    try {
      if (decision === 'approve') await api.approveDevice(code);
      else await api.denyDevice(code);
      setPhase(decision === 'approve' ? 'approved' : 'denied');
    } catch (caught) {
      setPhase('error');
      setMessage(caught instanceof Error ? caught.message : 'Could not answer that request.');
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.trim()) void lookup(code.trim());
  }

  return <div className="min-h-screen bg-background text-foreground">
    <Navbar brandLabel="DOSE" brand="DOSE" brandImage={{ src: '/logo.svg', alt: '' }} brandHref="/" items={[{ id: 'library', label: 'Library', href: '/' }]} actions={<UserMenu />} />
    <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Authorize a device</h1>
      <p className="mt-2 text-muted-foreground">Approving signs that device in to your account. Only approve a code you can see on your own screen.</p>

      {phase === 'entry' && <form className="mt-8 space-y-4" onSubmit={submit}>
        <Input label="Code from the device" value={code} onChange={(event) => setCode(event.target.value)}
          placeholder="K7QP-2M4X" autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono text-lg tracking-[0.2em]" />
        <Button type="submit" disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Continue'}</Button>
      </form>}

      {phase === 'confirm' && pending && <div className="mt-8 rounded-lg border p-5">
        <p className="text-sm text-muted-foreground">Device asking to sign in</p>
        <p className="mt-1 text-xl font-semibold">{pending.deviceName}</p>
        <p className="mt-1 font-mono text-sm text-muted-foreground">{code.toUpperCase()}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => void decide('approve')} disabled={busy}>Approve</Button>
          <Button variant="outline" onClick={() => void decide('deny')} disabled={busy}>Not me</Button>
        </div>
      </div>}

      {phase === 'approved' && <div className="mt-8 space-y-4">
        <p role="status" className="text-lg font-medium">Signed in on {pending?.deviceName ?? 'that device'}.</p>
        <p className="text-sm text-muted-foreground">You can revoke it any time from Profile → Devices.</p>
        <Button asChild><Link to="/profile">Back to profile</Link></Button>
      </div>}

      {phase === 'denied' && <div className="mt-8 space-y-4">
        <p role="status" className="text-lg font-medium">Request declined.</p>
        <Button asChild variant="outline"><Link to="/">Back to library</Link></Button>
      </div>}

      {phase === 'error' && <div className="mt-8 space-y-4">
        <p role="alert" className="text-lg font-medium">{message}</p>
        <Button variant="outline" onClick={() => { setPhase('entry'); setCode(''); setMessage(undefined); }}>Try another code</Button>
      </div>}
    </main>
  </div>;
}
