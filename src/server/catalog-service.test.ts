import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { join } from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CatalogService, managedTrailerPath } from './catalog-service.ts';
import type { Database } from './db/client.ts';
import { PluginEventBus } from './plugins/events.ts';
import { vi } from 'vitest';

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
  let database: Database;

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
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

  it('randomly selects only visible top-level titles matching every filter', async () => {
    const SERIES = '20000000-0000-4000-8000-000000000010';
    const ARCHIVED = '20000000-0000-4000-8000-000000000011';
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year, provider_rating) values ($1, $2, 'series', 'series:ten:2022', 'Ten', 'ten', 2022, 8.6)`, [SERIES, LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year, provider_rating, available, archived_at) values ($1, $2, 'movie', 'movie:hidden:2022', 'Hidden', 'hidden', 2022, 9.9, false, now())`, [ARCHIVED, LIB]);
    await client.query(`insert into media_item_genres (media_item_id, genre_id, position) values ($1, $2, 0)`, [SERIES, GENRE]);

    await expect(service.randomItem({ kind: 'series', genre: 'action', yearMin: 2020, yearMax: 2023, ratingMin: 8 })).resolves.toMatchObject({ id: SERIES, title: 'Ten', kind: 'series' });
    await expect(service.randomItem({ kind: 'movie', yearMin: 2022, ratingMin: 9 })).resolves.toBeNull();
    await expect(service.randomItem()).resolves.toEqual(expect.objectContaining({ id: expect.stringMatching(/.+/) }));
  });

  it('includes matching people in search results', async () => {
    const { groups } = await service.search(LIB, 'Actor');
    const people = groups.find((group) => group.id === 'people');
    expect(people?.items.map((item) => item.id)).toContain(PERSON);
    expect(people?.items.find((item) => item.id === PERSON)).toMatchObject({ kind: 'person', title: 'Actor A' });
  });

  it('archives without deleting metadata, progress, or watchlist and hides the item from member reads', async () => {
    await client.query(`insert into users (id, username, password_hash, role) values ($1, 'member', 'hash', 'member')`, [USER]);
    await client.query(`insert into media_subtitles (media_file_id, stream_index, storage_key, label) values ($1, 0, 'subtitles/one.vtt', 'English')`, [FILE]);
    await service.saveProgress(USER, MOVIE, 120, false);
    await service.setWatchlist(USER, MOVIE, true);
    const archivedAt = new Date('2026-08-30T09:00:00Z');

    await service.archiveItem(MOVIE, archivedAt);

    expect(await service.item(MOVIE, USER)).toBeNull();
    expect((await service.search(LIB, 'One')).groups.flatMap((group) => group.items)).toHaveLength(0);
    expect((await service.home(LIB, USER)).sections.flatMap((section) => section.items).map((item) => item.id)).not.toContain(MOVIE);
    expect((await service.genre(GENRE))?.titles).toHaveLength(0);
    expect((await service.category('action'))?.titles).toHaveLength(0);
    expect((await service.collection(COLLECTION))?.titles).toHaveLength(0);
    expect((await service.person(PERSON))?.titles).toHaveLength(0);
    // The file deliberately remains available: item visibility is still authoritative.
    expect(await service.playbackSource(MOVIE)).toBeNull();
    expect(await service.subtitlesForItem(MOVIE)).toEqual([]);

    const archived = await service.adminItems({ archived: true, sort: 'archivedAt' });
    expect(archived).toEqual(expect.arrayContaining([expect.objectContaining({ id: MOVIE, available: false, archivedAt })]));
    for (const table of ['playback_progress', 'watchlist_entries', 'media_item_genres', 'cast_credits']) {
      const result = await client.query<{ total: string }>(`select count(*)::text as total from ${table} where media_item_id = $1`, [MOVIE]);
      expect(result.rows[0]?.total).toBe('1');
    }

    await service.unarchiveItem(MOVIE);
    expect(await service.item(MOVIE, USER)).not.toBeNull();
    expect((await service.adminItems({ archived: false })).find((item) => item.id === MOVIE)?.archivedAt).toBeNull();

    await service.archiveItem(REC, archivedAt);
    const details = await service.item(MOVIE, USER);
    expect(details?.recommendations.map((item) => item.id)).not.toContain(REC);
  });

  it('rolls episode archive state up to its season and series and restores ancestors', async () => {
    const SERIES = '25000000-0000-4000-8000-000000000001';
    const SEASON = '25000000-0000-4000-8000-000000000002';
    const EPISODE = '25000000-0000-4000-8000-000000000003';
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'series', 'series:archive', 'Archive Show', 'archive show')`, [SERIES, LIB]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number) values ($1, $2, $3, 'season', 'season:archive:1', 'Season 1', '001', 1)`, [SEASON, LIB, SERIES]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number, episode_number) values ($1, $2, $3, 'episode', 'episode:archive:1:1', 'Pilot', 'pilot', 1, 1)`, [EPISODE, LIB, SEASON]);

    await service.archiveItem(EPISODE, new Date('2026-08-30T09:00:00Z'));
    const rolledUp = await service.adminItems({ archived: true });
    expect(rolledUp.map((item) => item.id)).toEqual(expect.arrayContaining([SERIES, SEASON, EPISODE]));

    await service.unarchiveItem(EPISODE);
    const restored = await service.adminItems({ archived: false });
    expect(restored.map((item) => item.id)).toEqual(expect.arrayContaining([SERIES, SEASON, EPISODE]));
  });

  it('searches across every library when no library is specified', async () => {
    const SHOWS = '11000000-0000-4000-8000-000000000001';
    const SERIES = '21000000-0000-4000-8000-000000000001';
    const SEASON = '21000000-0000-4000-8000-000000000002';
    const EPISODE = '21000000-0000-4000-8000-000000000003';
    const EPFILE = '31000000-0000-4000-8000-000000000002';
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Shows', 'shows', '/tv')`, [SHOWS]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'series', 'series:oneshow', 'One Show', 'one show')`, [SERIES, SHOWS]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number) values ($1, $2, $3, 'season', 'series:oneshow:season:1', 'Season 1', '001', 1)`, [SEASON, SHOWS, SERIES]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number, episode_number) values ($1, $2, $3, 'episode', 'episode:oneshow:1:1', 'Pilot', 'pilot', 1, 1)`, [EPISODE, SHOWS, SEASON]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at) values ($1, $2, $3, 'One Show S01E01.mkv', 1000, now())`, [EPFILE, EPISODE, SHOWS]);

    // A movies-only scope never reaches the show in the other library.
    const scoped = await service.search(LIB, 'One');
    expect(scoped.groups.find((group) => group.id === 'shows')).toBeUndefined();
    expect(scoped.groups.flatMap((group) => group.items).map((item) => item.id)).toContain(MOVIE);

    // Aggregated search reaches both the movie and the show.
    const all = await service.search(undefined, 'One');
    const shows = all.groups.find((group) => group.id === 'shows');
    expect(shows?.items.map((item) => item.id)).toContain(SERIES);
    expect(all.groups.flatMap((group) => group.items).map((item) => item.id)).toEqual(expect.arrayContaining([MOVIE, SERIES]));
  });

  it('lists, searches, and removes titles for the admin media table', async () => {
    const list = await service.adminMediaList({ sort: 'title', direction: 'asc' });
    expect(list.total).toBeGreaterThanOrEqual(2);
    const one = list.items.find((item) => item.id === MOVIE);
    expect(one).toMatchObject({ title: 'One', kind: 'movie', library: 'Movies', archived: false, archivedAt: null });
    expect(one?.posterUrl).toBe('/api/v1/images/p.jpg');

    const filtered = await service.adminMediaList({ query: 'One' });
    expect(filtered.items.map((item) => item.id)).toContain(MOVIE);
    expect(filtered.items.every((item) => item.title.toLowerCase().includes('one'))).toBe(true);

    expect(await service.removeItem(MOVIE)).toBe(true);
    expect(await service.removeItem(MOVIE)).toBe(false);
    expect((await service.adminMediaList()).items.map((item) => item.id)).not.toContain(MOVIE);
    // Cascade removed the file too.
    expect((await client.query(`select count(*)::text as c from media_files where id = $1`, [FILE])).rows[0]).toMatchObject({ c: '0' });
  });

  it('lists and opens categories merged by name across libraries', async () => {
    const SHOWS = '12000000-0000-4000-8000-000000000001';
    const SERIES = '22000000-0000-4000-8000-000000000001';
    const G2 = '42000000-0000-4000-8000-000000000001';
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Shows', 'shows', '/tv')`, [SHOWS]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'series', 'series:actionshow', 'Action Show', 'action show')`, [SERIES, SHOWS]);
    await client.query(`insert into genres (id, library_id, provider_id, name, normalized_name) values ($1, $2, '28', 'Action', 'action')`, [G2, SHOWS]);
    await client.query(`insert into media_item_genres (media_item_id, genre_id, position) values ($1, $2, 0)`, [SERIES, G2]);

    // One "Action" tile aggregating the movie (Movies lib) and the show (Shows lib).
    const { categories } = { categories: await service.categories() };
    const action = categories.find((category) => category.key === 'action');
    expect(action).toMatchObject({ name: 'Action', count: 2 });

    const opened = await service.category('action');
    expect(opened?.name).toBe('Action');
    expect(opened?.titles.map((title) => title.id)).toEqual(expect.arrayContaining([MOVIE, SERIES]));

    // Library-scoped view only counts that library's titles.
    const scoped = await service.categories(LIB);
    expect(scoped.find((category) => category.key === 'action')).toMatchObject({ count: 1 });
    expect(await service.category('nope')).toBeNull();
  });

  it('adds badge, genres, and collection label to home items', async () => {
    const home = await service.home(LIB, USER);
    const item = home.sections.flatMap((section) => section.items).find((entry) => entry.id === MOVIE) as Record<string, unknown>;
    expect(item).toMatchObject({ badge: '4K HDR', genres: ['Action'], collection: 'Saga' });
    // The hero exposes whether a local trailer can back it; none is configured here.
    expect(home.featured).toMatchObject({ hasLocalTrailer: false });
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

  it('gives home episodes their show artwork, name, and a route back to the series', async () => {
    const SERIES = '20000000-0000-4000-8000-000000000030';
    const SEASON = '20000000-0000-4000-8000-000000000031';
    const EPISODE = '20000000-0000-4000-8000-000000000032';
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, poster_path, backdrop_path) values ($1, $2, 'series', 'series:art:2020', 'Art Show', 'art show', '/series.jpg', '/series-b.jpg')`, [SERIES, LIB]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number, poster_path) values ($1, $2, $3, 'season', 'season:art:s1', 'Season 1', 'season 1', 1, '/season.jpg')`, [SEASON, LIB, SERIES]);
    // No poster of its own: the episode carries only a still, as scanners leave them.
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number, episode_number, backdrop_path) values ($1, $2, $3, 'episode', 'episode:art:s1e1', 'Opening', 'opening', 1, 1, '/still.jpg')`, [EPISODE, LIB, SEASON]);

    const home = await service.home(LIB, USER);
    const tile = home.sections.find((section) => section.id === 'new-episodes')?.items.find((entry) => entry.id === EPISODE);
    expect(tile).toMatchObject({ posterUrl: '/api/v1/images/season.jpg', backdropUrl: '/api/v1/images/still.jpg', seriesId: SERIES, seriesTitle: 'Art Show' });

    const details = await service.item(EPISODE, USER) as Record<string, unknown>;
    expect(details.parent).toMatchObject({ id: SEASON, kind: 'season', seasonNumber: 1 });
    expect(details.series).toMatchObject({ id: SERIES, title: 'Art Show' });
    // The info page borrows the same art: the season poster, its own still.
    expect(details).toMatchObject({ posterUrl: '/api/v1/images/season.jpg', backdropUrl: '/api/v1/images/still.jpg' });
    const season = await service.item(SEASON, USER) as Record<string, unknown>;
    expect(season.series).toMatchObject({ id: SERIES, title: 'Art Show' });
    // A season keeps its own poster and takes the series backdrop it lacks.
    expect(season).toMatchObject({ posterUrl: '/api/v1/images/season.jpg', backdropUrl: '/api/v1/images/series-b.jpg' });
  });

  it('tracks the next episode and surfaces watch-listed shows', async () => {
    const SERIES = '20000000-0000-4000-8000-000000000021';
    const SEASON = '20000000-0000-4000-8000-000000000022';
    const EP1 = '20000000-0000-4000-8000-000000000023';
    const EP2 = '20000000-0000-4000-8000-000000000024';
    await client.query(`insert into users (id, username, password_hash, role) values ($1, 'viewer3', 'x', 'member')`, [USER]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'series', 'series:show', 'Show', 'show')`, [SERIES, LIB]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number) values ($1, $2, $3, 'season', 'series:show:s1', 'Season 1', '001', 1)`, [SEASON, LIB, SERIES]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number, episode_number) values ($1, $2, $3, 'episode', 'ep:s1e1', 'Pilot', 'pilot', 1, 1)`, [EP1, LIB, SEASON]);
    await client.query(`insert into media_items (id, library_id, parent_id, kind, natural_key, title, sort_title, season_number, episode_number) values ($1, $2, $3, 'episode', 'ep:s1e2', 'Second', 'second', 1, 2)`, [EP2, LIB, SEASON]);

    const first = await service.item(EP1, USER) as Record<string, unknown>;
    expect(first.nextEpisodeId).toBe(EP2);
    const second = await service.item(EP2, USER) as Record<string, unknown>;
    expect(second.nextEpisodeId).toBeUndefined();

    await service.setWatchlist(USER, SERIES, true);
    const home = await service.home(LIB, USER);
    const showsWatchlist = home.sections.find((section) => section.id === 'watchlist-shows');
    expect(showsWatchlist?.layout).toBe('poster');
    expect(showsWatchlist?.items.map((entry) => entry.id)).toContain(SERIES);
  });

  it('returns collection gaps only when the caller opted in', async () => {
    await client.query(`update media_items set provider_ids = '{"tmdb":"100"}' where id = $1`, [MOVIE]);
    await client.query(`insert into collection_expected_members (collection_id, tmdb_id, title, year, release_date, poster_path) values
      ($1, '100', 'One', 2020, '2020-05-01', '/p.jpg'),
      ($1, '101', 'Two', 2022, '2022-05-01', '/two.jpg'),
      ($1, '102', 'Three', 2024, '2024-05-01', null)`, [COLLECTION]);

    const withoutGaps = await service.collection(COLLECTION) as Record<string, unknown>;
    expect(withoutGaps.missing).toBeUndefined();

    const withGaps = await service.collection(COLLECTION, true) as { missing: Array<{ tmdbId: string; title: string; year?: number; posterUrl?: string; inLibrary: false }> };
    expect(withGaps.missing.map((gap) => gap.tmdbId)).toEqual(['101', '102']);
    expect(withGaps.missing[0]).toMatchObject({ title: 'Two', year: 2022, posterUrl: '/api/v1/images/two.jpg', inLibrary: false });
    expect(withGaps.missing[1]?.posterUrl).toBeUndefined();
  });

  it('lists collections for the browse page, hiding those with no visible members', async () => {
    expect(await service.collectionsOverview()).toEqual([
      { id: COLLECTION, name: 'Saga', posterUrl: '/api/v1/images/c.jpg', count: 1 },
    ]);

    // Its only member sits above a restricted viewer's limit: the collection vanishes.
    await client.query(`update media_items set maturity_level = 17 where id = $1`, [MOVIE]);
    expect(await service.forViewer(13).collectionsOverview()).toEqual([]);
    expect(await service.forViewer(17).collectionsOverview()).toHaveLength(1);
  });

  it('returns a collection with its available parts', async () => {
    const collection = await service.collection(COLLECTION) as { id: string; name: string; posterUrl?: string; titles: Array<{ id: string; badge?: string }> };
    expect(collection).toMatchObject({ id: COLLECTION, name: 'Saga', posterUrl: '/api/v1/images/c.jpg' });
    expect(collection.titles.map((title) => title.id)).toContain(MOVIE);
    expect(await service.collection('00000000-0000-4000-8000-0000000000fd')).toBeNull();
  });

  it('returns every available title tagged with a genre', async () => {
    const genre = await service.genre(GENRE) as { id: string; name: string; titles: Array<{ id: string; badge?: string }> };
    expect(genre).toMatchObject({ id: GENRE, name: 'Action' });
    expect(genre.titles.map((title) => title.id)).toContain(MOVIE);
    expect(genre.titles.find((title) => title.id === MOVIE)?.badge).toBe('4K HDR');
    expect(await service.genre('00000000-0000-4000-8000-0000000000fe')).toBeNull();
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

  it('serves only contained, existing regular-file trailers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dose-trailers-'));
    try {
      const valid = join(root, 'valid.mp4'); const directory = join(root, 'directory'); const missing = join(root, 'missing.mp4'); const outside = `${root}-outside.mp4`;
      await writeFile(valid, 'video'); await mkdir(directory); await writeFile(outside, 'video');
      const trailerService = new CatalogService(database, root);
      await client.query(`insert into media_trailers (media_item_id, provider_id, site, key, name, type, preferred, local_path, status) values ($1, 'trailer', 'YouTube', 'key', 'Trailer', 'Trailer', true, $2, 'ready')`, [MOVIE, missing]);
      expect(await trailerService.localTrailerSource(MOVIE)).toBeNull();
      await client.query(`update media_trailers set local_path=$1 where media_item_id=$2`, [directory, MOVIE]); expect(await trailerService.localTrailerSource(MOVIE)).toBeNull();
      await client.query(`update media_trailers set local_path=$1 where media_item_id=$2`, [outside, MOVIE]); expect(await trailerService.localTrailerSource(MOVIE)).toBeNull();
      await client.query(`update media_trailers set local_path=$1 where media_item_id=$2`, [valid, MOVIE]); expect(await trailerService.localTrailerSource(MOVIE)).toEqual({ localPath: resolve(valid) });
    } finally { await rm(root, { recursive: true, force: true }); await rm(`${root}-outside.mp4`, { force: true }); }
  });
});

