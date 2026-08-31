import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from './db/client.ts';
import { UserSettingsService } from './user-settings-service.ts';

describe('UserSettingsService', () => {
  let client: PGlite;
  let service: UserSettingsService;
  const userId = '10000000-0000-4000-8000-000000000001';

  beforeEach(async () => {
    client = new PGlite('memory://');
    const database = drizzle(client);
    await migrate(database, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    await client.query(`insert into users (id, username, password_hash) values ($1, 'member', 'hash')`, [userId]);
    service = new UserSettingsService(database as unknown as Database);
  });
  afterEach(async () => client.close());

  it('creates defaults on demand and persists validated updates', async () => {
    await expect(service.get(userId)).resolves.toMatchObject({ userId, showCollectionGaps: false });
    await expect(service.update(userId, { showCollectionGaps: true })).resolves.toMatchObject({ userId, showCollectionGaps: true });
    await expect(service.get(userId)).resolves.toMatchObject({ showCollectionGaps: true });
    await expect(service.update(userId, {})).rejects.toThrow();
  });

  it('cascades settings when the user is deleted', async () => {
    await service.get(userId);
    await client.query('delete from users where id = $1', [userId]);
    const result = await client.query<{ count: string }>('select count(*)::text as count from user_settings');
    expect(result.rows[0]?.count).toBe('0');
  });

  it('stores playback preferences within safe bounds', async () => {
    const saved = await service.update(userId, { playbackSpeedPercent: 150, subtitleSizePercent: 125, subtitleBackground: 'box' });
    expect(saved).toMatchObject({ playbackSpeedPercent: 150, subtitleSizePercent: 125, subtitleBackground: 'box' });

    // Values that would make playback unusable are refused outright.
    await expect(service.update(userId, { playbackSpeedPercent: 1000 })).rejects.toThrow();
    await expect(service.update(userId, { subtitleBackground: 'rainbow' as never })).rejects.toThrow();
    expect(await service.get(userId)).toMatchObject({ playbackSpeedPercent: 150 });
  });

  it('defaults to normal speed and shadowed captions', async () => {
    expect(await service.get(userId)).toMatchObject({ playbackSpeedPercent: 100, subtitleSizePercent: 100, subtitleBackground: 'shadow' });
  });
});
