import { useCallback, useEffect, useState } from 'react';
import { api, type PluginSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '@/components/ui/modal';

interface PluginManagerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  embedded?: boolean;
}

// Common cron presets surfaced as a datalist so admins don't have to know cron by heart.
const SCHEDULE_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at 03:00', value: '0 3 * * *' },
  { label: 'Weekly (Sun 03:00)', value: '0 3 * * 0' },
];

type Draft = { enabled: boolean; schedule: string; settings: Record<string, unknown> };

function toDraft(plugin: PluginSummary): Draft {
  return { enabled: plugin.enabled, schedule: plugin.schedule ?? '', settings: { ...plugin.settings } };
}

function formatWhen(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function PluginManager({ open = true, onOpenChange = () => {}, embedded = false }: PluginManagerProps) {
  const [plugins, setPlugins] = useState<PluginSummary[]>();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const { plugins: next } = await api.plugins();
      setPlugins(next);
      setDrafts(Object.fromEntries(next.map((plugin) => [plugin.id, toDraft(plugin)])));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load plugins.'); }
  }, []);

  useEffect(() => { if (open) queueMicrotask(() => { void load(); }); }, [open, load]);

  function patchDraft(id: string, change: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...change } }));
  }
  function patchSetting(id: string, key: string, value: unknown) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], settings: { ...current[id].settings, [key]: value } } }));
  }

  async function save(plugin: PluginSummary) {
    const draft = drafts[plugin.id]; if (!draft) return;
    setBusy((b) => ({ ...b, [plugin.id]: true })); setNotice((n) => ({ ...n, [plugin.id]: '' }));
    try {
      const { plugin: updated } = await api.configurePlugin(plugin.id, { enabled: draft.enabled, schedule: draft.schedule.trim() || null, settings: draft.settings });
      setPlugins((list) => list?.map((p) => (p.id === updated.id ? updated : p)));
      setDrafts((current) => ({ ...current, [updated.id]: toDraft(updated) }));
      setNotice((n) => ({ ...n, [plugin.id]: 'Saved' }));
    } catch (caught) { setNotice((n) => ({ ...n, [plugin.id]: caught instanceof Error ? caught.message : 'Could not save.' })); }
    finally { setBusy((b) => ({ ...b, [plugin.id]: false })); }
  }

  async function runNow(plugin: PluginSummary) {
    setBusy((b) => ({ ...b, [plugin.id]: true })); setNotice((n) => ({ ...n, [plugin.id]: 'Running…' }));
    try {
      const { run } = await api.runPlugin(plugin.id);
      setNotice((n) => ({ ...n, [plugin.id]: run.status === 'succeeded' ? (run.summary ?? 'Finished') : (run.error ?? 'Run failed') }));
      await load();
    } catch (caught) { setNotice((n) => ({ ...n, [plugin.id]: caught instanceof Error ? caught.message : 'Could not run plugin.' })); }
    finally { setBusy((b) => ({ ...b, [plugin.id]: false })); }
  }

  const content = <>
        {embedded ? <div className="mb-6"><h2 className="text-xl font-semibold">Installed plugins</h2><p id="plugin-manager-description" className="text-sm text-muted-foreground">Enable internal plugins, schedule them, and adjust their settings.</p></div> : <ModalHeader>
          <ModalTitle className="text-xl font-semibold">Plugins</ModalTitle>
          <ModalDescription id="plugin-manager-description">Enable internal plugins, schedule them, and adjust their settings.</ModalDescription>
        </ModalHeader>}
        {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
        {!plugins ? <p role="status" className="py-8 text-center text-muted-foreground">Loading plugins…</p> : plugins.length === 0 ? <p className="py-8 text-center text-muted-foreground">No plugins are installed.</p> : (
          <ul className="space-y-4">
            {plugins.map((plugin) => {
              const draft = drafts[plugin.id] ?? toDraft(plugin);
              const isBusy = busy[plugin.id] ?? false;
              const status = plugin.lastRunStatus;
              return (
                <li key={plugin.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{plugin.name}</h3>
                        <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">v{plugin.version}</span>
                        <StatusBadge status={status} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{plugin.description}</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={draft.enabled} onChange={(e) => patchDraft(plugin.id, { enabled: e.target.checked })} />
                      Enabled
                    </label>
                  </div>

                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <div>Last run: <span className="text-foreground">{formatWhen(plugin.lastRunAt)}</span></div>
                    <div>Next run: <span className="text-foreground">{formatWhen(plugin.nextRunAt)}</span></div>
                    {plugin.lastRunSummary && <div className="sm:col-span-2">Summary: <span className="text-foreground">{plugin.lastRunSummary}</span></div>}
                    {plugin.lastRunError && <div className="sm:col-span-2 text-destructive">Error: {plugin.lastRunError}</div>}
                  </dl>

                  <div className="mt-3 flex flex-col gap-1.5">
                    <label htmlFor={`schedule-${plugin.id}`} className="text-sm font-medium">Schedule (cron)</label>
                    <input id={`schedule-${plugin.id}`} list={`presets-${plugin.id}`} value={draft.schedule} placeholder="Leave blank to run only on demand"
                      onChange={(e) => patchDraft(plugin.id, { schedule: e.target.value })}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
                    <datalist id={`presets-${plugin.id}`}>{SCHEDULE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</datalist>
                  </div>

                  {plugin.fields.length > 0 && (
                    <div className="mt-3 space-y-3 border-t pt-3">
                      {plugin.fields.map((field) => (
                        <SettingField key={field.key} field={field} value={draft.settings[field.key]} onChange={(value) => patchSetting(plugin.id, field.key, value)} />
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => void save(plugin)} disabled={isBusy}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => void runNow(plugin)} disabled={isBusy}>Run now</Button>
                    {notice[plugin.id] && <span role="status" className="text-sm text-muted-foreground">{notice[plugin.id]}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
  </>;
  if (embedded) return <section aria-describedby="plugin-manager-description" className="w-full">{content}</section>;
  return <Modal open={open} onOpenChange={onOpenChange}><ModalContent aria-describedby="plugin-manager-description" className="max-h-[90vh] max-w-2xl overflow-y-auto">{content}</ModalContent></Modal>;
}

function StatusBadge({ status }: { status: 'running' | 'succeeded' | 'failed' | null }) {
  if (!status) return <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Never run</span>;
  const styles = status === 'succeeded' ? 'border-emerald-500/40 text-emerald-600' : status === 'failed' ? 'border-destructive/40 text-destructive' : 'border-amber-500/40 text-amber-600';
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>{status === 'succeeded' ? 'Succeeded' : status === 'failed' ? 'Failed' : 'Running'}</span>;
}

function SettingField({ field, value, onChange }: { field: import('@/lib/api').PluginField; value: unknown; onChange: (value: unknown) => void }) {
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  if (field.type === 'list') {
    const text = Array.isArray(value) ? value.join(', ') : '';
    return <Input label={field.label} value={text} onChange={(e) => onChange(e.target.value.split(',').map((part) => part.trim()).filter(Boolean))} />;
  }
  if (field.type === 'number') {
    return <Input label={field.label} type="number" value={typeof value === 'number' ? value : ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
  }
  return <Input label={field.label} type={field.secret ? 'password' : 'text'} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />;
}
