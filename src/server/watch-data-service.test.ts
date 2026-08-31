import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WatchDataService, normalizeTitle } from './watch-data-service.ts';
import type { Database } from './db/client.ts';

const LIB = '10000000-0000-4000-8000-000000000001';
const ONE = '20000000-0000-4000-8000-000000000001';
const TWO = '20000000-0000-4000-8000-000000000002';
const THREE = '20000000-0000-4000-8000-000000000003';
const USER = '70000000-0000-4000-8000-000000000001';
const OTHER = '70000000-0000-4000-8000-000000000002';

describe('WatchDataService', () => {
  let client: PGlite;
  let service: WatchDataService;

  beforeEach(async () => {
    client = new PGlite('memory://');
    const database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    service = new WatchDataService(database);

    await client.query(`insert into users (id, username, password_hash) values ($1, 'owner', 'x'), ($2, 'other', 'x')`, [USER, OTHER]);
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year, provider_ids) values
      ($1, $4, 'movie', 'movie:one', 'One', 'one', 2020, '{"tmdb":"100"}'),
      ($2, $4, 'movie', 'movie:two', 'Two', 'two', 2021, '{"imdb_id":"tt2"}'),
      ($3, $4, 'movie', 'movie:three', 'The Third Man', 'third man', 1949, '{}')`, [ONE, TWO, THREE, LIB]);
  });

  afterEach(async () => { await client.close(); });

  it('folds titles for the fallback match', () => {
    expect(normalizeTitle('The Third Man!')).toBe('third man');
    expect(normalizeTitle('  Spider-Man: No Way Home ')).toBe('spider man no way home');
  });

  it('resolves a match by tmdb id, then imdb id, then title and year', async () => {
    expect(await service.resolveMatch({ tmdbId: '100', title: 'Wrong', kind: 'movie' })).toBe(ONE);
    expect(await service.resolveMatch({ imdbId: 'tt2', title: 'Wrong', kind: 'movie' })).toBe(TWO);
    expect(await service.resolveMatch({ title: 'the third man', year: 1949, kind: 'movie' })).toBe(THREE);
    expect(await service.resolveMatch({ title: 'The Third Man', year: 1999, kind: 'movie' })).toBeNull();
    expect(await service.resolveMatch({ tmdbId: '999', title: 'Nope', kind: 'movie' })).toBeNull();
  });

  it('exports watch data by natural key with no internal ids', async () => {
    await client.query(`insert into playback_progress (user_id, media_item_id, position_seconds, watched) values ($1, $2, 120, false)`, [USER, ONE]);
    await client.query(`insert into watchlist_entries (user_id, media_item_id) values ($1, $2)`, [USER, TWO]);
    const collectionId = '80000000-0000-4000-8000-000000000001';
    await client.query(`insert into user_collections (id, user_id, name) values ($1, $2, 'Noir')`, [collectionId, USER]);
    await client.query(`insert into user_collection_items (user_collection_id, media_item_id, position) values ($1, $2, 0)`, [collectionId, THREE]);

    const document = await service.exportFor(USER);
    expect(document.version).toBe(1);
    expect(document.progress).toEqual([expect.objectContaining({ match: expect.objectContaining({ tmdbId: '100', title: 'One', year: 2020, kind: 'movie' }), positionSeconds: 120, watched: false })]);
    expect(document.watchlist[0]?.match).toMatchObject({ imdbId: 'tt2', title: 'Two' });
    expect(document.collections).toEqual([expect.objectContaining({ name: 'Noir', items: [expect.objectContaining({ title: 'The Third Man' })] })]);
    expect(JSON.stringify(document)).not.toContain(ONE);
  });

  it('round-trips an export into an empty user and stays idempotent', async () => {
    await client.query(`insert into playback_progress (user_id, media_item_id, position_seconds, watched) values ($1, $2, 300, true)`, [USER, ONE]);
    await client.query(`insert into watchlist_entries (user_id, media_item_id) values ($1, $2)`, [USER, TWO]);
    const collectionId = '80000000-0000-4000-8000-000000000002';
    await client.query(`insert into user_collections (id, user_id, name) values ($1, $2, 'Noir')`, [collectionId, USER]);
    await client.query(`insert into user_collection_items (user_collection_id, media_item_id, position) values ($1, $2, 0)`, [collectionId, THREE]);
    const document = await service.exportFor(USER);

    const first = await service.importDocument(OTHER, document);
    expect(first.unmatched).toEqual([]);
    expect(first.written).toBe(3);
    const second = await service.importDocument(OTHER, document);
    expect(second.written).toBe(0);

    const progress = (await client.query<{ position_seconds: number; watched: boolean }>(`select position_seconds, watched from playback_progress where user_id = $1`, [OTHER])).rows;
    expect(progress).toEqual([{ position_seconds: 300, watched: true }]);
    const collections = (await client.query<{ c: string }>(`select count(*)::text as c from user_collections where user_id = $1`, [OTHER])).rows;
    expect(collections[0]?.c).toBe('1');
    const items = (await client.query<{ c: string }>(`select count(*)::text as c from user_collection_items`)).rows;
    expect(items[0]?.c).toBe('2');
  });

  it('merges progress to the furthest position and the sticky watched flag', async () => {
    await client.query(`insert into playback_progress (user_id, media_item_id, position_seconds, watched, last_watched_at) values ($1, $2, 500, true, '2024-01-01T00:00:00Z')`, [USER, ONE]);
    const summary = await service.importProgress(USER, [
      { match: { tmdbId: '100', title: 'One', kind: 'movie' }, positionSeconds: 100, watched: false, lastWatchedAt: '2023-01-01T00:00:00Z' },
    ]);
    expect(summary.matched).toBe(1);
    const row = (await client.query<{ position_seconds: number; watched: boolean }>(`select position_seconds, watched from playback_progress where user_id = $1`, [USER])).rows[0];
    expect(row).toEqual({ position_seconds: 500, watched: true });
  });

  it('reports unmatched entries without aborting the import', async () => {
    const summary = await service.importDocument(USER, {
      version: 1,
      progress: [
        { match: { tmdbId: '404', title: 'Ghost', year: 1990, kind: 'movie' }, positionSeconds: 10, watched: false },
        { match: { tmdbId: '100', title: 'One', kind: 'movie' }, positionSeconds: 42, watched: false },
      ],
      watchlist: [],
      collections: [],
    });
    expect(summary.matched).toBe(1);
    expect(summary.written).toBe(1);
    expect(summary.unmatched).toEqual([expect.objectContaining({ title: 'Ghost' })]);
  });
});
