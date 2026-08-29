import { Cron } from 'croner';
import type { PluginService } from './plugin-service.ts';

export class PluginScheduler {
  private jobs = new Map<string, Cron>();
  constructor(private readonly service: PluginService) {}
  async start() { await this.stop(); for (const entry of await this.service.list()) if (entry.configuration.enabled && entry.configuration.schedule) await this.schedule(entry.plugin.id, entry.configuration.schedule); }
  async reload() { await this.start(); }
  async stop() { for (const job of this.jobs.values()) job.stop(); this.jobs.clear(); }
  private async schedule(pluginId: string, pattern: string) {
    const job = new Cron(pattern, { protect: true }, async () => { await this.service.run(pluginId).catch(() => undefined); await this.updateNext(pluginId, job); });
    this.jobs.set(pluginId, job); await this.updateNext(pluginId, job);
  }
  private async updateNext(pluginId: string, job: Cron) {
    const { configuration } = await this.service.get(pluginId);
    await this.service.configure(pluginId, { settings: configuration.settings, nextRunAt: job.nextRun() ?? null });
  }
}