describe('CatalogService plugin events', () => {
  let client: PGlite;
  let database: Database;
  let bus: PluginEventBus;
  let service: CatalogService;
  const seen: Array<{ event: string; payload: Record<string, unknown> }> = [];

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    seen.length = 0;
    bus = new PluginEventBus({ log: { error: vi.fn(), warn: vi.fn() } });
    for (const event of ['media.item.archived', 'media.item.unarchived', 'media.item.removed', 'playback.progress.updated'] as const) {
      bus.subscribe('spy', event, (name, payload) => { seen.push({ event: name, payload: payload as Record<string, unknown> }); });
    }
    service = new CatalogService(database, undefined, bus);
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'movie', 'movie:one:2020', 'One', 'one')`, [MOVIE, LIB]);
    await client.query(`insert into users (id, username, password_hash, role) values ($1, 'viewer', 'x', 'member')`, [USER]);
  });

  afterEach(async () => { await client.close(); });

  it('emits availability changes only when the state actually changes', async () => {
    await service.archiveItem(MOVIE);
    await service.archiveItem(MOVIE);
    await service.unarchiveItem(MOVIE);
    await service.unarchiveItem(MOVIE);
    await bus.drain();

    expect(seen.map((entry) => entry.event)).toEqual(['media.item.archived', 'media.item.unarchived']);
  });

  it('serves the intro marker for an item through its available file', async () => {
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at) values ($1, $2, $3, 'One.mkv', 1, now())`, [FILE, MOVIE, LIB]);
    await client.query(`insert into media_intro_markers (media_file_id, start_seconds, end_seconds, signature) values ($1, 12.5, 71, 'sig')`, [FILE]);

    expect(await service.introMarker(MOVIE)).toMatchObject({ startSeconds: 12.5, endSeconds: 71 });
    expect(await service.introMarker(REC)).toBeNull();
  });

  it('emits progress updates and removals', async () => {
    await service.saveProgress(USER, MOVIE, 120, false);
    await service.removeItem(MOVIE);
    await bus.drain();

    expect(seen).toEqual([
      { event: 'playback.progress.updated', payload: { userId: USER, mediaItemId: MOVIE, positionSeconds: 120, watched: false } },
      { event: 'media.item.removed', payload: { mediaItemId: MOVIE } },
    ]);
  });
});

