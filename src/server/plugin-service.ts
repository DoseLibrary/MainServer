import { desc, eq, sql } from 'drizzle-orm';
import type { Database } from './db/client.ts';
import { pluginConfigurations, pluginRuns } from './db/schema.ts';
import type { PluginRegistry } from './plugins/registry.ts';

const DEFAULT_HISTORY_LIMIT = 50;

export class PluginAlreadyRunningError extends Error {}

export class PluginService {
  private readonly running = new Set<string>();

  constructor(
    private readonly db: Database,
    private readonly registry: PluginRegistry,
    private readonly historyLimit = DEFAULT_HISTORY_LIMIT,
  ) {}

  async initialize() {
    for (const plugin of this.registry.list()) await this.ensureConfiguration(plugin.id);
  }

  async list() {
    await this.initialize();
    const configurations = await this.db.select().from(pluginConfigurations);
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
    const settings = plugin.settingsSchema.parse(change.settings ?? current.settings);
    const [configuration] = await this.db.update(pluginConfigurations).set({
      enabled: change.enabled ?? current.enabled,
      schedule: change.schedule === undefined ? current.schedule : change.schedule,
      settings,
      nextRunAt: change.nextRunAt === undefined ? current.nextRunAt : change.nextRunAt,
      updatedAt: new Date(),
    }).where(eq(pluginConfigurations.pluginId, pluginId)).returning();
    return configuration;
  }

  async history(pluginId: string, limit = this.historyLimit) {
    this.registry.get(pluginId);
    return this.db.select().from(pluginRuns).where(eq(pluginRuns.pluginId, pluginId))
      .orderBy(desc(pluginRuns.startedAt)).limit(Math.max(1, Math.min(limit, this.historyLimit)));
  }

  async run(pluginId: string) {
    const plugin = this.registry.get(pluginId);
    if (this.running.has(pluginId)) throw new PluginAlreadyRunningError(`Plugin is already running: ${pluginId}`);
    this.running.add(pluginId);
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
      const result = await plugin.run({ settings, signal: new AbortController().signal });
      const finishedAt = new Date();
      const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
      const summary = result?.summary ?? null;
      await this.db.transaction(async (tx) => {
        await tx.update(pluginRuns).set({ status: 'succeeded', finishedAt, durationMs, summary }).where(eq(pluginRuns.id, run.id));
        await tx.update(pluginConfigurations).set({ lastRunAt: finishedAt, lastRunStatus: 'succeeded', lastRunDurationMs: durationMs, lastRunSummary: summary, lastRunError: null, updatedAt: finishedAt })
          .where(eq(pluginConfigurations.pluginId, pluginId));
      });
      outcome = { id: run.id, status: 'succeeded', durationMs, summary };
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
    if (existing) return existing;
    const settings = plugin.settingsSchema.parse({});
    const [created] = await this.db.insert(pluginConfigurations).values({ pluginId, settings }).onConflictDoNothing().returning();
    if (created) return created;
    return (await this.db.select().from(pluginConfigurations).where(eq(pluginConfigurations.pluginId, pluginId)).limit(1))[0]!;
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
