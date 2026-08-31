import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnrichmentService } from './enrichment.ts';
import type { Database } from './db/client.ts';
import type { ImageStore } from './images.ts';
import type { TmdbClient, TmdbMetadata } from './tmdb.ts';

const LIBRARY = '10000000-0000-4000-8000-000000000001';
const MOVIE = '20000000-0000-4000-8000-000000000001';
const NEIGHBOUR = '20000000-0000-4000-8000-000000000002';

const metadata: TmdbMetadata = {
  id: 100, kind: 'movie', title: 'One', originalTitle: 'Uno', overview: 'A film', releaseDate: '2020-05-01', year: 2020, tagline: 'Tagline',
  runtimeMinutes: 120, contentRating: 'PG-13', rating: 7.5, posterPath: '/p.jpg', backdropPath: '/b.jpg',
  genres: [{ id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }],
  cast: [{ personId: 1, name: 'Actor A', character: 'Hero', order: 0, profilePath: '/a.jpg' }, { personId: 2, name: 'Actor B', character: 'Villain', order: 1 }],
  recommendations: [{ id: 200, kind: 'movie', title: 'Two' }, { id: 999, kind: 'movie', title: 'Missing' }],
  collection: { id: 7, name: 'Saga', posterPath: '/c.jpg' },
  externalIds: { imdb_id: 'tt1' },
};

