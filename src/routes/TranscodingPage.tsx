import { useCallback, useEffect, useState } from 'react';
import { Cpu, MonitorCog, RefreshCw, SlidersHorizontal, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api, ENCODER_PRESETS, type HardwareReport, type TranscodingSettings } from '@/lib/api';
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

  const [settings, setSettings] = useState<TranscodingSettings>();
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<string>();
  useEffect(() => {
    queueMicrotask(() => { void api.transcodingSettings().then((result) => setSettings(result.settings)).catch(() => setSettingsNotice('Could not load encoder settings.')); });
  }, []);
  const change = (patch: Partial<TranscodingSettings>) => setSettings((current) => current ? { ...current, ...patch } : current);
  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true); setSettingsNotice(undefined);
    try { setSettings((await api.updateTranscodingSettings(settings)).settings); setSettingsNotice('Encoder settings saved'); }
    catch (caught) { setSettingsNotice(caught instanceof Error ? caught.message : 'Could not save encoder settings.'); }
    finally { setSavingSettings(false); }
  };

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

      <Card>
        <CardHeader>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><SlidersHorizontal className="h-5 w-5" /></div>
          <CardTitle>Encoder settings</CardTitle>
          <CardDescription>Trade encoding speed for picture quality. Changes apply to the next stream that starts.</CardDescription>
        </CardHeader>
        <CardContent>
          {!settings ? <p role="status" className="py-4 text-center text-muted-foreground">{settingsNotice ?? 'Loading…'}</p> : (
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="encoder-preset" className="text-sm font-medium">Speed preset</label>
                  <select id="encoder-preset" value={settings.preset} onChange={(event) => change({ preset: event.target.value as TranscodingSettings['preset'] })} disabled={savingSettings} className="h-10 rounded-md border border-input bg-background px-3">
                    {ENCODER_PRESETS.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground">Slower presets squeeze more quality into the same bitrate but need a faster machine to keep up.</span>
                </div>
                <Input type="number" label="Quality" min={14} max={30} step={1} value={settings.quality} onChange={(event) => change({ quality: Number(event.target.value) })} disabled={savingSettings} />
                <Input type="number" label="Threads" min={0} max={64} step={1} value={settings.threads} onChange={(event) => change({ threads: Number(event.target.value) })} disabled={savingSettings} />
                <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div>
                    <p id="prefer-hevc-label" className="text-sm font-medium">Prefer HEVC output</p>
                    <p className="text-xs text-muted-foreground">Smaller streams for players that decode it; slower to encode.</p>
                  </div>
                  <Switch aria-label="Prefer HEVC output" aria-describedby="prefer-hevc-label" checked={settings.preferHevcOutput} onCheckedChange={(checked) => change({ preferHevcOutput: checked })} disabled={savingSettings} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Quality is a CRF value: lower is better and larger. 18 is near-transparent, 28 is small. Threads 0 lets ffmpeg decide.</p>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={savingSettings}>Save encoder settings</Button>
                {settingsNotice && <span role="status" className="text-sm text-muted-foreground">{settingsNotice}</span>}
              </div>
            </form>
          )}
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
