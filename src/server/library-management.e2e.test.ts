import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog-service.ts';
import { EnrichmentService } from './enrichment.ts';
import { MetadataMatchService } from './metadata-match-service.ts';
import { parseMediaPath } from './media-parser.ts';
import { createTrailerFetcherPlugin, type TrailerDownloader } from './plugins/trailer-fetcher.ts';
import { createPreviewSpritePlugin } from './plugins/preview-sprites.ts';
import type { PreviewSpriteStore, SpriteTools } from './sprites.ts';
import type { Database } from './db/client.ts';
import type { ImageStore } from './images.ts';
import type { TmdbClient, TmdbMetadata, TmdbVideo } from './tmdb.ts';

const MOVIES_LIB = '10000000-0000-4000-8000-000000000001';
const SHOWS_LIB = '10000000-0000-4000-8000-000000000002';
const MOVIE = '20000000-0000-4000-8000-000000000001';
const SERIES = '20000000-0000-4000-8000-000000000002';
const SEASON = '20000000-0000-4000-8000-000000000003';
const EPISODE = '20000000-0000-4000-8000-000000000004';
const MOVIE_FILE = '30000000-0000-4000-8000-000000000001';
const EPISODE_FILE = '30000000-0000-4000-8000-000000000002';

const seriesMetadata: TmdbMetadata = {
  id: 999, kind: 'series', title: 'The Flash (rematched)', originalTitle: 'The Flash', overview: 'A speedster.', releaseDate: '2014-10-07', year: 2014,
  runtimeMinutes: 45, contentRating: 'TV-14', rating: 7.6, posterPath: '/flash.jpg', backdropPath: '/flash-bd.jpg', genres: [{ id: 18, name: 'Drama' }], cast: [], recommendations: [], externalIds: {},
};

const trailerVideo: TmdbVideo = { id: 'v1', key: 'yt-key', site: 'YouTube', name: 'Trailer', type: 'Trailer', official: true, language: 'en' };

