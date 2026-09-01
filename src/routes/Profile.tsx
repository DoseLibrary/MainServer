import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { History as HistoryIcon, ListOrdered, ListVideo, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import { Navbar } from '@/components/media/Navbar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, type HistorySourceId, type User, type UserSettings, type WatchDataDocument, type WatchDataImportSummary } from '@/lib/api';
import { UserMenu } from '@/components/media/UserMenu';
import { DeviceList } from './DeviceList';

export function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User>();
  const [error, setError] = useState<string>();
  const [settings, setSettings] = useState<UserSettings>();
  const [settingsError, setSettingsError] = useState<string>();
  const [transfer, setTransfer] = useState<string>();
  const [historySource, setHistorySource] = useState<HistorySourceId>('plex');
  const [historyFields, setHistoryFields] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [{ user: nextUser }, { settings: nextSettings }] = await Promise.all([api.me(), api.getSettings()]);
      setUser(nextUser); setSettings(nextSettings);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this profile.'); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  async function toggleCollectionGaps() {
    if (!settings) return;
    const previous = settings;
    const next = { ...settings, showCollectionGaps: !settings.showCollectionGaps };
    setSettings(next); setSettingsError(undefined);
    try { setSettings((await api.updateSettings({ showCollectionGaps: next.showCollectionGaps })).settings); }
    catch (caught) { setSettings(previous); setSettingsError(caught instanceof Error ? caught.message : 'Could not save settings.'); }
  }
  async function savePlayback(change: Partial<UserSettings>) {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, ...change }); setSettingsError(undefined);
    try { setSettings((await api.updateSettings(change)).settings); }
    catch (caught) { setSettings(previous); setSettingsError(caught instanceof Error ? caught.message : 'Could not save settings.'); }
  }
  async function exportWatchData() {
    setTransfer(undefined); setSettingsError(undefined);
    try {
      const document = await api.exportWatchData();
      // Blob + object URL keeps the download entirely client-side and offline.
      const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }));
      const link = window.document.createElement('a');
      link.href = url; link.download = 'dose-watch-data.json';
      link.click(); URL.revokeObjectURL(url);
      setTransfer(`Exported ${document.progress.length} progress ${document.progress.length === 1 ? 'entry' : 'entries'}.`);
    } catch (caught) { setSettingsError(caught instanceof Error ? caught.message : 'Export failed.'); }
  }
  async function importWatchData(file: File) {
    setTransfer(undefined); setSettingsError(undefined);
    try {
      const parsed = JSON.parse(await file.text()) as WatchDataDocument;
      const { summary }: { summary: WatchDataImportSummary } = await api.importWatchData(parsed);
      setTransfer(`Imported ${summary.written} of ${summary.matched} matched ${summary.matched === 1 ? 'entry' : 'entries'}; ${summary.unmatched.length} not found in this library.`);
    } catch (caught) { setSettingsError(caught instanceof Error ? caught.message : 'Import failed.'); }
  }
  async function importHistory() {
    setTransfer(undefined); setSettingsError(undefined); setImporting(true);
    try {
      const config = historySource === 'plex' ? { baseUrl: historyFields.baseUrl ?? '', token: historyFields.token ?? '' }
        : historySource === 'trakt' ? { clientId: historyFields.clientId ?? '', accessToken: historyFields.accessToken ?? '' }
          : { baseUrl: historyFields.baseUrl ?? '', apiKey: historyFields.apiKey ?? '', ...(historyFields.userId ? { userId: historyFields.userId } : {}) };
      const { summary } = await api.importHistory(historySource, config);
      setTransfer(`Imported ${summary.written} of ${summary.matched} matched ${summary.matched === 1 ? 'entry' : 'entries'}; ${summary.skipped} not found in this library.`);
    } catch (caught) { setSettingsError(caught instanceof Error ? caught.message : 'Import failed.'); }
    finally { setImporting(false); }
  }
  const historyInputs: Array<{ name: string; label: string; type?: string }> = historySource === 'plex'
    ? [{ name: 'baseUrl', label: 'Plex server URL' }, { name: 'token', label: 'Plex token', type: 'password' }]
    : historySource === 'trakt'
      ? [{ name: 'clientId', label: 'Trakt client id' }, { name: 'accessToken', label: 'Trakt access token', type: 'password' }]
      : [{ name: 'baseUrl', label: 'Tautulli URL' }, { name: 'apiKey', label: 'Tautulli API key', type: 'password' }, { name: 'userId', label: 'Plex user id (optional)' }];
  const isAdmin = user?.role === 'admin';
  const initials = user?.username.slice(0, 2).toUpperCase() ?? 'DO';
  return <div className="min-h-screen bg-background text-foreground">
    <Navbar brandLabel="DOSE" brand="DOSE" brandImage={{ src: '/logo.svg', alt: '' }} brandHref="/" items={[{ id: 'library', label: 'Library', href: '/' }]} actions={<UserMenu />} />
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      {error ? <section className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center"><h1 className="text-2xl font-bold">Profile unavailable</h1><p className="text-muted-foreground">{error}</p><Button onClick={() => void load()}>Try again</Button></section> : !user ? <p role="status" className="py-20 text-center text-muted-foreground">Loading profile…</p> : <>
        <section className="flex flex-col gap-6 border-b pb-8 sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border bg-muted text-3xl font-bold">{initials}</div>
          <div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><h1 className="truncate text-3xl font-bold tracking-tight">{user.username}</h1>{isAdmin && <span className="rounded-full border border-foreground/20 bg-foreground/5 px-2.5 py-1 text-xs font-semibold">Administrator</span>}</div><p className="text-muted-foreground">Your local Dose account and server controls.</p></div>
        </section>

        <section aria-labelledby="account-heading" className="py-8"><h2 id="account-heading" className="mb-4 text-xl font-semibold">Account</h2><div className="grid gap-4 md:grid-cols-2">
          <SummaryCard icon={<UserRound />} title="Profile" description="Local account" value={user.username} detail={isAdmin ? 'Full administrator access' : 'Member access'} />
          <SummaryCard icon={<ShieldCheck />} title="Privacy" description="Offline-first" value="Stored locally" detail="Your account and watch activity stay on this server." />
        </div></section>

        <section aria-labelledby="settings-heading" className="border-t py-8"><div className="mb-4"><h2 id="settings-heading" className="text-xl font-semibold">Settings</h2><p className="mt-1 text-sm text-muted-foreground">Choose how your personal library is presented.</p></div>
          <Card><CardContent className="flex items-center justify-between gap-6 py-6"><div><label htmlFor="show-collection-gaps" className="font-medium">Show missing movies from collections</label><p className="mt-1 text-sm text-muted-foreground">Include movies you do not own when viewing a collection.</p>{settingsError && <p role="alert" className="mt-2 text-sm text-destructive">{settingsError}</p>}</div><Switch id="show-collection-gaps" checked={settings?.showCollectionGaps ?? false} disabled={!settings} onCheckedChange={() => void toggleCollectionGaps()} /></CardContent></Card>
          <Card className="mt-4"><CardContent className="space-y-4 py-6">
            <div><p className="font-medium">Playback</p><p className="mt-1 text-sm text-muted-foreground">Applies wherever you sign in.</p></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">Speed
                <select aria-label="Playback speed" className="h-9 rounded-md border bg-background px-2 text-sm font-normal" value={settings?.playbackSpeedPercent ?? 100} disabled={!settings}
                  onChange={(event) => void savePlayback({ playbackSpeedPercent: Number(event.target.value) })}>
                  {[50, 75, 100, 125, 150, 200].map((percent) => <option key={percent} value={percent}>{percent === 100 ? 'Normal' : `${percent / 100}\u00d7`}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">Subtitle size
                <select aria-label="Subtitle size" className="h-9 rounded-md border bg-background px-2 text-sm font-normal" value={settings?.subtitleSizePercent ?? 100} disabled={!settings}
                  onChange={(event) => void savePlayback({ subtitleSizePercent: Number(event.target.value) })}>
                  {[75, 100, 125, 150, 200].map((percent) => <option key={percent} value={percent}>{percent === 100 ? 'Default' : `${percent}%`}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">Subtitle backdrop
                <select aria-label="Subtitle backdrop" className="h-9 rounded-md border bg-background px-2 text-sm font-normal" value={settings?.subtitleBackground ?? 'shadow'} disabled={!settings}
                  onChange={(event) => void savePlayback({ subtitleBackground: event.target.value as 'none' | 'shadow' | 'box' })}>
                  <option value="shadow">Shadow</option><option value="box">Solid box</option><option value="none">None</option>
                </select>
              </label>
            </div>
          </CardContent></Card>
          <Card className="mt-4"><CardContent className="flex flex-wrap items-center justify-between gap-4 py-6"><div><p className="font-medium">Watch data</p><p className="mt-1 text-sm text-muted-foreground">Move your progress, watch list, and collections between Dose installs.</p>{transfer && <p role="status" className="mt-2 text-sm text-muted-foreground">{transfer}</p>}</div><div className="flex items-center gap-2"><Button variant="outline" onClick={() => void exportWatchData()}>Export my data</Button><label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Import<input type="file" accept="application/json" className="sr-only" aria-label="Import watch data" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importWatchData(file); }} /></label></div></CardContent></Card>
          <Card className="mt-4"><CardContent className="space-y-4 py-6">
            <div><p className="font-medium">Import watch history</p><p className="mt-1 text-sm text-muted-foreground">One-way and read-only: Dose reads your history and never writes back to the source.</p></div>
            <div className="flex flex-wrap gap-2">
              {(['plex', 'trakt', 'tautulli'] as const).map((source) => (
                <Button key={source} type="button" size="sm" variant={historySource === source ? 'default' : 'outline'} aria-pressed={historySource === source} onClick={() => { setHistorySource(source); setHistoryFields({}); }}>
                  {source === 'plex' ? 'Plex' : source === 'trakt' ? 'Trakt' : 'Tautulli'}
                </Button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {historyInputs.map((field) => (
                <label key={field.name} className="flex flex-col gap-1.5 text-sm font-medium">{field.label}
                  <input type={field.type ?? 'text'} value={historyFields[field.name] ?? ''} onChange={(event) => setHistoryFields((previous) => ({ ...previous, [field.name]: event.target.value }))} className="h-9 rounded-md border bg-background px-3 text-sm font-normal" />
                </label>
              ))}
            </div>
            <Button onClick={() => void importHistory()} disabled={importing}>{importing ? 'Importing…' : 'Import history'}</Button>
          </CardContent></Card>
        </section>

        <section aria-labelledby="devices-heading" className="border-t py-8">
          <div className="mb-4">
            <h2 id="devices-heading" className="text-xl font-semibold">Devices</h2>
            <p className="mt-1 text-sm text-muted-foreground">Everywhere your account is signed in. Sign a device out to end its session immediately.</p>
          </div>
          <DeviceList />
        </section>

        <section aria-labelledby="library-heading" className="border-t py-8"><div className="mb-4"><h2 id="library-heading" className="text-xl font-semibold">Your library</h2><p className="mt-1 text-sm text-muted-foreground">Collections you have put together yourself.</p></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AdminCard icon={<ListVideo />} title="My Collections" description="Create and curate your own collections" action="Manage collections" onClick={() => navigate('/profile/collections')} />
          <AdminCard icon={<ListOrdered />} title="Marathon queue" description="Line up titles and play straight through" action="Open queue" onClick={() => navigate('/profile/queue')} />
          <AdminCard icon={<HistoryIcon />} title="Watch history" description="Everything you have played" action="View history" onClick={() => navigate('/profile/history')} />
        </div></section>

        {isAdmin && <section aria-labelledby="admin-heading" className="border-t py-8"><div className="mb-4"><h2 id="admin-heading" className="text-xl font-semibold">Administration</h2><p className="mt-1 text-sm text-muted-foreground">Server management now lives on its own pages.</p></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AdminCard icon={<Wrench />} title="Server administration" description="Libraries, family accounts, media, and plugins" action="Open administration" onClick={() => navigate('/admin')} />
        </div></section>}

        <div className="border-t pt-8"><Button asChild variant="outline"><Link to="/">Back to library</Link></Button></div>
      </>}
    </main>
  </div>;
}

function SummaryCard({ icon, title, description, value, detail }: { icon: React.ReactNode; title: string; description: string; value: string; detail: string }) {
  return <Card><CardHeader className="flex-row items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted [&>svg]:h-5 [&>svg]:w-5">{icon}</div><div><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></div></CardHeader><CardContent><p className="font-medium">{value}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></CardContent></Card>;
}
function AdminCard({ icon, title, description, action, onClick }: { icon: React.ReactNode; title: string; description: string; action: string; onClick(): void }) {
  return <Card><CardHeader><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted [&>svg]:h-5 [&>svg]:w-5">{icon}</div><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><Button className="w-full" onClick={onClick}>{action}</Button></CardContent></Card>;
}
