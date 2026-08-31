import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { api, ApiError, type DevicePairing } from '@/lib/api';

type Phase = 'starting' | 'waiting' | 'approved' | 'denied' | 'expired' | 'error';

/**
 * Device side of QR pairing, for a TV or any screen without a keyboard: show a
 * code, poll until the owner approves it on a signed-in phone, then reload as
 * the signed-in device.
 */
export function PairDevice() {
  const [pairing, setPairing] = useState<DevicePairing>();
  const [qr, setQr] = useState<string>();
  const [phase, setPhase] = useState<Phase>('starting');
  const [message, setMessage] = useState<string>();
  const [secondsLeft, setSecondsLeft] = useState<number>();
  const cancelled = useRef(false);

  const start = useCallback(async () => {
    setPhase('starting'); setMessage(undefined); setQr(undefined);
    try {
      const next = await api.startDevicePairing();
      setPairing(next); setPhase('waiting');
      const url = new URL(next.verificationPathComplete, window.location.origin).href;
      // The QR is generated locally; pairing never depends on an outside service.
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#0B0B0F', light: '#F2EFE6' } }));
    } catch (caught) {
      setPhase('error');
      setMessage(caught instanceof Error ? caught.message : 'Could not start pairing.');
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void start(); }); }, [start]);

  // Poll on the interval the server hands out, and stop as soon as it resolves.
  useEffect(() => {
    if (phase !== 'waiting' || !pairing) return;
    cancelled.current = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled.current) return;
      try {
        const result = await api.pollDevicePairing(pairing.deviceCode);
        if (cancelled.current) return;
        if (result.status === 'approved') { setPhase('approved'); window.location.assign('/'); return; }
        if (result.status === 'denied') { setPhase('denied'); return; }
      } catch (caught) {
        if (cancelled.current) return;
        // 410 means the code aged out; anything else is worth retrying quietly.
        if (caught instanceof ApiError && caught.status === 410) { setPhase('expired'); return; }
      }
      timer = setTimeout(() => void tick(), pairing.intervalMs);
    };
    timer = setTimeout(() => void tick(), pairing.intervalMs);
    return () => { cancelled.current = true; clearTimeout(timer); };
  }, [phase, pairing]);

  // Countdown so the screen shows how long the code stays good.
  useEffect(() => {
    if (!pairing || phase !== 'waiting') return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.round((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) setPhase('expired');
    }, 1000);
    return () => clearInterval(timer);
  }, [pairing, phase]);

  const minutes = secondsLeft != null ? Math.floor(secondsLeft / 60) : 0;
  const seconds = secondsLeft != null ? String(secondsLeft % 60).padStart(2, '0') : '00';

  return <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 py-12 text-foreground">
    <div className="text-center">
      <img src="/logo.svg" alt="" className="mx-auto mb-4 h-12 w-12" />
      <h1 className="text-3xl font-bold tracking-tight">Sign in from your phone</h1>
      <p className="mt-2 max-w-md text-muted-foreground">Scan this code with the phone that is already signed in to Dose, or open the link below and enter the code.</p>
    </div>

    {phase === 'starting' && <p role="status" className="text-muted-foreground">Preparing a code…</p>}

    {phase === 'waiting' && pairing && <>
      <div className="rounded-2xl border bg-[#F2EFE6] p-4">
        {qr ? <img src={qr} alt={`QR code linking to ${pairing.verificationPathComplete}`} className="h-64 w-64" />
          : <div className="flex h-64 w-64 items-center justify-center text-sm text-[#0B0B0F]/60">Generating…</div>}
      </div>
      <div className="text-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Enter this code</p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em]">{pairing.userCode}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          at <span className="font-medium text-foreground">{window.location.host}{pairing.verificationPath}</span>
          {secondsLeft != null && <> · expires in {minutes}:{seconds}</>}
        </p>
      </div>
    </>}

    {phase === 'approved' && <p role="status" className="text-lg font-medium">Approved. Signing in…</p>}

    {(phase === 'denied' || phase === 'expired' || phase === 'error') && <div className="flex flex-col items-center gap-4 text-center">
      <p role="alert" className="text-lg font-medium">
        {phase === 'denied' ? 'That request was declined.' : phase === 'expired' ? 'This code expired.' : message}
      </p>
      <Button onClick={() => void start()}>Get a new code</Button>
    </div>}

    <Button asChild variant="ghost"><Link to="/">Sign in with a password instead</Link></Button>
  </main>;
}
