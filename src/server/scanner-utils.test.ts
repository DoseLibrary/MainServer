import { describe, expect, it, vi } from 'vitest';
import { Semaphore } from './concurrency.ts';
import { parseMediaPath } from './media-parser.ts';
import { TmdbClient } from './tmdb.ts';
import { serializeCatalogChildren, toCatalogItem } from './catalog-service.ts';
import { missingFilePredicate } from './scanner.ts';
import { createDatabase } from './db/client.ts';
import { mediaFiles, mediaItems } from './db/schema.ts';

type MediaItem = typeof mediaItems.$inferSelect;

function mediaItemFixture(overrides: Partial<MediaItem> = {}): MediaItem {
  const now = new Date();
  return {
    id: 'i',
    libraryId: 'l',
    parentId: null,
    kind: 'movie',
    naturalKey: 'movie:x:',
    title: 'X',
    sortTitle: 'x',
    originalTitle: null,
    year: null,
    releaseDate: null,
    seasonNumber: null,
    episodeNumber: null,
    overview: null,
    tagline: null,
    providerRating: null,
    contentRating: null,
    userTitle: null,
    userYear: null,
    userOverview: null,
    posterPath: null,
    backdropPath: null,
    logoPath: null,
    metadataSource: null,
    providerIds: {},
    enrichmentVersion: 0,
    enrichmentLastAttemptAt: null,
    enrichmentLastSuccessAt: null,
    available: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('scanner utilities', () => {
  it('parses common movie and episode names into stable identities', () => {
    expect(parseMediaPath('Dune.Part.Two.2024.mkv', 'movies')).toMatchObject({ type: 'movie', title: 'Dune Part Two', year: 2024, key: 'movie:dune part two:2024' });
    expect(parseMediaPath('The Bear/Season 02/The.Bear.S02E03.Sundae.mkv', 'shows')).toMatchObject({ type: 'episode', series: 'The Bear', season: 2, episode: 3, title: 'Sundae' });
  });
  it('enforces bounded concurrency', async () => {
    const limit = new Semaphore(2); let active = 0; let peak = 0; let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tasks = Array.from({ length: 5 }, () => limit.run(async () => { active++; peak = Math.max(peak, active); await gate; active--; }));
    await Promise.resolve(); expect(peak).toBe(2); release(); await Promise.all(tasks); expect(peak).toBe(2);
  });
  it('deduplicates TMDB requests and honors Retry-After', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } })).mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: 10, title: 'Dune' }] }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: 10, title: 'Dune', overview: 'Desert.' }), { status: 200 }));
    const sleep = vi.fn(async () => undefined); let now = 0;
    const client = new TmdbClient('token', 2, 50, 1000, fetcher, sleep, () => now++);
    const [a, b] = await Promise.all([client.find('movie', 'Dune', 2021), client.find('movie', 'Dune', 2021)]);
    expect(a).toEqual(b); expect(fetcher).toHaveBeenCalledTimes(3); expect(sleep).toHaveBeenCalledWith(2000);
  });
  it('does not retry permanent TMDB failures', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 401 })); const client = new TmdbClient('bad', 1, 8, 1000, fetcher, async () => undefined);
    expect(await client.find('movie', 'Nope')).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('drops malformed TMDB responses and does not poison the request cache', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{', { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const client = new TmdbClient('token', 1, 50, 1000, fetcher, async () => undefined);
    expect(await client.find('movie', 'Broken')).toBeNull(); expect(await client.find('movie', 'Broken')).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('emits the frontend catalog artwork and numeric progress contract', () => {
    const now = new Date(); const item = mediaItemFixture({ posterPath: '/p.jpg', backdropPath: '/b.jpg', metadataSource: 'tmdb', createdAt: now, updatedAt: now });
    const progress = { userId: 'u', mediaItemId: 'i', positionSeconds: 50, watched: false, lastWatchedAt: now, updatedAt: now };
    expect(toCatalogItem(item, progress, 100)).toMatchObject({ posterUrl: '/api/v1/images/p.jpg', backdropUrl: '/api/v1/images/b.jpg', progress: 0.5 });
    expect(toCatalogItem(item, { ...progress, positionSeconds: 200 }, 100).progress).toBe(1);
  });
  it('serializes ordered series seasons and season episodes through the wire contract', () => {
    const now = new Date(); const base = mediaItemFixture({ id: 'season-1', parentId: 'series', kind: 'season', naturalKey: 'season:1', title: 'Season 1', sortTitle: '001', seasonNumber: 1, posterPath: '/season.jpg', createdAt: now, updatedAt: now });
    const seasons = serializeCatalogChildren([{ item: base, progress: null }], new Map()); expect(seasons[0]).toMatchObject({ kind: 'season', seasonNumber: 1, posterUrl: '/api/v1/images/season.jpg' });
    const episode = { ...base, id: 'episode-1', parentId: 'season-1', kind: 'episode' as const, naturalKey: 'episode:1', title: 'Pilot', episodeNumber: 1, posterPath: '/episode.jpg' };
    const progress = { userId: 'u', mediaItemId: episode.id, positionSeconds: 25, watched: false, lastWatchedAt: now, updatedAt: now };
    expect(serializeCatalogChildren([{ item: episode, progress }], new Map([[episode.id, 100]]))[0]).toMatchObject({ kind: 'episode', episodeNumber: 1, progress: 0.25, posterUrl: '/api/v1/images/episode.jpg' });
  });
  it('marks missing files with a constant-size scan generation query beyond 65k paths', async () => {
    const conceptualPaths = 70_000; expect(conceptualPaths).toBeGreaterThan(65_535);
    const connection = createDatabase({ DATABASE_URL: 'postgresql://unused:unused@localhost/unused' }); const { database } = connection;
    const query = database.update(mediaFiles).set({ available: false }).where(missingFilePredicate('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')).toSQL();
    expect(query.sql.toLowerCase()).not.toContain(' not in '); expect(query.params).toHaveLength(3); await connection.close();
  });
});
