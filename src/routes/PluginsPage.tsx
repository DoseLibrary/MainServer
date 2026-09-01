import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api, type PluginSummary } from '@/lib/api';
import { usePluginUpdates } from '@/lib/use-live';
import { AdminShell } from './AdminShell';
import { PluginStatusBadge, formatWhen } from './plugin-ui';

/** Overview of installed plugins. Settings live on the per-plugin detail page. */
export function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginSummary[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setError(undefined);
    try { setPlugins((await api.plugins()).plugins); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load plugins.'); }
  }, []);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  // Scheduled and event-triggered runs land here too, not just "Run now".
  usePluginUpdates(() => { void load(); });

  async function toggle(plugin: PluginSummary, enabled: boolean) {
    setBusy((current) => ({ ...current, [plugin.id]: true }));
    try {
      const { plugin: updated } = await api.configurePlugin(plugin.id, { enabled });
      setPlugins((list) => list?.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update the plugin.'); }
    finally { setBusy((current) => ({ ...current, [plugin.id]: false })); }
  }

  return <AdminShell title="Plugins" description="Enable installed plugins; open one to schedule and configure it." wide>
      {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {!plugins ? <p role="status" className="py-8 text-center text-muted-foreground">Loading plugins…</p>
        : plugins.length === 0 ? <p className="py-8 text-center text-muted-foreground">No plugins are installed.</p> : (
          <ul className="space-y-3">
            {plugins.map((plugin) => (
              <li key={plugin.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/admin/plugins/${encodeURIComponent(plugin.id)}`} className="font-semibold hover:underline">{plugin.name}</Link>
                    <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">v{plugin.version}</span>
                    <PluginStatusBadge status={plugin.lastRunStatus} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{plugin.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Last run: <span className="text-foreground">{formatWhen(plugin.lastRunAt)}</span> · Next run: <span className="text-foreground">{formatWhen(plugin.nextRunAt)}</span></p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label htmlFor={`enabled-${plugin.id}`} className="text-sm font-medium">Enabled</label>
                    <Switch id={`enabled-${plugin.id}`} checked={plugin.enabled} disabled={busy[plugin.id] ?? false}
                      onCheckedChange={(enabled) => void toggle(plugin, enabled)} />
                  </div>
                  <Button asChild size="sm" variant="outline"><Link to={`/admin/plugins/${encodeURIComponent(plugin.id)}`}>Configure</Link></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
  </AdminShell>;
}