describe('EnrichmentService', () => {
  let client: PGlite;
  let database: Database;
  let cached: (string | undefined)[];
  let service: EnrichmentService;

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIBRARY]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'movie', 'movie:one:2020', 'One', 'one')`, [MOVIE, LIBRARY]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, provider_ids) values ($1, $2, 'movie', 'movie:two:2021', 'Two', 'two', '{"tmdb":"200"}')`, [NEIGHBOUR, LIBRARY]);

    cached = [];
    const images = { cache: vi.fn(async (path?: string | null) => { cached.push(path ?? undefined); }) } as unknown as ImageStore;
    const tmdb = { find: vi.fn(async () => metadata) } as unknown as TmdbClient;
    service = new EnrichmentService(database, tmdb, images);
  });

  afterEach(async () => { await client.close(); });

  const count = async (table: string, where: string, params: unknown[]) => Number((await client.query<{ c: string }>(`select count(*)::text as c from ${table} where ${where}`, params)).rows[0]?.c);

  it('persists additive fields, genres, cast, collection, and local recommendations', async () => {
    await service.enrich(LIBRARY, MOVIE, 'movie', 'One', 2020);

    const item = (await client.query<{ overview: string; tagline: string; provider_rating: number; content_rating: string; enrichment_version: number; original_title: string }>(
      `select overview, tagline, provider_rating, content_rating, enrichment_version, original_title from media_items where id = $1`, [MOVIE])).rows[0];
    expect(item).toMatchObject({ overview: 'A film', tagline: 'Tagline', content_rating: 'PG-13', original_title: 'Uno' });
    expect(Number(item?.provider_rating)).toBeCloseTo(7.5);
    expect(item?.enrichment_version).toBe(1);

    expect(await count('media_item_genres', 'media_item_id = $1', [MOVIE])).toBe(2);
    expect(await count('cast_credits', 'media_item_id = $1', [MOVIE])).toBe(2);
    expect(await count('collection_members', 'media_item_id = $1', [MOVIE])).toBe(1);
    // Only the recommendation that resolves to a present local item becomes an edge.
    expect(await count('recommendation_edges', 'source_media_item_id = $1', [MOVIE])).toBe(1);
    const edge = (await client.query<{ recommended_media_item_id: string }>(`select recommended_media_item_id from recommendation_edges where source_media_item_id = $1`, [MOVIE])).rows[0];
    expect(edge?.recommended_media_item_id).toBe(NEIGHBOUR);
    expect(cached).toEqual(expect.arrayContaining(['/p.jpg', '/b.jpg', '/c.jpg', '/a.jpg']));
  });

  it('is idempotent across repeated enrichment', async () => {
    await service.enrich(LIBRARY, MOVIE, 'movie', 'One', 2020);
    await service.enrich(LIBRARY, MOVIE, 'movie', 'One', 2020);

    expect(await count('genres', 'library_id = $1', [LIBRARY])).toBe(2);
    expect(await count('people', 'library_id = $1', [LIBRARY])).toBe(2);
    expect(await count('media_item_genres', 'media_item_id = $1', [MOVIE])).toBe(2);
    expect(await count('cast_credits', 'media_item_id = $1', [MOVIE])).toBe(2);
    expect(await count('collection_members', 'media_item_id = $1', [MOVIE])).toBe(1);
    expect(await count('recommendation_edges', 'source_media_item_id = $1', [MOVIE])).toBe(1);
  });

  it('explicit matching marks the provider and clears stale metadata and relationships', async () => {
    await service.enrich(LIBRARY, MOVIE, 'movie', 'One', 2020);
    const replacement: TmdbMetadata = { id: 321, kind: 'movie', title: 'Replacement', genres: [], cast: [], recommendations: [], externalIds: {} };
    const explicit = new EnrichmentService(database, { getById: vi.fn(async () => replacement) } as unknown as TmdbClient, { cache: vi.fn(async () => undefined) } as unknown as ImageStore);
    await expect(explicit.enrich(LIBRARY, MOVIE, 'movie', 'One', 2020, 321, true)).resolves.toBe(true);
    const row = (await client.query<{ provider_ids: Record<string, string>; overview: string | null; poster_path: string | null }>(`select provider_ids, overview, poster_path from media_items where id = $1`, [MOVIE])).rows[0];
    expect(row).toMatchObject({ provider_ids: { tmdb: '321', tmdbUserMatched: 'true' }, overview: null, poster_path: null });
    expect(await count('media_item_genres', 'media_item_id = $1', [MOVIE])).toBe(0);
    expect(await count('cast_credits', 'media_item_id = $1', [MOVIE])).toBe(0);
    expect(await count('collection_members', 'media_item_id = $1', [MOVIE])).toBe(0);
    expect(await count('recommendation_edges', 'source_media_item_id = $1', [MOVIE])).toBe(0);

    const find = vi.fn(async () => ({ ...metadata, id: 999 }));
    const getById = vi.fn(async () => replacement);
    const rescan = new EnrichmentService(database, { find, getById } as unknown as TmdbClient, { cache: vi.fn(async () => undefined) } as unknown as ImageStore);
    await rescan.enrich(LIBRARY, MOVIE, 'movie', 'Changed Filename', 1999);
    const afterRescan = (await client.query<{ provider_ids: Record<string, string> }>(`select provider_ids from media_items where id = $1`, [MOVIE])).rows[0];
    expect(afterRescan?.provider_ids).toMatchObject({ tmdb: '321', tmdbUserMatched: 'true' });
    expect(getById).toHaveBeenCalledWith('movie', 321);
    expect(find).not.toHaveBeenCalled();
  });

  it('enriches a season and episode from the parent series TMDB id', async () => {
    const SERIES = '30000000-0000-4000-8000-000000000001';
    const SEASON = '30000000-0000-4000-8000-000000000002';
    const EPISODE = '30000000-0000-4000-8000-000000000003';
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, provider_ids) values ($1, $2, 'series', 'series:show', 'Show', 'show', '{"tmdb":"500"}')`, [SERIES, LIBRARY]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number) values ($1, $2, $3, 'season', 'series:show:season:1', 'Season 1', '001', 1)`, [SEASON, LIBRARY, SERIES]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number, episode_number) values ($1, $2, $3, 'episode', 'episode:show:1:1', 'Episode 1', 'episode 1', 1, 1)`, [EPISODE, LIBRARY, SEASON]);

    const tmdb = {
      getSeason: vi.fn(async () => ({ id: 800, seriesId: 500, seasonNumber: 1, title: 'Season One', overview: 'S1', airDate: '2010-01-01', year: 2010, posterPath: '/sp.jpg', episodes: [] })),
      getEpisode: vi.fn(async () => ({ id: 900, seriesId: 500, seasonNumber: 1, episodeNumber: 1, title: 'Pilot', overview: 'E1', airDate: '2010-01-02', year: 2010, rating: 8.1, stillPath: '/still.jpg' })),
    } as unknown as TmdbClient;
    const local = new EnrichmentService(database, tmdb, { cache: vi.fn(async (path?: string | null) => { cached.push(path ?? undefined); }) } as unknown as ImageStore);

    await local.enrichEpisode(SERIES, SEASON, EPISODE, 1, 1);

    const ep = (await client.query<{ title: string; overview: string; backdrop_path: string; provider_ids: Record<string, string>; metadata_source: string }>(
      `select title, overview, backdrop_path, provider_ids, metadata_source from media_items where id = $1`, [EPISODE])).rows[0];
    expect(ep).toMatchObject({ title: 'Pilot', overview: 'E1', backdrop_path: '/still.jpg', metadata_source: 'tmdb' });
    expect(ep?.provider_ids).toMatchObject({ tmdb: '900' });
    const season = (await client.query<{ title: string; poster_path: string; overview: string }>(
      `select title, poster_path, overview from media_items where id = $1`, [SEASON])).rows[0];
    expect(season).toMatchObject({ title: 'Season One', poster_path: '/sp.jpg', overview: 'S1' });
    expect(cached).toEqual(expect.arrayContaining(['/sp.jpg', '/still.jpg']));
  });

  it('skips episode enrichment when the parent series has no TMDB id', async () => {
    const SERIES = '31000000-0000-4000-8000-000000000001';
    const EPISODE = '31000000-0000-4000-8000-000000000003';
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'series', 'series:noid', 'NoId', 'noid')`, [SERIES, LIBRARY]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title) values ($1, $2, $3, 'episode', 'episode:noid:1:1', 'Episode 1', 'episode 1')`, [EPISODE, LIBRARY, SERIES]);
    const getEpisode = vi.fn(async () => null);
    const local = new EnrichmentService(database, { getSeason: vi.fn(async () => null), getEpisode } as unknown as TmdbClient, { cache: vi.fn(async () => {}) } as unknown as ImageStore);

    await local.enrichEpisode(SERIES, SERIES, EPISODE, 1, 1);
    expect(getEpisode).not.toHaveBeenCalled();
  });

  it('records an attempt without clobbering data when the provider returns nothing', async () => {
    const tmdb = { find: vi.fn(async () => null) } as unknown as TmdbClient;
    const images = { cache: vi.fn(async () => {}) } as unknown as ImageStore;
    const failing = new EnrichmentService(database, tmdb, images);
    await failing.enrich(LIBRARY, MOVIE, 'movie', 'One', 2020);

    const item = (await client.query<{ enrichment_last_attempt_at: string | null; enrichment_last_success_at: string | null }>(
      `select enrichment_last_attempt_at, enrichment_last_success_at from media_items where id = $1`, [MOVIE])).rows[0];
    expect(item?.enrichment_last_attempt_at).not.toBeNull();
    expect(item?.enrichment_last_success_at).toBeNull();
  });
});
