import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog-service.ts';
import { EnrichmentService } from './enrichment.ts';
import { negotiatePlayback } from './playback.ts';
import type { Database } from './db/client.ts';
import type { ImageStore } from './images.ts';
import type { TmdbClient, TmdbMetadata } from './tmdb.ts';

const LIB = '10000000-0000-4000-8000-000000000001';
const MOVIE = '20000000-0000-4000-8000-000000000001';
const NEIGHBOUR = '20000000-0000-4000-8000-000000000002';
const FILE = '30000000-0000-4000-8000-000000000001';
const USER = '70000000-0000-4000-8000-000000000001';

const metadata: TmdbMetadata = {
  id: 100, kind: 'movie', title: 'Inception', originalTitle: 'Inception', overview: 'A heist inside dreams.', releaseDate: '2010-07-16', year: 2010, tagline: 'Your mind is the scene of the crime.',
  runtimeMinutes: 148, contentRating: 'PG-13', rating: 8.4, posterPath: '/p.jpg', backdropPath: '/b.jpg',
  genres: [{ id: 28, name: 'Action' }], cast: [{ personId: 1, name: 'Leonardo DiCaprio', character: 'Cobb', order: 0, profilePath: '/leo.jpg' }],
  recommendations: [{ id: 200, kind: 'movie', title: 'Two' }], collection: { id: 7, name: 'Saga', posterPath: '/c.jpg' }, externalIds: { imdb_id: 'tt1375666' },
};

const probe = { format: { format_name: 'mov,mp4' }, streams: [{ codec_type: 'video', codec_name: 'h264', height: 1080 }, { codec_type: 'audio', codec_name: 'aac' }] };

describe('offline catalog after enrichment', () => {
  let client: PGlite;
  let catalog: CatalogService;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    client = new PGlite('memory://');
    const database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    catalog = new CatalogService(database);

    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year) values ($1, $2, 'movie', 'movie:inception:2010', 'Inception', 'inception', 2010)`, [MOVIE, LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, poster_path, provider_ids) values ($1, $2, 'movie', 'movie:two:2011', 'Two', 'two', '/q.jpg', '{"tmdb":"200"}')`, [NEIGHBOUR, LIB]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at, duration_seconds) values ($1, $2, $3, 'Inception.mkv', 1000, now(), 8880)`, [FILE, MOVIE, LIB]);
    await client.query(`insert into media_technical_profiles (media_file_id, resolution_label, dynamic_range, video_codec, audio_codec, audio_channels) values ($1, '1080p', 'SDR', 'h264', 'aac', 'Stereo')`, [FILE]);

    // Enrich with deterministic provider data (fakes; no real network).
    const images = { cache: vi.fn(async () => {}) } as unknown as ImageStore;
    const tmdb = { find: vi.fn(async () => metadata) } as unknown as TmdbClient;
    await new EnrichmentService(database, tmdb, images).enrich(LIB, MOVIE, 'movie', 'Inception', 2010);
  });

  afterEach(async () => { globalThis.fetch = originalFetch; await client.close(); });

  it('serves home, search, details, and playback plans with no network access', async () => {
    const offline = vi.fn(() => { throw new Error('network disabled'); });
    globalThis.fetch = offline as unknown as typeof fetch;

    const home = await catalog.home(LIB, USER);
    const homeItem = home.sections.flatMap((section) => section.items).find((entry) => entry.id === MOVIE) as Record<string, unknown>;
    expect(homeItem).toMatchObject({ badge: '1080p', genres: ['Action'], collection: 'Saga' });

    const search = await catalog.search(LIB, 'Incep');
    const searchItem = search.groups.flatMap((group) => group.items).find((entry) => entry.id === MOVIE);
    expect(searchItem).toMatchObject({ badge: '1080p', genres: ['Action'] });

    const details = await catalog.item(MOVIE, USER) as Record<string, unknown>;
    expect(details).toMatchObject({ tagline: 'Your mind is the scene of the crime.', posterUrl: '/api/v1/images/p.jpg' });
    expect((details.cast as unknown[]).length).toBe(1);
    expect((details.recommendations as Array<{ id: string }>)[0]?.id).toBe(NEIGHBOUR);
    expect((details.genres as unknown[]).length).toBe(1);

    const plan = negotiatePlayback(probe, { containers: ['mp4'], videoCodecs: ['h264'], audioCodecs: ['aac'] });
    expect(plan.mode).toBe('direct');

    // No catalog or playback read touched the network.
    expect(offline).not.toHaveBeenCalled();
  });
});
