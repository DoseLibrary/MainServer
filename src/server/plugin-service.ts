import { desc, eq, sql } from 'drizzle-orm';
import type { Database } from './db/client.ts';
import { pluginConfigurations, pluginRuns } from './db/schema.ts';
import type { PluginRegistry } from './plugins/registry.ts';
import type { PluginEventBus, PluginEventName } from './plugins/events.ts';
import type { PluginRunContext, PluginRunResult } from './plugins/types.ts';

const DEFAULT_HISTORY_LIMIT = 50;

export class PluginAlreadyRunningError extends Error {}
export class PluginNotRunnableError extends Error {}
export class UnknownPluginActionError extends Error {}

type Configuration = typeof pluginConfigurations.$inferSelect;

/** What a run listener is told: enough to refresh a plugin screen. */
export interface PluginRunChange { pluginId: string; status: 'running' | 'succeeded' | 'failed' }

export class PluginService {
  private readonly running = new Map<string, AbortController>();
  private readonly runListeners = new Set<(change: PluginRunChange) => void>();
  /** Event delivery resolves settings/enabled from here; a DB read per event would not scale. */
  private readonly configurations = new Map<string, Configuration>();
  private readonly shutdown = new AbortController();
  private subscribed = false;

  constructor(
    private readonly db: Database,
    private readonly registry: PluginRegistry,
    private readonly historyLimit = DEFAULT_HISTORY_LIMIT,
    private readonly events?: PluginEventBus,
  ) {}

  async initialize() {
    for (const plugin of this.registry.list()) await this.ensureConfiguration(plugin.id);
    this.subscribe();
  }

  /** Wire event handlers once. Settings are read at delivery time, so saving a
   * configuration takes effect on the next event without re-subscribing. */
  private subscribe() {
    if (this.subscribed || !this.events) return;
    this.subscribed = true;
    for (const plugin of this.registry.list()) {
      const handlers = plugin.events;
      if (!handlers) continue;
      for (const name of Object.keys(handlers) as PluginEventName[]) {
        const handler = handlers[name];
        if (!handler) continue;
        this.events.subscribe(plugin.id, name, async (event, payload) => {
          const configuration = this.configurations.get(plugin.id) ?? await this.ensureConfiguration(plugin.id);
          const settings = plugin.settingsSchema.parse(configuration.settings);
          await (handler as (context: unknown) => Promise<void> | void)({ event, payload, settings, signal: this.shutdown.signal });
        });
      }
    }
  }

  isEnabled(pluginId: string) { return this.configurations.get(pluginId)?.enabled ?? false; }

  /**
   * Watch every run, however it started — on demand, on a schedule, or from an
   * event. Listeners are notified after the outcome is durable, so a screen that
   * refetches on the signal reads the same state a reload would.
   */
  onRunChange(listener: (change: PluginRunChange) => void): () => void {
    this.runListeners.add(listener);
    return () => { this.runListeners.delete(listener); };
  }

  /** Notification is advisory: a listener that throws never fails a run. */
  private announce(change: PluginRunChange) {
    for (const listener of this.runListeners) {
      try { listener(change); } catch { /* a broken listener is not a broken run */ }
    }
  }

  /** Abort in-flight runs and event handlers so shutdown is not blocked. */
  abortAll() {
    this.shutdown.abort();
    for (const controller of this.running.values()) controller.abort();
  }

  async list() {
    await this.initialize();
    const configurations = await this.db.select().from(pluginConfigurations);
    for (const configuration of configurations) this.configurations.set(configuration.pluginId, configuration);
    const byId = new Map(configurations.map((value) => [value.pluginId, value]));
    return this.registry.list().map((plugin) => ({ plugin, configuration: byId.get(plugin.id)! }));
  }

  async get(pluginId: string) {
    const plugin = this.registry.get(pluginId);
    const configuration = await this.ensureConfiguration(pluginId);
    return { plugin, configuration };
  }

  async configure(pluginId: string, change: { enabled?: boolean; schedule?: string | null; settings?: Record<string, unknown>; nextRunAt?: Date | null }) {
    const plugin = this.registry.get(pluginId);
    const current = await this.ensureConfiguration(pluginId);
    const merged = change.settings ? this.mergeSecrets(pluginId, current.settings, change.settings) : current.settings;
    const settings = plugin.settingsSchema.parse(merged);
    const [configuration] = await this.db.update(pluginConfigurations).set({
      enabled: change.enabled ?? current.enabled,
      schedule: change.schedule === undefined ? current.schedule : change.schedule,
      settings,
      nextRunAt: change.nextRunAt === undefined ? current.nextRunAt : change.nextRunAt,
      updatedAt: new Date(),
    }).where(eq(pluginConfigurations.pluginId, pluginId)).returning();
    this.configurations.set(pluginId, configuration);
    return configuration;
  }

  /** A password field the admin form did not resend keeps its stored value; the
   * form never receives the secret, so it cannot send it back. */
  private mergeSecrets(pluginId: string, current: Record<string, unknown>, incoming: Record<string, unknown>) {
    const secretKeys = (this.registry.get(pluginId).fields ?? []).filter((field) => field.kind === 'password').map((field) => field.key);
    const merged: Record<string, unknown> = { ...incoming };
    for (const key of secretKeys) {
      const value = merged[key];
      if (value !== undefined && value !== null && value !== '') continue;
      if (current[key] !== undefined) merged[key] = current[key];
      else delete merged[key];
    }
    return merged;
  }

