import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from './db/client.ts';
import { PluginAlreadyRunningError, PluginService } from './plugin-service.ts';
import { PluginRegistry, UnknownPluginError } from './plugins/registry.ts';

describe('PluginService', () => {
  let client: PGlite;
  let database: Database;

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  });

  afterEach(async () => { await client.close(); });

  it('applies defaults and validates saved settings', async () => {
    const registry = new PluginRegistry().register({
      id: 'example', metadata: { name: 'Example', description: 'Test', version: '1' },
      settingsSchema: z.object({ count: z.number().int().min(1).default(3) }),
      run: vi.fn(),
    });
    const service = new PluginService(database, registry);

    expect((await service.get('example')).configuration.settings).toEqual({ count: 3 });
    await expect(service.configure('example', { settings: { count: 0 } })).rejects.toThrow();
    expect((await service.configure('example', { settings: { count: 5 } })).settings).toEqual({ count: 5 });
  });

  it('records successful and failed runs with summaries', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ summary: 'Fetched 4 trailers' })
      .mockRejectedValueOnce(new Error('Provider unavailable'));
    const registry = new PluginRegistry().register({
      id: 'example', metadata: { name: 'Example', description: 'Test', version: '1' },
      settingsSchema: z.object({}), run,
    });
    const service = new PluginService(database, registry);

    expect(await service.run('example')).toMatchObject({ status: 'succeeded', summary: 'Fetched 4 trailers' });
    expect(await service.run('example')).toMatchObject({ status: 'failed', error: 'Provider unavailable' });
    const history = await service.history('example');
    expect(history.map((entry) => entry.status)).toEqual(['failed', 'succeeded']);
    expect(history[0]).toMatchObject({ error: 'Provider unavailable' });
    expect((await service.get('example')).configuration).toMatchObject({ lastRunStatus: 'failed', lastRunError: 'Provider unavailable' });
  });

  it('prevents overlapping runs of the same plugin', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolvePromise) => { release = resolvePromise; });
    const registry = new PluginRegistry().register({
      id: 'slow', metadata: { name: 'Slow', description: 'Test', version: '1' },
      settingsSchema: z.object({}), run: async () => waiting,
    });
    const service = new PluginService(database, registry);
    const first = service.run('slow');
    await vi.waitFor(async () => expect((await service.history('slow'))[0]?.status).toBe('running'));
    await expect(service.run('slow')).rejects.toBeInstanceOf(PluginAlreadyRunningError);
    release();
    await first;
  });

  it('rejects unknown plugin IDs', async () => {
    const service = new PluginService(database, new PluginRegistry());
    await expect(service.run('missing')).rejects.toBeInstanceOf(UnknownPluginError);
  });

  it('keeps bounded run history', async () => {
    const registry = new PluginRegistry().register({
      id: 'example', metadata: { name: 'Example', description: 'Test', version: '1' },
      settingsSchema: z.object({}), run: async () => undefined,
    });
    const service = new PluginService(database, registry, 2);
    await service.run('example');
    await service.run('example');
    await service.run('example');
    expect(await service.history('example', 10)).toHaveLength(2);
  });

  it('does not redefine a successful run when history pruning fails', async () => {
    const registry = new PluginRegistry().register({
      id: 'example', metadata: { name: 'Example', description: 'Test', version: '1' },
      settingsSchema: z.object({}), run: async () => ({ summary: 'Completed work' }),
    });
    const service = new PluginService(database, registry);
    vi.spyOn(service as unknown as { pruneHistory(pluginId: string): Promise<void> }, 'pruneHistory')
      .mockRejectedValueOnce(new Error('cleanup failed'));

    await expect(service.run('example')).resolves.toMatchObject({ status: 'succeeded', summary: 'Completed work' });
    expect((await service.history('example'))[0]).toMatchObject({
      status: 'succeeded', summary: 'Completed work', error: null,
    });
    expect((await service.get('example')).configuration).toMatchObject({
      lastRunStatus: 'succeeded', lastRunSummary: 'Completed work', lastRunError: null,
    });
  });
});