describe('home row limits', () => {
  it('caps every carousel at 25 items', async () => {
    const client = new PGlite('memory://');
    const database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB]);
    await client.query(`insert into users (id, username, password_hash, role) values ($1, 'viewer', 'x', 'member')`, [USER]);
    for (let index = 0; index < 30; index++) {
      await client.query(
        `insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'movie', $3, $4, $5)`,
        [`20000000-0000-4000-8000-0000000010${String(index).padStart(2, '0')}`, LIB, `movie:${index}`, `Movie ${index}`, `movie ${String(index).padStart(2, '0')}`]);
    }

    const home = await new CatalogService(database).home(undefined, USER);

    expect(home.sections.length).toBeGreaterThan(0);
    for (const section of home.sections) expect(section.items.length).toBeLessThanOrEqual(25);
    expect(home.sections.find((section) => section.id === 'newly-added')?.items).toHaveLength(25);
    await client.close();
  });
});

describe('managed trailer paths', () => {
  it('rejects persisted paths outside the configured trailer root', () => {
    expect(managedTrailerPath('C:\\config\\trailers', 'C:\\config\\trailers\\movie.mp4')).toBe(true);
    expect(managedTrailerPath('C:\\config\\trailers', 'C:\\config\\secrets.txt')).toBe(false);
  });
});

