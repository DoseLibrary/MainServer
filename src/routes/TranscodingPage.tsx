import { useCallback, useEffect, useState } from 'react';
import { Cpu, MonitorCog, RefreshCw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, type HardwareReport } from '@/lib/api';
import { AdminShell } from './AdminShell';

const FAMILY_LABELS: Record<string, string> = {
  nvenc: 'NVIDIA NVENC',
  qsv: 'Intel Quick Sync',
  amf: 'AMD AMF',
  videotoolbox: 'Apple VideoToolbox',
  vaapi: 'VAAPI',
};

/** What this server can offload to a GPU, and what it actually will. */
export function TranscodingPage() {
  const [report, setReport] = useState<HardwareReport>();
  const [error, setError] = useState<string>();
  const [detecting, setDetecting] = useState(false);

  const load = useCallback(async () => {
    setError(undefined);
    try { setReport((await api.transcoding()).hardware); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not read transcoding status.'); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const detect = async () => {
    setDetecting(true); setError(undefined);
    try { setReport((await api.detectTranscoding()).hardware); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Detection failed.'); }
    finally { setDetecting(false); }
  };

  const accelerated = report?.selected != null;

  return <AdminShell title="Transcoding" description="Which encoder handles playback that cannot be played directly." wide>
    {error && <p className="mb-4 rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive">{error}</p>}
    {!report ? <p role="status" className="py-16 text-center text-muted-foreground">Detecting…</p> : <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            {accelerated ? <Zap className="h-5 w-5" /> : <Cpu className="h-5 w-5" />}
          </div>
          <CardTitle>{accelerated ? `${FAMILY_LABELS[report.selected!] ?? report.selected} in use` : 'Software encoding'}</CardTitle>
          <CardDescription>
            {accelerated
              ? 'Transcodes are encoded on the GPU, leaving the processor free.'
              : report.mode === 'off'
                ? 'Hardware transcoding is switched off in this server configuration.'
                : 'No usable GPU encoder was found, so transcodes run on the processor.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.warning && <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">{report.warning}</p>}
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Detail label="Mode" value={report.mode === 'auto' ? 'Automatic' : report.mode === 'off' ? 'Software only' : FAMILY_LABELS[report.mode] ?? report.mode} />
            <Detail label="Graphics" value={report.adapters.length > 0 ? report.adapters.join(', ') : 'Not identified'} />
            <Detail label="Last checked" value={new Date(report.detectedAt).toLocaleString()} />
            <Detail label="Also available" value={report.available.filter((family) => family !== report.selected).map((family) => FAMILY_LABELS[family] ?? family).join(', ') || 'None'} />
          </dl>
          <Button variant="outline" className="w-full" disabled={detecting} onClick={() => void detect()}>
            <RefreshCw className={detecting ? 'animate-spin' : undefined} />
            {detecting ? 'Testing encoders…' : 'Run detection again'}
          </Button>
        </CardContent>
      </Card>

      {report.encoders.length > 0 && <Card>
        <CardHeader>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><MonitorCog className="h-5 w-5" /></div>
          <CardTitle>Encoders tested</CardTitle>
          <CardDescription>Each one encoded a frame for real; a listed encoder that cannot run is not counted.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-none space-y-2 p-0">
            {report.encoders.map((encoder) => (
              <li key={encoder.encoder} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border px-3 py-2">
                <span className="font-mono text-sm">{encoder.encoder}</span>
                <span className={encoder.working ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}>
                  {encoder.working ? 'Working' : encoder.built ? 'Not usable here' : 'Not in this build'}
                </span>
                {!encoder.working && encoder.error && <span className="w-full break-words text-xs text-muted-foreground">{encoder.error}</span>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>}
    </div>}
  </AdminShell>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border px-3 py-2">
    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 break-words">{value}</dd>
  </div>;
}