  async history(pluginId: string, limit = this.historyLimit) {
    this.registry.get(pluginId);
    return this.db.select().from(pluginRuns).where(eq(pluginRuns.pluginId, pluginId))
      .orderBy(desc(pluginRuns.startedAt)).limit(Math.max(1, Math.min(limit, this.historyLimit)));
  }

  async run(pluginId: string) {
    const plugin = this.registry.get(pluginId);
    if (!plugin.run) throw new PluginNotRunnableError(`Plugin has no scheduled run: ${pluginId}`);
    return this.execute(pluginId, (context) => plugin.run!(context));
  }

  async runAction(pluginId: string, actionId: string) {
    const plugin = this.registry.get(pluginId);
    const action = (plugin.actions ?? []).find((entry) => entry.id === actionId);
    if (!action) throw new UnknownPluginActionError(`Unknown plugin action: ${pluginId}/${actionId}`);
    return this.execute(pluginId, (context) => action.run(context));
  }

  private async execute(pluginId: string, invoke: (context: PluginRunContext<Record<string, unknown>>) => Promise<PluginRunResult | void>) {
    const plugin = this.registry.get(pluginId);
    if (this.running.has(pluginId)) throw new PluginAlreadyRunningError(`Plugin is already running: ${pluginId}`);
    const controller = new AbortController();
    this.running.set(pluginId, controller);
    const startedAt = new Date();
    let runId: string | undefined;
    let outcome:
      | { id: string; status: 'succeeded'; durationMs: number; summary: string | null }
      | { id: string; status: 'failed'; durationMs: number; error: string };
    try {
      const configuration = await this.ensureConfiguration(pluginId);
      const settings = plugin.settingsSchema.parse(configuration.settings);
      let run: { id: string };
      try {
        [run] = await this.db.insert(pluginRuns).values({ pluginId, status: 'running', startedAt }).returning({ id: pluginRuns.id });
      } catch (cause) {
        if (isUniqueViolation(cause)) throw new PluginAlreadyRunningError(`Plugin is already running: ${pluginId}`);
        throw cause;
      }
      runId = run.id;
      this.announce({ pluginId, status: 'running' });
      const result = await invoke({ settings, signal: controller.signal });
      const finishedAt = new Date();
      const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
      const summary = result?.summary ?? null;
      await this.db.transaction(async (tx) => {
        await tx.update(pluginRuns).set({ status: 'succeeded', finishedAt, durationMs, summary }).where(eq(pluginRuns.id, run.id));
        await tx.update(pluginConfigurations).set({ lastRunAt: finishedAt, lastRunStatus: 'succeeded', lastRunDurationMs: durationMs, lastRunSummary: summary, lastRunError: null, updatedAt: finishedAt })
          .where(eq(pluginConfigurations.pluginId, pluginId));
      });
      outcome = { id: run.id, status: 'succeeded', durationMs, summary };
      this.announce({ pluginId, status: 'succeeded' });
    } catch (cause) {
      if (!runId) throw cause;
      const failedRunId = runId;
      const finishedAt = new Date();
      const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
      const error = errorSummary(cause);
      await this.db.transaction(async (tx) => {
        await tx.update(pluginRuns).set({ status: 'failed', finishedAt, durationMs, error }).where(eq(pluginRuns.id, failedRunId));
        await tx.update(pluginConfigurations).set({ lastRunAt: finishedAt, lastRunStatus: 'failed', lastRunDurationMs: durationMs, lastRunSummary: null, lastRunError: error, updatedAt: finishedAt })
          .where(eq(pluginConfigurations.pluginId, pluginId));
      });
      outcome = { id: failedRunId, status: 'failed', durationMs, error };
      this.announce({ pluginId, status: 'failed' });
    } finally {
      this.running.delete(pluginId);
    }
    // History retention is maintenance after the durable execution outcome. A
    // cleanup problem must never rewrite a successful plugin run as failed.
    try { await this.pruneHistory(pluginId); } catch { /* Retried by a later run. */ }
    return outcome;
  }

  private async ensureConfiguration(pluginId: string) {
    const plugin = this.registry.get(pluginId);
    const [existing] = await this.db.select().from(pluginConfigurations).where(eq(pluginConfigurations.pluginId, pluginId)).limit(1);
    if (existing) { this.configurations.set(pluginId, existing); return existing; }
    const settings = plugin.settingsSchema.parse({});
    const [created] = await this.db.insert(pluginConfigurations).values({ pluginId, settings }).onConflictDoNothing().returning();
    if (created) { this.configurations.set(pluginId, created); return created; }
    const [fallback] = await this.db.select().from(pluginConfigurations).where(eq(pluginConfigurations.pluginId, pluginId)).limit(1);
    this.configurations.set(pluginId, fallback!);
    return fallback!;
  }

  private async pruneHistory(pluginId: string) {
    if (this.historyLimit < 1) return;
    await this.db.execute(sql`
      delete from ${pluginRuns}
      where ${pluginRuns.pluginId} = ${pluginId}
        and ${pluginRuns.id} not in (
          select ${pluginRuns.id} from ${pluginRuns}
          where ${pluginRuns.pluginId} = ${pluginId}
          order by ${pluginRuns.startedAt} desc, ${pluginRuns.id} desc
          limit ${this.historyLimit}
        )
    `);
  }
}

function errorSummary(cause: unknown) {
  const value = cause instanceof Error ? cause.message : String(cause);
  return value.slice(0, 2_000);
}

function isUniqueViolation(cause: unknown) {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23505';
}
