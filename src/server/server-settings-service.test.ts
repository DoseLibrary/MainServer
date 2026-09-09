import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from './db/client.ts';
import { DEFAULT_TRANSCODING_SETTINGS, ServerSettingsService, transcodingSettingsPatch } from './server-settings-service.ts';

describe('ServerSettingsService transcoding', () => {
  let client: PGlite;
  let service: ServerSettingsService;

  beforeEach(async () => {
    client = new PGlite('memory://');
    const database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    service = new ServerSettingsService(database);
  });
  afterEach(async () => { await client.close(); });

  it('starts from the defaults when nothing has been saved', async () => {
    expect(await service.transcoding()).toEqual(DEFAULT_TRANSCODING_SETTINGS);
    expect(DEFAULT_TRANSCODING_SETTINGS).toEqual({ preset: 'veryfast', quality: 21, threads: 0, preferHevcOutput: false });
  });

  it('merges a partial change, persists it, and serves it from memory afterwards', async () => {
    const updated = await service.updateTranscoding({ preset: 'medium', quality: 19 });
    expect(updated).toEqual({ preset: 'medium', quality: 19, threads: 0, preferHevcOutput: false });
    const fresh = new ServerSettingsService(service.database);
    expect(await fresh.transcoding()).toEqual(updated);
    await client.query(`delete from server_settings`);
    // The cached copy is what playback reads on every segment; no round trip.
    expect(await service.transcoding()).toEqual(updated);
  });

  it('drops unknown fields and rejects out-of-range values', () => {
    expect(transcodingSettingsPatch.safeParse({ preset: 'medium', bogus: 1 }).success).toBe(true);
    expect(transcodingSettingsPatch.safeParse({ quality: 51 }).success).toBe(false);
    expect(transcodingSettingsPatch.safeParse({ preset: 'placebo' }).success).toBe(false);
    expect(transcodingSettingsPatch.safeParse({ threads: -1 }).success).toBe(false);
    expect(transcodingSettingsPatch.safeParse({ threads: 65 }).success).toBe(false);
  });
});
