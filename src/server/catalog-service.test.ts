import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CatalogService } from './catalog-service.ts';
import type { Database } from './db/client.ts';

const LIB = '10000000-0000-4000-8000-000000000001';
const MOVIE = '20000000-0000-4000-8000-000000000001';
const REC = '20000000-0000-4000-8000-000000000002';
const FILE = '30000000-0000-4000-8000-000000000001';
const GENRE = '40000000-0000-4000-8000-000000000001';
const PERSON = '50000000-0000-4000-8000-000000000001';
const COLLECTION = '60000000-0000-4000-8000-000000000001';
const USER = '70000000-0000-4000-8000-000000000001';

describe('CatalogService enrichment serialization', () => {
  let client: PGlite;
  let service: CatalogService;

  beforeEach(async () => {
    client = new PGlite('memory://');
    const database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    service = new CatalogService(database);

    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year, overview, tagline, content_rating, provider_rating, poster_path) values ($1, $2, 'movie', 'movie:one:2020', 'One', 'one', 2020, 'A film', 'Tagline', 'PG-13', 7.5, '/p.jpg')`, [MOVIE, LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, poster_path) values ($1, $2, 'movie', 'movie:two:2021', 'Two', 'two', '/q.jpg')`, [REC, LIB]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at, duration_seconds) values ($1, $2, $3, 'One.mkv', 1000, now(), 7500)`, [FILE, MOVIE, LIB]);
    await client.query(`insert into media_technical_profiles (media_file_id, resolution_label, dynamic_range, video_codec, audio_codec, audio_channels) values ($1, '4K', 'HDR10', 'hevc', 'eac3', '5.1')`, [FILE]);
    await client.query(`insert into genres (id, library_id, provider_id, name, normalized_name) values ($1, $2, '28', 'Action', 'action')`, [GENRE, LIB]);
    await client.query(`insert into media_item_genres (media_item_id, genre_id, position) values ($1, $2, 0)`, [MOVIE, GENRE]);
    await client.query(`insert into people (id, library_id, provider_id, name, profile_path) values ($1, $2, '42', 'Actor A', '/a.jpg')`, [PERSON, LIB]);
    await client.query(`insert into cast_credits (media_item_id, person_id, character, billing_order) values ($1, $2, 'Hero', 0)`, [MOVIE, PERSON]);
    await client.query(`insert into collections (id, library_id, provider_id, name, poster_path) values ($1, $2, '7', 'Saga', '/c.jpg')`, [COLLECTION, LIB]);
    await client.query(`insert into collection_members (collection_id, media_item_id, position) values ($1, $2, 0)`, [COLLECTION, MOVIE]);
    await client.query(`insert into recommendation_edges (source_media_item_id, recommended_media_item_id, position) values ($1, $2, 0)`, [MOVIE, REC]);
  });

  afterEach(async () => { await client.close(); });

  it('serializes full enriched details with local image URLs', async () => {
    const details = await service.item(MOVIE, USER) as Record<string, unknown>;
    expect(details.posterUrl).toBe('/api/v1/images/p.jpg');
    expect(details.tagline).toBe('Tagline');
    expect(details.runtime).toBe('2h 5m');
    expect(details.quality).toMatchObject({ badge: '4K HDR', resolutionLabel: '4K', audioChannels: '5.1' });
    expect(details.genres).toEqual([{ id: GENRE, name: 'Action' }]);
    expect(details.collection).toMatchObject({ name: 'Saga', posterUrl: '/api/v1/images/c.jpg' });
    expect(details.cast).toEqual([{ id: PERSON, name: 'Actor A', character: 'Hero', profileUrl: '/api/v1/images/a.jpg', order: 0 }]);
    const recs = details.recommendations as Array<{ id: string; posterUrl: string }>;
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ id: REC, posterUrl: '/api/v1/images/q.jpg' });
  });

  it('adds quality badge and genres to search results', async () => {
    const { groups } = await service.search(LIB, 'One');
    const item = groups.flatMap((group) => group.items).find((entry) => entry.id === MOVIE);
    expect(item).toMatchObject({ badge: '4K HDR', genres: ['Action'] });
  });

  it('adds badge, genres, and collection label to home items', async () => {
    const home = await service.home(LIB, USER);
    const item = home.sections.flatMap((section) => section.items).find((entry) => entry.id === MOVIE) as Record<string, unknown>;
    expect(item).toMatchObject({ badge: '4K HDR', genres: ['Action'], collection: 'Saga' });
  });

  it('builds single-kind home carousels: newly added movies as cards, new episodes as posters', async () => {
    const SERIES = '20000000-0000-4000-8000-000000000010';
    const EPISODE = '20000000-0000-4000-8000-000000000011';
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, backdrop_path) values ($1, $2, 'series', 'series:show:2020', 'Show', 'show', '/b.jpg')`, [SERIES, LIB]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number, episode_number, poster_path) values ($1, $2, $3, 'episode', 'episode:show:s1e1', 'Pilot', 'pilot', 1, 1, '/e.jpg')`, [EPISODE, LIB, SERIES]);
    await client.query(`insert into users (id, username, password_hash, role) values ($1, 'viewer', 'x', 'member')`, [USER]);
    await service.setWatchlist(USER, MOVIE, true);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at, duration_seconds) values ('30000000-0000-4000-8000-0000000000e1', $1, $2, 'Pilot.mkv', 1000, now(), 1000)`, [EPISODE, LIB]);
    await service.saveProgress(USER, EPISODE, 300, false);

    const home = await service.home(LIB, USER);

    const ongoing = home.sections.find((section) => section.id === 'continue-watching-episodes');
    expect(ongoing?.layout).toBe('poster');
    expect(ongoing?.items.map((entry) => entry.id)).toContain(EPISODE);

    const newlyAdded = home.sections.find((section) => section.id === 'newly-added');
    expect(newlyAdded?.layout).toBe('card');
    expect(newlyAdded?.items.some((entry) => entry.id === MOVIE)).toBe(true);

    const watchlistRow = home.sections.find((section) => section.id === 'watchlist');
    expect(watchlistRow?.title).toBe('Watch List');
    expect(watchlistRow?.items.map((entry) => entry.id)).toContain(MOVIE);

    const episodesRow = home.sections.find((section) => section.id === 'new-episodes');
    expect(episodesRow?.layout).toBe('poster');
    expect(episodesRow?.items.map((entry) => entry.id)).toContain(EPISODE);

    // No carousel may mix movies with shows/episodes.
    for (const section of home.sections) {
      const kinds = new Set(section.items.map((entry) => (entry as { kind: string }).kind));
      expect(kinds.size).toBeLessThanOrEqual(1);
    }
  });

  it('returns a person with every local title they are credited in', async () => {
    const person = await service.person(PERSON) as { id: string; name: string; profileUrl?: string; titles: Array<{ id: string; character?: string }> };
    expect(person).toMatchObject({ id: PERSON, name: 'Actor A', profileUrl: '/api/v1/images/a.jpg' });
    expect(person.titles.map((title) => title.id)).toContain(MOVIE);
    expect(person.titles.find((title) => title.id === MOVIE)?.character).toBe('Hero');
    expect(await service.person('00000000-0000-4000-8000-0000000000ff')).toBeNull();
  });

  it('marks a title watched without a position and reflects it on details', async () => {
    await client.query(`insert into users (id, username, password_hash, role) values ($1, 'viewer2', 'x', 'member')`, [USER]);
    await service.saveProgress(USER, MOVIE, undefined, true);
    const details = await service.item(MOVIE, USER) as Record<string, unknown>;
    expect(details.watched).toBe(true);
    expect(details.progress).toBe(1);
    await service.saveProgress(USER, MOVIE, undefined, false);
    const cleared = await service.item(MOVIE, USER) as Record<string, unknown>;
    expect(cleared.watched).toBe(false);
  });

  it('tolerates items with no enrichment', async () => {
    const details = await service.item(REC, USER) as Record<string, unknown>;
    expect(details.quality).toBeUndefined();
    expect(details.genres).toEqual([]);
    expect(details.cast).toEqual([]);
    expect(details.recommendations).toEqual([]);
  });
});
