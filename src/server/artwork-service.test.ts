import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtworkService, ArtworkPathError } from './artwork-service.ts';
import type { Database } from './db/client.ts';
import type { TmdbClient } from './tmdb.ts';
import type { ImageStore } from './images.ts';

const LIB = '10000000-0000-4000-8000-000000000001';
const MOVIE = '20000000-0000-4000-8000-000000000001';
const NO_ID = '20000000-0000-4000-8000-000000000002';

describe('ArtworkService', () => {
  let client: PGlite;
  let database: Database;
  let cache: ReturnType<typeof vi.fn>;
  let getImages: ReturnType<typeof vi.fn>;
  let service: ArtworkService;

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, provider_ids) values ($1, $2, 'movie', 'movie:one', 'One', 'one', '{"tmdb":"42"}')`, [MOVIE, LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'movie', 'movie:two', 'Two', 'two')`, [NO_ID, LIB]);

    cache = vi.fn(async () => {});
    getImages = vi.fn(async () => ({ posters: ['/p1.jpg', '/p2.jpg'], backdrops: ['/b1.jpg'], logos: [] }));
    service = new ArtworkService(database, { getImages } as unknown as TmdbClient, { cache } as unknown as ImageStore);
  });

  afterEach(async () => { await client.close(); });

  it('lists provider artwork with preview URLs for a matched title', async () => {
    const options = await service.options(MOVIE);
    expect(getImages).toHaveBeenCalledWith('movie', 42);
    expect(options?.posters).toEqual([
      { path: '/p1.jpg', previewUrl: 'https://image.tmdb.org/t/p/w342/p1.jpg' },
      { path: '/p2.jpg', previewUrl: 'https://image.tmdb.org/t/p/w342/p2.jpg' },
    ]);
    expect(options?.backdrops[0]).toMatchObject({ path: '/b1.jpg', previewUrl: 'https://image.tmdb.org/t/p/w780/b1.jpg' });
  });

  it('returns empty options when the title has no provider id', async () => {
    expect(await service.options(NO_ID)).toEqual({ posters: [], backdrops: [] });
    expect(getImages).not.toHaveBeenCalled();
  });

  it('caches and applies a chosen poster, exposing a local URL', async () => {
    const result = await service.apply(MOVIE, { posterPath: '/p2.jpg' });
    expect(cache).toHaveBeenCalledWith('/p2.jpg');
    expect(result).toMatchObject({ id: MOVIE, posterUrl: '/api/v1/images/p2.jpg' });
    const { rows } = await client.query<{ poster_path: string }>(`select poster_path from media_items where id = $1`, [MOVIE]);
    expect(rows[0]?.poster_path).toBe('/p2.jpg');
  });

  it('rejects malformed image paths', async () => {
    await expect(service.apply(MOVIE, { posterPath: 'https://evil.test/x.jpg' })).rejects.toBeInstanceOf(ArtworkPathError);
  });

  it('returns null for an unknown item', async () => {
    expect(await service.options('00000000-0000-4000-8000-0000000000aa')).toBeNull();
  });
});