const cleanupDirs: string[] = [];
afterEach(async () => { await Promise.all(cleanupDirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('library-management offline end-to-end', () => {
  let client: PGlite;
  let database: Database;
  let trailerRoot: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    trailerRoot = await mkdtemp(join(tmpdir(), 'dose-e2e-')); cleanupDirs.push(trailerRoot);

    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/movies'), ($2, 'Shows', 'shows', '/shows')`, [MOVIES_LIB, SHOWS_LIB]);
    // A movie with a real TMDB id so the trailer plugin considers it.
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year, provider_ids) values ($1, $2, 'movie', 'movie:the-heist:2010', 'The Heist', 'the heist', 2010, '{"tmdb":"42"}')`, [MOVIE, MOVIES_LIB]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at, duration_seconds) values ($1, $2, $3, 'The Heist.mkv', 1000, now(), 6000)`, [MOVIE_FILE, MOVIE, MOVIES_LIB]);
    // A show hierarchy in a separate library so search must aggregate both.
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year, provider_ids) values ($1, $2, 'series', 'series:the-flash', 'The Flash', 'the flash', 2014, '{"tmdb":"60735"}')`, [SERIES, SHOWS_LIB]);
    await client.query(`insert into media_items (id, library_id, kind, parent_id, natural_key, title, sort_title) values ($1, $2, 'season', $3, 'season:the-flash:1', 'Season 1', 'season 1')`, [SEASON, SHOWS_LIB, SERIES]);
    await client.query(`insert into media_items (id, library_id, kind, parent_id, natural_key, title, sort_title) values ($1, $2, 'episode', $3, 'episode:the-flash:1:1', 'Pilot', 'pilot')`, [EPISODE, SHOWS_LIB, SEASON]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at, duration_seconds) values ($1, $2, $3, 'The flash/Season 1/The flash S01E01.mp4', 1000, now(), 2700)`, [EPISODE_FILE, EPISODE, SHOWS_LIB]);
  });

  afterEach(async () => { globalThis.fetch = originalFetch; await client.close(); });

  it('imports mixed naming, searches both groups, archives, re-matches, and serves trailers/sprites with no network', async () => {
    // Requirement §1: a broad set of naming conventions classify correctly.
    expect(parseMediaPath('The flash/Season 1/The flash S01E01.mp4', 'shows')).toMatchObject({ type: 'episode', season: 1, episode: 1 });
    expect(parseMediaPath('The Flash/Series 3/Episode 4.mkv', 'shows')).toMatchObject({ type: 'episode', season: 3, episode: 4 });
    expect(parseMediaPath('The Flash/S02/The.Flash.S02E05.1080p.mkv', 'shows')).toMatchObject({ type: 'episode', season: 2, episode: 5 });
    expect(parseMediaPath('Inception (2010).mkv', 'movies')).toMatchObject({ type: 'movie', year: 2010 });
    // A movies library never files an episode-marked file as a bogus movie.
    expect(parseMediaPath('Some.Show.S01E01.mkv', 'movies')).toBeNull();

    // Everything below must run without touching the network.
    const offline = vi.fn(() => { throw new Error('network disabled'); });
    globalThis.fetch = offline as unknown as typeof fetch;

    const catalog = new CatalogService(database, trailerRoot);

    // Search aggregates across libraries: both a Movies and a Shows group appear.
    const search = await catalog.search(undefined, 'the');
    expect(search.groups.map((group) => group.id)).toEqual(expect.arrayContaining(['movies', 'shows']));
    expect(search.groups.find((group) => group.id === 'movies')?.items.some((entry) => entry.id === MOVIE)).toBe(true);
    expect(search.groups.find((group) => group.id === 'shows')?.items.some((entry) => entry.id === SERIES)).toBe(true);

    // Trailer plugin downloads locally (mocked binary) and the catalog serves the file.
    const downloader: TrailerDownloader = { available: vi.fn(async () => true), download: vi.fn(async (_key, path) => { await writeFile(path, 'trailer'); }), update: vi.fn(async () => true) };
    const tmdb = { getVideos: vi.fn(async () => [trailerVideo]), find: vi.fn(async () => seriesMetadata), getById: vi.fn(async () => seriesMetadata) } as unknown as TmdbClient;
    await createTrailerFetcherPlugin(database, tmdb, downloader, trailerRoot).run!({ settings: { languages: ['en'], includeClips: false, qualityCap: '1080', storageDir: 'trailers', autoUpdate: true, updateIntervalDays: 7 }, signal: new AbortController().signal });
    const trailer = await catalog.localTrailerSource(MOVIE);
    expect(trailer?.localPath).toBeTruthy();

    // Preview-sprite plugin generates a storyboard (mocked ffmpeg) and persists a descriptor.
    const spriteTools = { generate: vi.fn(async () => {}) } as unknown as SpriteTools;
    const spriteStore = { ensureDir: vi.fn(async () => {}), pathFor: (key: string) => `/previews/${key}`, read: vi.fn() } as unknown as PreviewSpriteStore;
    await createPreviewSpritePlugin(database, spriteTools, spriteStore).run!({ settings: { interval: 10, columns: 5, tileWidth: 160, tileHeight: 90, maxTiles: 200 } as never, signal: new AbortController().signal });
    expect(await catalog.previewSprite(MOVIE)).toMatchObject({ columns: 5, storageKey: `${MOVIE_FILE}.jpg` });

    // Admin re-match reassigns TMDB identity and re-enriches offline.
    const images = { cache: vi.fn(async () => {}) } as unknown as ImageStore;
    const match = new MetadataMatchService(database, tmdb, new EnrichmentService(database, tmdb, images));
    const rematched = await match.match(SERIES, 999);
    expect(rematched?.posterPath).toBe('/flash.jpg');

    // Archiving hides the movie from members but keeps it in the admin table.
    await client.query(`update media_items set archived_at = now() where id = $1`, [MOVIE]);
    const memberSearch = await catalog.search(undefined, 'the');
    expect(memberSearch.groups.find((group) => group.id === 'movies')?.items.some((entry) => entry.id === MOVIE) ?? false).toBe(false);
    const adminArchived = await catalog.adminMediaList({ archived: true });
    expect(adminArchived.items.some((entry) => entry.id === MOVIE && entry.archived)).toBe(true);
    // Archived items no longer expose their local trailer to playback.
    expect(await catalog.localTrailerSource(MOVIE)).toBeNull();

    expect(offline).not.toHaveBeenCalled();
  }, 20_000);
});
