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
