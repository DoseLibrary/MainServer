import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ApiError, api, type PluginRun, type PluginSummary } from '@/lib/api';
import { PluginStatusBadge, SCHEDULE_PRESETS, SettingField, formatWhen } from './plugin-ui';
import { AdminShell } from './AdminShell';
import { usePluginUpdates } from '@/lib/use-live';

type Draft = { enabled: boolean; schedule: string; settings: Record<string, unknown> };

function toDraft(plugin: PluginSummary): Draft {
  return { enabled: plugin.enabled, schedule: plugin.schedule ?? '', settings: { ...plugin.settings } };
}

/** Settings, schedule, actions, and run history for a single plugin. */
export function PluginDetailPage() {
  const { id = '' } = useParams();
  const [plugin, setPlugin] = useState<PluginSummary>();
  const [runs, setRuns] = useState<PluginRun[]>([]);
  const [draft, setDraft] = useState<Draft>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [{ plugin: next }, { runs: history }] = await Promise.all([api.plugin(id), api.pluginRuns(id)]);
      setPlugin(next);
      setDraft(toDraft(next));
      setRuns(history);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load the plugin.'); }
  }, [id]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  // A run started from the schedule, an event, or another browser refreshes the
  // status and the history table in place.
  usePluginUpdates(() => { void load(); });

  function patchSetting(key: string, value: unknown) {
    setDraft((current) => (current ? { ...current, settings: { ...current.settings, [key]: value } } : current));
  }

  async function save() {
    if (!plugin || !draft) return;
    setBusy(true); setNotice(undefined); setFieldErrors({});
    try {
      const { plugin: updated } = await api.configurePlugin(plugin.id, { enabled: draft.enabled, schedule: draft.schedule.trim() || null, settings: draft.settings });
      setPlugin(updated); setDraft(toDraft(updated)); setNotice('Saved');
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors) setFieldErrors(caught.fieldErrors);
      setNotice(caught instanceof Error ? caught.message : 'Could not save.');
    } finally { setBusy(false); }
  }

  async function invoke(operation: () => Promise<{ run: { status: string; summary?: string | null; error?: string } }>, pending: string) {
    setBusy(true); setNotice(pending);
    try {
      const { run } = await operation();
      setNotice(run.status === 'succeeded' ? (run.summary ?? 'Finished') : (run.error ?? 'Run failed'));
      await load();
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : 'Could not run the plugin.'); }
    finally { setBusy(false); }
  }

  const groups = plugin
    ? [...new Map(plugin.fields.map((field) => [field.group ?? '', plugin.fields.filter((entry) => (entry.group ?? '') === (field.group ?? ''))])).entries()]
    : [];

  return <AdminShell title={plugin?.name ?? 'Plugin'}>
      <div className="-mt-2 mb-4"><Button asChild variant="outline" size="sm"><Link to="/admin/plugins">Back to plugins</Link></Button></div>
      {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      {!plugin || !draft ? <p role="status" className="py-8 text-center text-muted-foreground">Loading plugin…</p> : <>
        <section className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">v{plugin.version}</span>
            <PluginStatusBadge status={plugin.lastRunStatus} />
            <div className="ml-auto flex items-center gap-2">
              <label htmlFor="plugin-enabled" className="text-sm font-medium">Enabled</label>
              <Switch id="plugin-enabled" checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{plugin.description}</p>
          {plugin.events.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Reacts to: <span className="text-foreground">{plugin.events.join(', ')}</span></p>}
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div>Last run: <span className="text-foreground">{formatWhen(plugin.lastRunAt)}</span></div>
            <div>Next run: <span className="text-foreground">{formatWhen(plugin.nextRunAt)}</span></div>
            {plugin.lastRunSummary && <div className="sm:col-span-2">Summary: <span className="text-foreground">{plugin.lastRunSummary}</span></div>}
            {plugin.lastRunError && <div className="sm:col-span-2 text-destructive">Error: {plugin.lastRunError}</div>}
          </dl>
        </section>

        {plugin.runnable && <section className="mt-6 flex flex-col gap-1.5">
          <label htmlFor="plugin-schedule" className="text-sm font-medium">Schedule (cron)</label>
          <input id="plugin-schedule" list="plugin-schedule-presets" value={draft.schedule} placeholder="Leave blank to run only on demand"
            onChange={(event) => setDraft({ ...draft, schedule: event.target.value })}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
          <datalist id="plugin-schedule-presets">{SCHEDULE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</datalist>
        </section>}

        {groups.map(([group, fields]) => (
          <section key={group} className="mt-6 space-y-3 border-t pt-4">
            {group && <h2 className="text-sm font-semibold text-muted-foreground">{group}</h2>}
            {fields.map((field) => (
              <SettingField key={field.key} field={field} value={draft.settings[field.key]} secretSet={plugin.secretsSet.includes(field.key)}
                error={fieldErrors[field.key]} onChange={(value) => patchSetting(field.key, value)} />
            ))}
          </section>
        ))}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void save()} disabled={busy}>Save</Button>
          {plugin.runnable && <Button size="sm" variant="outline" onClick={() => void invoke(() => api.runPlugin(plugin.id), 'Running…')} disabled={busy}>Run now</Button>}
          {plugin.actions.map((action) => (
            <Button key={action.id} size="sm" variant="outline" disabled={busy} title={action.description}
              onClick={() => { if (!action.confirm || window.confirm(action.confirm)) void invoke(() => api.runPluginAction(plugin.id, action.id), `${action.label}…`); }}>
              {action.label}
            </Button>
          ))}
          {notice && <span role="status" className="text-sm text-muted-foreground">{notice}</span>}
        </div>

        <section className="mt-8 border-t pt-4">
          <h2 className="mb-3 text-xl font-semibold">Run history</h2>
          {runs.length === 0 ? <p className="text-sm text-muted-foreground">This plugin has not run yet.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr><th className="py-2 font-medium">Started</th><th className="py-2 font-medium">Status</th><th className="py-2 font-medium">Duration</th><th className="py-2 font-medium">Result</th></tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-t align-top">
                    <td className="py-2 pr-3">{formatWhen(run.startedAt)}</td>
                    <td className="py-2 pr-3"><PluginStatusBadge status={run.status} /></td>
                    <td className="py-2 pr-3">{run.durationMs == null ? '—' : `${Math.round(run.durationMs / 100) / 10}s`}</td>
                    <td className={`py-2 ${run.error ? 'text-destructive' : ''}`}>{run.error ?? run.summary ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </>}
  </AdminShell>;
}
