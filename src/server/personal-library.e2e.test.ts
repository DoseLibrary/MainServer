import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog-service.ts';
import { QueueService } from './queue-service.ts';
import { UserCollectionsService } from './user-collections-service.ts';
import { UserSettingsService } from './user-settings-service.ts';
import { WatchDataService } from './watch-data-service.ts';
import { PlexHistorySource } from './history-sources/plex.ts';
import type { Database } from './db/client.ts';

const LIB = '10000000-0000-4000-8000-000000000001';
const HEIST = '20000000-0000-4000-8000-000000000001';
const SEQUEL = '20000000-0000-4000-8000-000000000002';
const SHELVED = '20000000-0000-4000-8000-000000000003';
const COLLECTION = '60000000-0000-4000-8000-000000000001';
const USER = '70000000-0000-4000-8000-000000000001';
const FRESH = '70000000-0000-4000-8000-000000000002';

describe('personal-library offline end-to-end', () => {
  let client: PGlite;
  let database: Database;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    await client.query(`insert into users (id, username, password_hash) values ($1, 'owner', 'x'), ($2, 'fresh', 'x')`, [USER, FRESH]);
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/movies')`, [LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year, provider_rating, available, provider_ids) values
      ($1, $4, 'movie', 'movie:the-heist:2010', 'The Heist', 'the heist', 2010, 8.1, true, '{"tmdb":"100","imdb_id":"tt100"}'),
      ($2, $4, 'movie', 'movie:the-heist-2:2014', 'The Heist 2', 'the heist 2', 2014, 6.2, true, '{"tmdb":"101"}'),
      ($3, $4, 'movie', 'movie:shelved:2018', 'Shelved', 'shelved', 2018, 5.0, true, '{"tmdb":"102"}')`, [HEIST, SEQUEL, SHELVED, LIB]);
    await client.query(`insert into collections (id, library_id, provider_id, name) values ($1, $2, '7', 'The Heist Collection')`, [COLLECTION, LIB]);
    await client.query(`insert into collection_members (collection_id, media_item_id, position) values ($1, $2, 0), ($1, $3, 1)`, [COLLECTION, HEIST, SEQUEL]);
    // Enrichment recorded three collection members; the library only holds two.
    await client.query(`insert into collection_expected_members (collection_id, tmdb_id, title, year, release_date) values
      ($1, '100', 'The Heist', 2010, '2010-05-01'),
      ($1, '101', 'The Heist 2', 2014, '2014-05-01'),
      ($1, '103', 'The Heist 3', 2019, '2019-05-01')`, [COLLECTION]);
  });

  afterEach(async () => { globalThis.fetch = originalFetch; await client.close(); });

  it('runs settings, picker, gaps, collections, queue, and export/import with no network', async () => {
    // Every assertion below happens with the network hard-failed (§8.1).
    const offline = vi.fn(async () => { throw new Error('network disabled'); });
    globalThis.fetch = offline as unknown as typeof fetch;

    const catalog = new CatalogService(database);
    const settings = new UserSettingsService(database);
    const collections = new UserCollectionsService(database);
    const queue = new QueueService(database);
    const watchData = new WatchDataService(database);

    // §1 settings: created on demand, default off, and persisted on update.
    expect(await settings.get(USER)).toMatchObject({ showCollectionGaps: false });
    expect(await settings.update(USER, { showCollectionGaps: true })).toMatchObject({ showCollectionGaps: true });
    expect(await settings.get(USER)).toMatchObject({ showCollectionGaps: true });

    // §2 random picker: filters combine, and an impossible filter empties the pool.
    const picked = await catalog.randomItem({ kind: 'movie', yearMin: 2010, yearMax: 2014, ratingMin: 6 });
    expect([HEIST, SEQUEL]).toContain(picked?.id);
    expect(await catalog.randomItem({ yearMin: 2030 })).toBeNull();

    // §3 gaps: absent only with the setting off, present and marked when on.
    const plain = await catalog.collection(COLLECTION) as Record<string, unknown>;
    expect(plain.missing).toBeUndefined();
    const gapped = await catalog.collection(COLLECTION, true) as { titles: Array<{ id: string }>; missing: Array<{ tmdbId: string; inLibrary: false }> };
    expect(gapped.titles.map((title) => title.id)).toEqual([HEIST, SEQUEL]);
    expect(gapped.missing).toEqual([expect.objectContaining({ tmdbId: '103', title: 'The Heist 3', inLibrary: false })]);

    // §4 user collections: create, add (idempotent), reorder, remove.
    const mine = await collections.create(USER, { name: 'Heist night' });
    await collections.addItem(USER, mine.id, HEIST);
    await collections.addItem(USER, mine.id, SEQUEL);
    await collections.addItem(USER, mine.id, HEIST);
    expect((await collections.get(USER, mine.id)).items.map((item) => item.id)).toEqual([HEIST, SEQUEL]);
    expect((await collections.reorder(USER, mine.id, [SEQUEL, HEIST])).items.map((item) => item.id)).toEqual([SEQUEL, HEIST]);

    // §5 queue: advances in order, skips an archived entry, then stops.
    await queue.add(USER, HEIST);
    await queue.add(USER, SHELVED);
    await queue.add(USER, SEQUEL);
    await catalog.archiveItem(SHELVED);
    expect((await queue.next(USER))?.id).toBe(HEIST);
    expect((await queue.next(USER, HEIST))?.id).toBe(SEQUEL);
    expect(await queue.next(USER, SEQUEL)).toBeNull();
    // The archived title stays queued and is flagged rather than dropped.
    expect((await queue.list(USER)).find((item) => item.id === SHELVED)).toMatchObject({ unavailable: true });

    // §6 export/import: round-trip into a different user, matched by provider id.
    await client.query(`insert into playback_progress (user_id, media_item_id, position_seconds, watched) values ($1, $2, 640, false)`, [USER, HEIST]);
    await client.query(`insert into watchlist_entries (user_id, media_item_id) values ($1, $2)`, [USER, SEQUEL]);
    const document = await watchData.exportFor(USER);
    expect(JSON.stringify(document)).not.toContain(HEIST);

    const summary = await watchData.importDocument(FRESH, {
      ...document,
      progress: [...document.progress, { match: { tmdbId: '999', title: 'Never Owned', year: 1999, kind: 'movie' }, positionSeconds: 5, watched: false }],
    });
    expect(summary.unmatched).toEqual([expect.objectContaining({ title: 'Never Owned' })]);
    const restored = await watchData.exportFor(FRESH);
    expect(restored.progress).toEqual([expect.objectContaining({ match: expect.objectContaining({ tmdbId: '100' }), positionSeconds: 640 })]);
    expect(restored.watchlist).toEqual([expect.objectContaining({ match: expect.objectContaining({ tmdbId: '101' }) })]);
    expect(restored.collections).toEqual([expect.objectContaining({ name: 'Heist night' })]);
    // Re-importing the same document writes nothing new.
    expect((await watchData.importDocument(FRESH, document)).written).toBe(0);

    expect(offline).not.toHaveBeenCalled();
  });

  it('imports a mocked Plex history and reports what it could not match', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/library/sections')) return new Response(JSON.stringify({ MediaContainer: { Directory: [{ key: '1', type: 'movie', title: 'Movies' }] } }), { status: 200 });
      return new Response(JSON.stringify({ MediaContainer: { Metadata: [
        { type: 'movie', title: 'The Heist', year: 2010, viewCount: 1, viewOffset: 0, lastViewedAt: 1_700_000_000, Guid: [{ id: 'tmdb://100' }] },
        { type: 'movie', title: 'The Heist 2', year: 2014, viewCount: 0, viewOffset: 300_000, Guid: [{ id: 'tmdb://101' }] },
        { type: 'movie', title: 'Foreign Film', year: 1999, viewCount: 1, viewOffset: 0, Guid: [{ id: 'tmdb://777' }] },
      ] } }), { status: 200 });
    });
    const { entries, errors } = await new PlexHistorySource(fetcher as never).read({ baseUrl: 'http://plex.local:32400', token: 'secret' });
    expect(errors).toEqual([]);

    const summary = await new WatchDataService(database).importProgress(USER, entries);
    expect(summary).toMatchObject({ matched: 2, written: 2 });
    expect(summary.unmatched).toEqual([expect.objectContaining({ title: 'Foreign Film' })]);
    const rows = (await client.query<{ media_item_id: string; position_seconds: number; watched: boolean }>(
      `select media_item_id, position_seconds, watched from playback_progress where user_id = $1 order by position_seconds`, [USER])).rows;
    expect(rows).toEqual([
      { media_item_id: HEIST, position_seconds: 0, watched: true },
      { media_item_id: SEQUEL, position_seconds: 300, watched: false },
    ]);
  });
});