describe('CatalogService movie deck', () => {
  let client: PGlite;
  let service: CatalogService;
  const LIB2 = '10000000-0000-4000-8000-000000000002';
  const A = '20000000-0000-4000-8000-000000000011';
  const B = '20000000-0000-4000-8000-000000000012';
  const C = '20000000-0000-4000-8000-000000000013';
  const SERIES = '20000000-0000-4000-8000-000000000014';
  const FILE_A = '30000000-0000-4000-8000-000000000011';
  const VIEWER = '70000000-0000-4000-8000-000000000002';
  const G = '40000000-0000-4000-8000-000000000002';

  beforeEach(async () => {
    client = new PGlite('memory://');
    const database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    service = new CatalogService(database);
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB2]);
    await client.query(`insert into users (id, username, password_hash, role) values ($1, 'viewer', 'x', 'member')`, [VIEWER]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year, overview, provider_rating, poster_path, maturity_level) values ($1, $2, 'movie', 'movie:a:2001', 'Alpha', 'alpha', 2001, 'First', 8.1, '/a.jpg', 1)`, [A, LIB2]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year, provider_rating, maturity_level) values ($1, $2, 'movie', 'movie:b:2015', 'Beta', 'beta', 2015, 6.0, 4)`, [B, LIB2]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year, provider_rating) values ($1, $2, 'movie', 'movie:c:2020', 'Gamma', 'gamma', 2020, 7.0)`, [C, LIB2]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year) values ($1, $2, 'series', 'series:s', 'Show', 'show', 2020)`, [SERIES, LIB2]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at, duration_seconds) values ($1, $2, $3, 'A.mkv', 1, now(), 5400)`, [FILE_A, A, LIB2]);
    await client.query(`insert into genres (id, library_id, provider_id, name, normalized_name) values ($1, $2, '1', 'Drama', 'drama')`, [G, LIB2]);
    await client.query(`insert into media_item_genres (media_item_id, genre_id, position) values ($1, $2, 0)`, [A, G]);
    await client.query(`insert into playback_progress (user_id, media_item_id, watched) values ($1, $2, true)`, [VIEWER, B]);
  });
  afterEach(async () => { await client.close(); });

  it('lists top-level movies as cards with runtime and rating', async () => {
    const cards = await service.listMovieCards({});
    expect(cards.map((card) => card.title).sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(cards.find((card) => card.id === A)).toEqual({ id: A, title: 'Alpha', year: 2001, posterUrl: '/api/v1/images/a.jpg', rating: 8.1, overview: 'First', runtimeMinutes: 90 });
    expect(await service.countMovieCards({})).toBe(3);
  });

  it('applies genre, year, rating and unwatched filters', async () => {
    expect((await service.listMovieCards({ genre: 'drama' })).map((c) => c.id)).toEqual([A]);
    expect((await service.listMovieCards({ yearMin: 2010, yearMax: 2016 })).map((c) => c.id)).toEqual([B]);
    expect((await service.listMovieCards({ ratingMin: 7 })).map((c) => c.id).sort()).toEqual([A, C].sort());
    expect((await service.listMovieCards({ unwatchedOnly: true }, VIEWER)).map((c) => c.id).sort()).toEqual([A, C].sort());
    expect(await service.countMovieCards({ unwatchedOnly: true }, VIEWER)).toBe(2);
  });

  it('respects the viewer maturity limit', async () => {
    const limited = service.forViewer(2);
    // Gamma is unrated and therefore hidden from a restricted viewer.
    expect((await limited.listMovieCards({})).map((c) => c.id)).toEqual([A]);
  });
});
